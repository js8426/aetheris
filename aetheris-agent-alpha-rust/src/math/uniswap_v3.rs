/// Aetheris\aetheris-agent-alpha-rust\src\math\uniswap_v3.rs
///
/// LOCAL Uniswap V3 price math — compute amountOut from pool state
/// (sqrtPriceX96, liquidity, fee) with ZERO RPC calls per scan.
///
/// This is the core speed advantage over the Python bot:
/// Python: 1 eth_call to Quoter per (pair × fee tier) = ~24 RPC round trips
/// Rust:   read pool state once per block via Multicall3, compute locally
///
/// Precision:
/// We use f64 for scanning. sqrtPriceX96 can be up to ~2^121; f64 has 53-bit
/// mantissa giving ~15 significant decimal digits. For a $100,000 trade the
/// relative error is < 0.000001%, well below any meaningful threshold.
/// All execution paths use eth_call simulation before sending any tx.
///
/// Formulas derived from Uniswap V3 whitepaper §6.2.

/// Q96 constant = 2^96 (the fixed-point denominator for sqrtPriceX96)
const Q96: f64 = 7.922816251426434e28; // 2^96

/// Compute amountOut of token1 when swapping amountIn of token0.
///
/// Token0 → Token1 means price decreases (sqrtP moves left).
/// Valid for swaps that stay within a single tick range (i.e. small relative
/// to the liquidity depth at the current tick — the common case for arb).
///
/// # Parameters
/// - `sqrt_price_x96`: current pool sqrtPriceX96 (U160 cast to u128 is fine
///   for Base Sepolia prices; for very-high-price cbBTC pools pass as f64)
/// - `liquidity`: current tick liquidity (uint128)
/// - `amount_in`: token0 input in raw token units (before fee)
/// - `fee_ppm`: fee in parts-per-million (e.g. 3000 for 0.3%)
///
/// Returns amount of token1 out in raw token units, or 0.0 if pool is empty.
#[inline]
pub fn amount_out_token1(
    sqrt_price_x96: f64,
    liquidity: f64,
    amount_in: f64,
    fee_ppm: u32,
) -> f64 {
    if liquidity == 0.0 || sqrt_price_x96 == 0.0 {
        return 0.0;
    }
    // Deduct fee
    let amount_in_adj = amount_in * (1_000_000.0 - fee_ppm as f64) / 1_000_000.0;
    if amount_in_adj <= 0.0 {
        return 0.0;
    }

    // New sqrtPrice after consuming amount_in_adj of token0:
    //   sqrtP_next = sqrtP * L * Q96 / (L * Q96 + amountIn * sqrtP)
    let numerator   = sqrt_price_x96 * liquidity;
    let denominator = liquidity + amount_in_adj * sqrt_price_x96 / Q96;
    if denominator <= 0.0 {
        return 0.0;
    }
    let sqrt_p_next = numerator / denominator;

    // amount_out_token1 = L * (sqrtP - sqrtP_next) / Q96
    let delta_sqrt = sqrt_price_x96 - sqrt_p_next;
    if delta_sqrt <= 0.0 {
        return 0.0;
    }
    liquidity * delta_sqrt / Q96
}

/// Compute amountOut of token0 when swapping amountIn of token1.
///
/// Token1 → Token0 means price increases (sqrtP moves right).
#[inline]
pub fn amount_out_token0(
    sqrt_price_x96: f64,
    liquidity: f64,
    amount_in: f64,
    fee_ppm: u32,
) -> f64 {
    if liquidity == 0.0 || sqrt_price_x96 == 0.0 {
        return 0.0;
    }
    let amount_in_adj = amount_in * (1_000_000.0 - fee_ppm as f64) / 1_000_000.0;
    if amount_in_adj <= 0.0 {
        return 0.0;
    }

    // New sqrtPrice after consuming amount_in_adj of token1:
    //   sqrtP_next = sqrtP + amountIn * Q96 / L
    let sqrt_p_next = sqrt_price_x96 + amount_in_adj * Q96 / liquidity;

    // amount_out_token0 = L * Q96 * (sqrtP_next - sqrtP) / (sqrtP * sqrtP_next)
    let delta_sqrt = sqrt_p_next - sqrt_price_x96;
    liquidity * Q96 * delta_sqrt / (sqrt_price_x96 * sqrt_p_next)
}

/// High-level: compute amountOut given pool state and swap direction.
///
/// `zero_for_one` = true means we're selling token0 to buy token1.
/// Token ordering follows Uniswap V3 convention: token0 < token1 by address.
#[inline]
pub fn compute_amount_out(
    sqrt_price_x96: f64,
    liquidity: f64,
    amount_in: f64,
    fee_ppm: u32,
    zero_for_one: bool,
) -> f64 {
    if zero_for_one {
        amount_out_token1(sqrt_price_x96, liquidity, amount_in, fee_ppm)
    } else {
        amount_out_token0(sqrt_price_x96, liquidity, amount_in, fee_ppm)
    }
}

/// Apply slippage buffer to a quoted amount (same as Python apply_slippage).
/// Returns floor((amount * (10_000 - bps)) / 10_000).
#[inline]
pub fn apply_slippage(amount: u128, slippage_bps: u64) -> u128 {
    amount * (10_000 - slippage_bps) as u128 / 10_000
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify round-trip sanity: for a very small swap the output should be
    /// approximately price * input (minus fee).
    /// Pool: USDC/WETH, 1 WETH ≈ 3000 USDC.
    /// token0=USDC(6 dec), token1=WETH(18 dec)
    /// price (token1/token0) = (1e18 WETH_raw / 3000e6 USDC_raw) ≈ 333333
    /// sqrtP = sqrt(333333) * Q96 ≈ 577.0 * Q96
    #[test]
    fn test_usdc_to_weth_tiny_swap() {
        let price_ratio: f64 = 1e18 / 3000e6; // raw token1 per token0
        let sqrt_p = price_ratio.sqrt() * Q96;
        let liquidity: f64 = 1e20;               // arbitrary large liquidity
        let amount_in_usdc_raw = 1000e6_f64;      // 1000 USDC in raw units
        let fee_ppm = 500u32;                     // 0.05% fee tier

        let weth_out = amount_out_token1(sqrt_p, liquidity, amount_in_usdc_raw, fee_ppm);
        let weth_out_human = weth_out / 1e18;
        let expected_weth = 1000.0 / 3000.0; // ~0.3333 WETH

        // Should be within 0.1% of expected (ignoring fee for large liquidity)
        let err = (weth_out_human - expected_weth * (1.0 - fee_ppm as f64 / 1e6)).abs()
            / expected_weth;
        assert!(err < 0.001, "USDC→WETH error {:.6}%", err * 100.0);
    }

    #[test]
    fn test_weth_to_usdc_tiny_swap() {
        let price_ratio: f64 = 1e18 / 3000e6;
        let sqrt_p = price_ratio.sqrt() * Q96;
        let liquidity: f64 = 1e20;
        let amount_in_weth_raw = (1.0 / 3.0) * 1e18; // ~0.333 WETH
        let fee_ppm = 500u32;

        let usdc_out = amount_out_token0(sqrt_p, liquidity, amount_in_weth_raw, fee_ppm);
        let usdc_out_human = usdc_out / 1e6;
        // Expect ~333.3 USDC (0.333 WETH * 3000 USDC/WETH * (1 - fee))
        let expected = (1.0 / 3.0) * 3000.0 * (1.0 - fee_ppm as f64 / 1e6);
        let err = (usdc_out_human - expected).abs() / expected;
        assert!(err < 0.001, "WETH→USDC error {:.6}%", err * 100.0);
    }

    #[test]
    fn test_empty_pool_returns_zero() {
        assert_eq!(amount_out_token1(0.0, 0.0, 1000.0, 500), 0.0);
        assert_eq!(amount_out_token0(1e30, 0.0, 1000.0, 500), 0.0);
    }

    #[test]
    fn test_slippage() {
        // 30 bps slippage on 10000 units → 9970
        assert_eq!(apply_slippage(10_000, 30), 9970);
    }
}
