// Aetherisetheris-agent-v\src\rpc\multicall.rs

/// rpc/multicall.rs — Batched storage slot reads via Multicall3
///
/// Reads ALL watched storage slots in a SINGLE eth_call to Multicall3.
/// This is critical for Agent V's speed requirement: doing individual
/// eth_getStorageAt calls per slot would be 20-50x slower and would
/// consume Alchemy CU budget rapidly.
///
/// Multicall3 aggregate3 ABI:
///   function aggregate3(Call3[] calldata calls)
///       returns (Result[] memory returnData)
///
///   struct Call3 { address target; bool allowFailure; bytes callData; }
///   struct Result { bool success; bytes returnData; }
///
/// For storage reads, we encode eth_getStorageAt calls using getStorageAt
/// which is NOT a standard function. Instead, we use the eth_call approach:
/// encode a call to a helper that returns the storage slot value.
///
/// The correct approach for Multicall3 + storage reads:
/// Use the standard `eth_getStorageAt` JSON-RPC per slot BUT batch them
/// using JSON-RPC batch requests (array of requests in one HTTP call).
/// This is more universal and equally fast for our scale (< 50 slots).

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{debug, warn};

/// A single storage slot read request.
#[derive(Debug, Clone)]
pub struct SlotReadRequest {
    pub contract_address: String,
    pub slot_key: String,
}

/// Result of a storage slot read.
#[derive(Debug, Clone)]
pub struct SlotReadResult {
    pub contract_address: String,
    pub slot_key: String,
    /// Hex-encoded bytes32 value, or None if the read failed
    pub value: Option<String>,
}

/// JSON-RPC batch request item for eth_getStorageAt
#[derive(Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    id: usize,
    method: &'static str,
    params: (String, String, String),
}

/// JSON-RPC response item
#[derive(Deserialize, Debug)]
struct JsonRpcResponse {
    id: usize,
    result: Option<String>,
    error: Option<JsonRpcError>,
}

#[derive(Deserialize, Debug)]
struct JsonRpcError {
    message: String,
}

/// Executes a batched JSON-RPC request to read multiple storage slots
/// in a single HTTP call. Uses eth_getStorageAt per slot but sends all
/// requests as a JSON array (JSON-RPC batch).
///
/// # Arguments
/// * `http_url` - HTTP RPC endpoint URL
/// * `requests` - List of (contract_address, slot_key) pairs to read
/// * `block_tag` - Block to read at, typically "latest"
///
/// # Returns
/// HashMap of (contract_address::slot_key) → hex_value
pub async fn batch_read_storage_slots(
    client: &reqwest::Client,
    http_url: &str,
    requests: &[SlotReadRequest],
    block_tag: &str,
) -> Result<Vec<SlotReadResult>> {
    if requests.is_empty() {
        return Ok(Vec::new());
    }

    // Build JSON-RPC batch
    let batch: Vec<JsonRpcRequest> = requests
        .iter()
        .enumerate()
        .map(|(i, req)| JsonRpcRequest {
            jsonrpc: "2.0",
            id: i,
            method: "eth_getStorageAt",
            params: (req.contract_address.clone(), req.slot_key.clone(), block_tag.to_string()),
        })
        .collect();

    debug!(
        "Sending batch storage read: {} slots across {} contracts",
        requests.len(),
        requests.iter().map(|r| &r.contract_address).collect::<std::collections::HashSet<_>>().len()
    );

    let response = client
        .post(http_url)
        .json(&batch)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| anyhow!("Batch RPC request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(anyhow!(
            "Batch RPC returned HTTP {}: {}",
            response.status(),
            response.text().await.unwrap_or_default()
        ));
    }

    let responses: Vec<JsonRpcResponse> = response
        .json()
        .await
        .map_err(|e| anyhow!("Failed to parse batch RPC response: {}", e))?;

    // Build a map from id → result
    let mut result_map: HashMap<usize, Option<String>> = HashMap::new();
    for resp in &responses {
        if let Some(err) = &resp.error {
            warn!(
                "Storage read error for slot (id={}): {}",
                resp.id, err.message
            );
            result_map.insert(resp.id, None);
        } else {
            result_map.insert(resp.id, resp.result.clone());
        }
    }

    // Reconstruct results in original request order
    let results = requests
        .iter()
        .enumerate()
        .map(|(i, req)| SlotReadResult {
            contract_address: req.contract_address.clone(),
            slot_key: req.slot_key.clone(),
            value: result_map.get(&i).cloned().flatten(),
        })
        .collect();

    Ok(results)
}

/// Normalises a raw bytes32 hex value from eth_getStorageAt to lowercase.
/// Handles both 0x-prefixed and non-prefixed strings.
/// Returns "0x" + 64 hex chars.
pub fn normalise_slot_value(raw: &str) -> String {
    let stripped = raw.strip_prefix("0x").unwrap_or(raw).to_lowercase();
    format!("0x{:0>64}", stripped)
}

/// Returns true if the value represents the zero/empty slot
/// (all zeros = unset).
pub fn is_zero_value(value: &str) -> bool {
    let normalised = normalise_slot_value(value);
    normalised == "0x0000000000000000000000000000000000000000000000000000000000000000"
}

/// Extracts an Ethereum address from a bytes32 storage slot value.
/// The address occupies the rightmost 20 bytes (40 hex chars).
pub fn extract_address_from_slot(value: &str) -> String {
    let normalised = normalise_slot_value(value);
    // Last 40 hex chars = 20 bytes = address
    let hex = normalised.strip_prefix("0x").unwrap_or(&normalised);
    format!("0x{}", &hex[24..64])
}
