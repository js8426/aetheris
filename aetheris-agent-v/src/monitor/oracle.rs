// Aetheris\aetheris-agent-v\src\monitor\oracle.rs

/// monitor/oracle.rs — Chainlink vs Pyth oracle divergence checker
///
/// Every block, reads the latest ETH/USD price from both:
///   - Chainlink ETH/USD aggregator on Base (latestRoundData())
///   - Pyth ETH/USD price feed on Base (getPriceUnsafe())
///
/// If the two prices diverge by more than the configured threshold (default 5%),
/// emits an OracleManipulationPrecursor threat report.
///
/// Price divergence of this magnitude in a single block is characteristic of
/// flash loan-based oracle manipulation attempts.

use anyhow::{anyhow, Result};
use tracing::{debug, warn};

use crate::detector::{self, ThreatReport};
use crate::rpc::RpcProvider;

/// Chainlink AggregatorV3Interface latestRoundData() selector
/// keccak256("latestRoundData()")[0..4] = 0xfeaf968c
const CHAINLINK_LATEST_ROUND_SELECTOR: &str = "0xfeaf968c";

/// Pyth getPriceUnsafe(bytes32) selector
/// keccak256("getPriceUnsafe(bytes32)")[0..4] = 0xd8ffabe4
const PYTH_GET_PRICE_UNSAFE_SELECTOR: &str = "0xd8ffabe4";

/// Result of a dual oracle price check.
pub struct OracleCheckResult {
    /// Chainlink price scaled to 8 decimals
    pub chainlink_price: Option<u128>,
    /// Pyth price (normalised to 8 decimals for comparison)
    pub pyth_price: Option<u128>,
    /// Divergence in basis points (None if either price unavailable)
    pub divergence_bps: Option<u64>,
    /// Any detected threat
    pub threat: Option<ThreatReport>,
}

/// Check Chainlink and Pyth prices for ETH/USD and detect divergence.
///
/// # Arguments
/// * `rpc` - RPC provider for eth_call
/// * `chainlink_addr` - Chainlink ETH/USD aggregator address
/// * `pyth_addr` - Pyth contract address
/// * `pyth_feed_id` - ETH/USD feed ID (bytes32 hex)
/// * `threshold_bps` - Alert threshold (e.g. 500 = 5%)
/// * `block_number` - Current block for threat report
/// * `timestamp` - Current timestamp
pub async fn check_oracle_divergence(
    rpc: &RpcProvider,
    chainlink_addr: &str,
    pyth_addr: &str,
    pyth_feed_id: &str,
    threshold_bps: u64,
    block_number: u64,
    timestamp: i64,
) -> OracleCheckResult {
    let chainlink_price = fetch_chainlink_price(rpc, chainlink_addr).await;
    let pyth_price = fetch_pyth_price(rpc, pyth_addr, pyth_feed_id).await;

    match (chainlink_price, pyth_price) {
        (Ok(cl_price), Ok(py_price)) => {
            debug!(
                "Oracle prices: Chainlink={} Pyth={} (8 decimals)",
                cl_price, py_price
            );

            let divergence_bps = compute_divergence_bps(cl_price, py_price);

            if divergence_bps > threshold_bps {
                warn!(
                    "Oracle divergence: {}bps (threshold={}bps)",
                    divergence_bps, threshold_bps
                );
                let threat = Some(detector::classify_oracle_divergence(
                    block_number,
                    timestamp,
                    chainlink_addr,
                    cl_price,
                    py_price,
                    divergence_bps,
                    threshold_bps,
                ));
                OracleCheckResult {
                    chainlink_price: Some(cl_price),
                    pyth_price: Some(py_price),
                    divergence_bps: Some(divergence_bps),
                    threat,
                }
            } else {
                OracleCheckResult {
                    chainlink_price: Some(cl_price),
                    pyth_price: Some(py_price),
                    divergence_bps: Some(divergence_bps),
                    threat: None,
                }
            }
        }
        (Err(e1), _) => {
            warn!("Failed to read Chainlink price: {}", e1);
            OracleCheckResult {
                chainlink_price: None,
                pyth_price: None,
                divergence_bps: None,
                threat: None,
            }
        }
        (_, Err(e2)) => {
            warn!("Failed to read Pyth price: {}", e2);
            OracleCheckResult {
                chainlink_price: None,
                pyth_price: None,
                divergence_bps: None,
                threat: None,
            }
        }
    }
}

/// Fetch the latest ETH/USD price from Chainlink aggregator.
/// Calls latestRoundData() and returns the answer field (8 decimals).
async fn fetch_chainlink_price(rpc: &RpcProvider, chainlink_addr: &str) -> Result<u128> {
    let result = rpc
        .call_raw(
            "eth_call",
            serde_json::json!([
                {
                    "to": chainlink_addr,
                    "data": CHAINLINK_LATEST_ROUND_SELECTOR
                },
                "latest"
            ]),
        )
        .await?;

    let hex = result
        .as_str()
        .ok_or_else(|| anyhow!("Chainlink response is not a string"))?;

    // latestRoundData returns: (uint80 roundId, int256 answer, uint256 startedAt,
    //                           uint256 updatedAt, uint80 answeredInRound)
    // Each value is 32 bytes. answer is at offset 32 (bytes 32-63 of the response).
    let hex = hex.strip_prefix("0x").unwrap_or(hex);
    if hex.len() < 128 {
        return Err(anyhow!("Chainlink response too short: {} chars", hex.len()));
    }

    // Second 32-byte word (offset 32 bytes = 64 hex chars) = answer
    let answer_hex = &hex[64..128];
    let price = u128::from_str_radix(answer_hex, 16)
        .map_err(|e| anyhow!("Failed to parse Chainlink answer: {}", e))?;

    Ok(price)
}

/// Fetch the latest ETH/USD price from Pyth.
/// Calls getPriceUnsafe(bytes32 id) and normalises to 8 decimals.
async fn fetch_pyth_price(rpc: &RpcProvider, pyth_addr: &str, feed_id: &str) -> Result<u128> {
    // Encode call: getPriceUnsafe(bytes32)
    // calldata = selector (4 bytes) + feed_id (32 bytes)
    let feed_id_hex = feed_id.strip_prefix("0x").unwrap_or(feed_id);
    let calldata = format!(
        "{}{}",
        PYTH_GET_PRICE_UNSAFE_SELECTOR.strip_prefix("0x").unwrap_or(PYTH_GET_PRICE_UNSAFE_SELECTOR),
        format!("{:0>64}", feed_id_hex)
    );

    let result = rpc
        .call_raw(
            "eth_call",
            serde_json::json!([
                {
                    "to": pyth_addr,
                    "data": format!("0x{}", calldata)
                },
                "latest"
            ]),
        )
        .await?;

    let hex = result
        .as_str()
        .ok_or_else(|| anyhow!("Pyth response is not a string"))?;

    // Pyth Price struct:
    //   int64 price       — at offset 0
    //   uint64 conf       — at offset 8
    //   int32 expo        — at offset 16  (negative, e.g. -8)
    //   uint publishTime  — at offset 20
    //
    // In ABI encoding (each field padded to 32 bytes):
    //   word 0: price (int64, right-aligned in 32 bytes)
    //   word 1: conf
    //   word 2: expo (int32)
    //   word 3: publishTime
    let hex = hex.strip_prefix("0x").unwrap_or(hex);
    if hex.len() < 256 {
        return Err(anyhow!("Pyth response too short"));
    }

    // Word 0: price (int64 padded to 32 bytes, treat as i128 for safety)
    let price_hex = &hex[0..64];
    let price_raw = i128::from_str_radix(price_hex, 16)
        .map_err(|e| anyhow!("Failed to parse Pyth price: {}", e))?;

    // Word 2: expo (int32)
    let expo_hex = &hex[128..192];
    let expo_raw = i32::from_str_radix(expo_hex, 16)
        .map_err(|e| anyhow!("Failed to parse Pyth expo: {}", e))?;

    // Normalise to 8 decimals (Chainlink standard)
    // Pyth price = price_raw * 10^expo
    // We want: price * 10^8
    // So: normalised = price_raw * 10^(8 + expo)
    let target_exp: i32 = 8;
    let shift = target_exp + expo_raw;

    let normalised = if shift >= 0 {
        let factor = 10_u128.pow(shift as u32);
        (price_raw.unsigned_abs()) * factor
    } else {
        let divisor = 10_u128.pow((-shift) as u32);
        (price_raw.unsigned_abs()) / divisor
    };

    Ok(normalised)
}

/// Compute price divergence in basis points between two prices.
/// divergence_bps = |p1 - p2| / max(p1, p2) * 10000
fn compute_divergence_bps(p1: u128, p2: u128) -> u64 {
    if p1 == 0 || p2 == 0 {
        return 0;
    }
    let diff = if p1 > p2 { p1 - p2 } else { p2 - p1 };
    let max_price = p1.max(p2);
    // Avoid overflow: diff * 10000 / max_price
    // Use u128 — prices are at most ~1e13 (for ETH at $100k with 8 decimals)
    ((diff * 10_000) / max_price) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_divergence_bps_zero() {
        assert_eq!(compute_divergence_bps(100_000_00, 100_000_00), 0);
    }

    #[test]
    fn test_divergence_bps_five_percent() {
        // 5% divergence = 500 bps
        assert_eq!(compute_divergence_bps(100_000, 95_000), 500);
    }

    #[test]
    fn test_divergence_bps_ten_percent() {
        assert_eq!(compute_divergence_bps(100_000, 90_000), 1000);
    }
}
