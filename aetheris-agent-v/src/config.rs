// Aetheris\aetheris-agent-v\src\config.rs

/// config.rs — Agent V configuration
///
/// Loads all config from environment variables (populated from .env via dotenv).
/// Validates required fields at startup — panics with clear message if anything
/// is missing so we fail fast before entering the monitoring loop.
///
/// RPC resolution by CHAIN_ID (same pattern as Agent Gas):
///   84532 (Base Sepolia)  →  BASE_SEPOLIA_RPC_URL / BASE_SEPOLIA_WS_URL
///   8453  (Base Mainnet)  →  BASE_MAINNET_RPC_URL / BASE_MAINNET_WS_URL
///
/// All addresses are stored as lowercase hex strings for consistent comparison.

use anyhow::{anyhow, Result};
use std::env;

/// Top-level configuration for Agent V.
/// Constructed once at startup via `Config::from_env()` and then passed
/// throughout the application by Arc<Config>.
#[derive(Debug, Clone)]
pub struct Config {
    // --- Chain ---
    pub chain_id: u64,

    // --- RPC ---
    /// WebSocket URL for newHeads block subscription (primary)
    pub rpc_ws_url: String,
    /// HTTP URL for Multicall3 batch reads (primary)
    pub rpc_http_url: String,
    /// HTTP URL fallback if primary HTTP fails (optional)
    pub rpc_http_fallback: Option<String>,

    // --- Guardian wallet ---
    /// Private key hex string (with 0x prefix) for signing emergency txs
    pub bundler_private_key: String,

    // --- Aetheris contracts ---
    pub agent_alpha_addr: String,
    pub agent_beta_addr: String,
    pub vault_addr: String,

    // --- Infrastructure ---
    pub multicall3_addr: String,

    // --- Watchlist ---
    /// All contract addresses to monitor every block
    pub watched_contracts: Vec<String>,
    /// Chainlink ETH/USD price feed address on Base
    pub chainlink_eth_usd: String,
    /// Pyth contract address on Base
    pub pyth_contract: String,
    /// Pyth ETH/USD price feed ID (bytes32 as hex string)
    pub pyth_eth_usd_feed_id: String,
    /// Oracle divergence threshold in basis points (e.g. 500 = 5%)
    pub oracle_divergence_bps: u64,

    // --- Circuit breaker ---
    /// Number of consecutive RPC failures before halting on-chain responses
    pub circuit_breaker_threshold: u32,

    // --- Database ---
    pub db_path: String,

    // --- Alerts ---
    pub telegram_bot_token: Option<String>,
    pub telegram_chat_id: Option<String>,
    pub discord_webhook_url: Option<String>,
}

impl Config {
    /// Load and validate all configuration from environment variables.
    /// Call this once at startup after `dotenv().ok()`.
    pub fn from_env() -> Result<Self> {
        let chain_id = env::var("CHAIN_ID")
            .unwrap_or_else(|_| "84532".to_string())
            .parse::<u64>()
            .map_err(|e| anyhow!("CHAIN_ID must be a number: {}", e))?;

        let is_sepolia = chain_id == 84532;

        // ── RPC resolution ──────────────────────────────────────────────────
        let rpc_http_url = if is_sepolia {
            require_env("BASE_SEPOLIA_RPC_URL")?
        } else {
            require_env("BASE_MAINNET_RPC_URL")?
        };

        let rpc_ws_url = if is_sepolia {
            require_env("BASE_SEPOLIA_WS_URL")?
        } else {
            require_env("BASE_MAINNET_WS_URL")?
        };

        // Optional QuickNode failover (matches Agent Gas: QUICKNODE_SEPOLIA_RPC_URL)
        let rpc_http_fallback = env::var("QUICKNODE_SEPOLIA_RPC_URL")
            .ok()
            .filter(|s| !s.is_empty());

        // ── Guardian wallet ─────────────────────────────────────────────────
        let bundler_private_key = require_env("BUNDLER_PRIVATE_KEY")?;

        // ── Aetheris contracts ──────────────────────────────────────────────
        let agent_alpha_addr = require_env("AGENT_ALPHA_ADDR").map(|s| s.to_lowercase())?;
        let agent_beta_addr  = require_env("AGENT_BETA_ADDR").map(|s| s.to_lowercase())?;
        let vault_addr       = require_env("VAULT_ADDR").map(|s| s.to_lowercase())?;

        let multicall3_addr = env::var("MULTICALL3_ADDR")
            .unwrap_or_else(|_| "0xcA11bde05977b3631167028862bE2a173976CA11".to_string())
            .to_lowercase();

        // ── Watchlist ───────────────────────────────────────────────────────
        let raw_watchlist = env::var("WATCHED_CONTRACTS").unwrap_or_default();
        let mut watched_contracts: Vec<String> = raw_watchlist
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty() && s.starts_with("0x"))
            .collect();

        // Always watch our own contracts regardless of env config
        for addr in [&agent_alpha_addr, &agent_beta_addr, &vault_addr] {
            if !watched_contracts.contains(addr) {
                watched_contracts.push(addr.clone());
            }
        }

        // ── Oracle ──────────────────────────────────────────────────────────
        let chainlink_eth_usd    = require_env("CHAINLINK_ETH_USD").map(|s| s.to_lowercase())?;
        let pyth_contract        = require_env("PYTH_CONTRACT").map(|s| s.to_lowercase())?;
        let pyth_eth_usd_feed_id = require_env("PYTH_ETH_USD_FEED_ID").map(|s| s.to_lowercase())?;

        let oracle_divergence_bps = env::var("ORACLE_DIVERGENCE_BPS")
            .unwrap_or_else(|_| "500".to_string())
            .parse::<u64>()
            .map_err(|e| anyhow!("ORACLE_DIVERGENCE_BPS must be a number: {}", e))?;

        // ── Circuit breaker ─────────────────────────────────────────────────
        let circuit_breaker_threshold = env::var("CIRCUIT_BREAKER_THRESHOLD")
            .unwrap_or_else(|_| "5".to_string())
            .parse::<u32>()
            .map_err(|e| anyhow!("CIRCUIT_BREAKER_THRESHOLD must be a number: {}", e))?;

        // ── Misc ────────────────────────────────────────────────────────────
        let db_path = env::var("DB_PATH").unwrap_or_else(|_| "./data/agent_v.db".to_string());

        let telegram_bot_token  = env::var("TELEGRAM_BOT_TOKEN").ok().filter(|s| !s.is_empty());
        let telegram_chat_id    = env::var("TELEGRAM_CHAT_ID").ok().filter(|s| !s.is_empty());
        let discord_webhook_url = env::var("DISCORD_WEBHOOK_URL").ok().filter(|s| !s.is_empty());

        Ok(Config {
            chain_id,
            rpc_ws_url,
            rpc_http_url,
            rpc_http_fallback,
            bundler_private_key,
            agent_alpha_addr,
            agent_beta_addr,
            vault_addr,
            multicall3_addr,
            watched_contracts,
            chainlink_eth_usd,
            pyth_contract,
            pyth_eth_usd_feed_id,
            oracle_divergence_bps,
            circuit_breaker_threshold,
            db_path,
            telegram_bot_token,
            telegram_chat_id,
            discord_webhook_url,
        })
    }

    /// Returns true if at least one alert channel is configured.
    pub fn has_alerts(&self) -> bool {
        self.telegram_bot_token.is_some() || self.discord_webhook_url.is_some()
    }

    /// Returns true if running on Base Sepolia testnet.
    pub fn is_sepolia(&self) -> bool {
        self.chain_id == 84532
    }
}

/// Helper: get a required environment variable or return a clear error.
fn require_env(key: &str) -> Result<String> {
    env::var(key).map_err(|_| anyhow!("Required environment variable '{}' is not set. Check .env file.", key))
}
