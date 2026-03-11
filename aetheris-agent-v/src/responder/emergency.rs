// Aetherisetheris-agent-v\src\responder\emergency.rs

/// responder/emergency.rs — Emergency on-chain response executor
///
/// When Agent V detects a Critical or High threat, this module:
///   1. Calls AgentBeta.emergencyReturn() — pulls idle USDC back to guardian
///   2. Calls AgentAlpha.pause()         — stops Alpha from firing new trades
///   3. Calls AetherisVault.pause()      — stops vault deposits
///
/// All calls are signed by the BUNDLER_PRIVATE_KEY wallet.
/// The guardian wallet must have the GUARDIAN_ROLE on all three contracts.
///
/// We use raw JSON-RPC (eth_sendRawTransaction) rather than ethers-rs high-level
/// abstractions to keep this minimal and fast.

use anyhow::{anyhow, Result};
use ethers::{
    core::{
        k256::ecdsa::SigningKey,
        types::{transaction::eip2718::TypedTransaction, Address, Bytes, TransactionRequest, U256},
        utils::keccak256,
    },
    signers::{LocalWallet, Signer},
};
use std::str::FromStr;
use tracing::{info, warn};

use crate::config::Config;
use crate::rpc::RpcProvider;

/// Keccak4 function selectors for the emergency functions
/// keccak256("pause()")[0..4]
const PAUSE_SELECTOR: [u8; 4] = [0x8d, 0xa5, 0xcb, 0x5b]; // This is wrong — computed below
/// keccak256("emergencyReturn()")[0..4]
const EMERGENCY_RETURN_SELECTOR: [u8; 4] = [0x00, 0x00, 0x00, 0x00]; // Computed at runtime

/// The result of executing an emergency response.
pub struct EmergencyResult {
    pub alpha_pause_tx: Option<String>,
    pub beta_emergency_return_tx: Option<String>,
    pub vault_pause_tx: Option<String>,
}

/// Execute all emergency responses for a Critical threat.
///
/// Returns the transaction hashes for each action taken.
/// Continues even if individual calls fail (logs errors and attempts all three).
pub async fn execute_emergency_responses(
    config: &Config,
    rpc: &RpcProvider,
) -> Result<EmergencyResult> {
    info!("Executing emergency responses: pause Alpha, emergencyReturn Beta, pause Vault");

    let wallet = LocalWallet::from_str(&config.bundler_private_key)
        .map_err(|e| anyhow!("Invalid guardian private key: {}", e))?
        .with_chain_id(8453u64); // Base mainnet

    // Compute correct selectors at runtime
    let pause_sel = &keccak256(b"pause()")[..4];
    let emergency_return_sel = &keccak256(b"emergencyReturn()")[..4];

    // Fetch nonce for guardian wallet
    let guardian_addr = format!("{:?}", wallet.address());
    let nonce = fetch_nonce(rpc, &guardian_addr).await?;
    let gas_price = fetch_gas_price(rpc).await?;

    let mut result = EmergencyResult {
        alpha_pause_tx: None,
        beta_emergency_return_tx: None,
        vault_pause_tx: None,
    };

    // 1. AgentBeta.emergencyReturn() — highest priority: pull capital out
    match send_emergency_tx(
        rpc,
        &wallet,
        &config.agent_beta_addr,
        emergency_return_sel,
        nonce,
        gas_price,
    )
    .await
    {
        Ok(tx_hash) => {
            info!("AgentBeta.emergencyReturn() submitted: {}", tx_hash);
            result.beta_emergency_return_tx = Some(tx_hash);
        }
        Err(e) => {
            warn!("AgentBeta.emergencyReturn() failed: {}", e);
        }
    }

    // 2. AgentAlpha.pause() — stop new arbitrage trades
    match send_emergency_tx(
        rpc,
        &wallet,
        &config.agent_alpha_addr,
        pause_sel,
        nonce + 1,
        gas_price,
    )
    .await
    {
        Ok(tx_hash) => {
            info!("AgentAlpha.pause() submitted: {}", tx_hash);
            result.alpha_pause_tx = Some(tx_hash);
        }
        Err(e) => {
            warn!("AgentAlpha.pause() failed: {}", e);
        }
    }

    // 3. AetherisVault.pause() — stop vault deposits
    match send_emergency_tx(
        rpc,
        &wallet,
        &config.vault_addr,
        pause_sel,
        nonce + 2,
        gas_price,
    )
    .await
    {
        Ok(tx_hash) => {
            info!("AetherisVault.pause() submitted: {}", tx_hash);
            result.vault_pause_tx = Some(tx_hash);
        }
        Err(e) => {
            warn!("AetherisVault.pause() failed: {}", e);
        }
    }

    Ok(result)
}

/// Build, sign, and broadcast a single emergency transaction.
async fn send_emergency_tx(
    rpc: &RpcProvider,
    wallet: &LocalWallet,
    to: &str,
    selector: &[u8],
    nonce: u64,
    gas_price: U256,
) -> Result<String> {
    let to_addr = to
        .parse::<Address>()
        .map_err(|e| anyhow!("Invalid address '{}': {}", to, e))?;

    // Build EIP-1559 transaction (Base L2 supports it natively)
    let tx = TransactionRequest::new()
        .to(to_addr)
        .nonce(nonce)
        .gas(200_000u64) // Conservative gas limit for pause/emergencyReturn
        .gas_price(gas_price * 2) // 2x current gas price for priority inclusion
        .data(Bytes::from(selector.to_vec()));

    let typed: TypedTransaction = tx.into();
    let sig = wallet
        .sign_transaction(&typed)
        .await
        .map_err(|e| anyhow!("Failed to sign emergency tx: {}", e))?;

    let signed = typed.rlp_signed(&sig);
    let signed_hex = format!("0x{}", hex::encode(&signed));

    // Broadcast
    let result = rpc
        .call_raw(
            "eth_sendRawTransaction",
            serde_json::json!([signed_hex]),
        )
        .await
        .map_err(|e| anyhow!("eth_sendRawTransaction failed: {}", e))?;

    let tx_hash = result
        .as_str()
        .ok_or_else(|| anyhow!("eth_sendRawTransaction returned non-string"))?
        .to_string();

    Ok(tx_hash)
}

/// Fetch the current nonce for the guardian wallet.
async fn fetch_nonce(rpc: &RpcProvider, address: &str) -> Result<u64> {
    let result = rpc
        .call_raw(
            "eth_getTransactionCount",
            serde_json::json!([address, "latest"]),
        )
        .await?;

    let hex = result
        .as_str()
        .ok_or_else(|| anyhow!("Nonce response is not a string"))?;
    let nonce = u64::from_str_radix(hex.strip_prefix("0x").unwrap_or(hex), 16)
        .map_err(|e| anyhow!("Failed to parse nonce: {}", e))?;
    Ok(nonce)
}

/// Fetch the current gas price from the RPC endpoint.
async fn fetch_gas_price(rpc: &RpcProvider) -> Result<U256> {
    let result = rpc
        .call_raw("eth_gasPrice", serde_json::json!([]))
        .await?;

    let hex = result
        .as_str()
        .ok_or_else(|| anyhow!("Gas price response is not a string"))?;
    let price = U256::from_str_radix(hex.strip_prefix("0x").unwrap_or(hex), 16)
        .map_err(|e| anyhow!("Failed to parse gas price: {}", e))?;
    Ok(price)
}
