/// Aetheris\aetheris-agent-alpha-rust\src\config.rs
///
/// All network addresses, trading constants, and CLI configuration.
/// Mirrors Phase 2 Python constants exactly so behaviour is identical.

use alloy::primitives::Address;
use clap::Parser;
use std::str::FromStr;

// ─── Addresses ────────────────────────────────────────────────────────────────

pub const CHAIN_ID: u64 = 84532; // Base Sepolia

// Deployed contracts (Base Sepolia)
pub const AGENT_ALPHA_ADDR: &str    = "0x33c9bF62b3a4f5607B379f533f782040bd13A959";
pub const PROFIT_DIST_ADDR: &str    = "0xC38A776b958c83482914BdE299c9a6bC846CCb95";

// Tokens
pub const USDC_ADDR: &str   = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
pub const WETH_ADDR: &str   = "0x4200000000000000000000000000000000000006";
pub const CBBTC_ADDR: &str  = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";

// Token decimals
pub const USDC_DECIMALS: u32  = 6;
pub const WETH_DECIMALS: u32  = 18;
pub const CBBTC_DECIMALS: u32 = 8;

// DEX infrastructure (Base Sepolia)
pub const UNISWAP_V3_FACTORY: &str  = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
pub const UNISWAP_V3_ROUTER: &str   = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4";
pub const AERODROME_ROUTER: &str    = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
pub const AERODROME_FACTORY: &str   = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
pub const AAVE_POOL: &str           = "0x07eA79F68B2B3df564D0A34F8e19791a8a4c28E4";

/// Multicall3 — same address on every EVM chain
pub const MULTICALL3: &str = "0xcA11bde05977b3631167028862bE2a173976CA11";

// ─── Uniswap V3 fee tiers (bps * 100, i.e. ppm) ──────────────────────────────

/// All four fee tiers to scan, mirroring UNISWAP_FEE_TIERS in Python
pub const UNISWAP_FEE_TIERS: [u32; 4] = [100, 500, 3000, 10000];

// ─── Trading constants (Phase 2 parity) ─────────────────────────────────────

pub const AAVE_FLASH_PREMIUM_BPS: u64 = 5;
pub const SLIPPAGE_BPS:           u64 = 30;
pub const GAS_BUFFER_MULTIPLIER:  f64 = 1.2;
pub const GAS_FALLBACK_UNITS:     u64 = 600_000;

// Trade sizing
pub const MIN_TRADE_USDC: f64 = 1_000.0;
pub const MAX_TRADE_USDC: f64 = 100_000.0;

// Golden section optimizer (U2)
pub const GSS_MAX_ITERATIONS: usize = 14;

// ─── Volatility (U5) ─────────────────────────────────────────────────────────

pub const VOLATILITY_WINDOW:   usize = 20;
pub const VOLATILITY_HIGH:     f64   = 0.003;
pub const VOLATILITY_LOW:      f64   = 0.001;

// ─── Route scoring initial values (U6) ───────────────────────────────────────

pub const SCORE_2LEG_USDC_WETH:         f64 = 1.0;
pub const SCORE_2LEG_WETH_CBBTC:        f64 = 2.0;
pub const SCORE_2LEG_USDC_CBBTC:        f64 = 2.0;
pub const SCORE_3LEG_USDC_WETH_CBBTC:   f64 = 1.8;
pub const SCORE_3LEG_USDC_CBBTC_WETH:   f64 = 1.8;

pub const ROUTE_WIN_BOOST:  f64 = 0.3;
pub const ROUTE_MISS_DECAY: f64 = 0.05;
pub const ROUTE_MIN_SCORE:  f64 = 0.1;

// ─── Gas ladder (U8) ─────────────────────────────────────────────────────────

pub const GAS_TIER1_MAX_PROFIT:    f64 = 5.0;   // $0–$5  → tier 1
pub const GAS_TIER2_MAX_PROFIT:    f64 = 25.0;  // $5–$25 → tier 2
pub const GAS_TIER1_PRIORITY_GWEI: f64 = 0.001;
pub const GAS_TIER2_PRIORITY_GWEI: f64 = 0.005;
pub const GAS_TIER3_PRIORITY_GWEI: f64 = 0.02;

// ─── Circuit breaker ─────────────────────────────────────────────────────────

pub const CIRCUIT_BREAKER_THRESHOLD: u32 = 5;
pub const CIRCUIT_BREAKER_PAUSE_S:   u64 = 600;

// ─── RPC health (U4) ─────────────────────────────────────────────────────────

pub const RPC_HEALTH_INTERVAL_S:    u64 = 30;
pub const RPC_MAX_LATENCY_MS:       u64 = 2000;
pub const RPC_MAX_CONSECUTIVE_ERR:  u32 = 3;

// ─── Watched wallets (U3) ────────────────────────────────────────────────────

pub const WATCHED_WALLETS: [&str; 3] = [
    "0x6887246668a3b87F54DeB3b94Ba47a6f63F32985",
    "0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A",
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
];

// ─── Struct helpers ──────────────────────────────────────────────────────────

/// Parsed address helper (panics at startup if addresses in config are wrong)
pub fn addr(s: &str) -> Address {
    Address::from_str(s).unwrap_or_else(|_| panic!("Invalid address constant: {s}"))
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

#[derive(Parser, Debug, Clone)]
#[command(name = "aetheris-arb", about = "Aetheris Agent Alpha — Rust (Phase 3)")]
pub struct Cli {
    /// Operating mode
    #[arg(long, default_value = "simulate", value_parser = ["simulate", "live"])]
    pub mode: String,

    /// Minimum net profit per trade in USDC
    #[arg(long, env = "MIN_PROFIT_USDC", default_value_t = 1.0)]
    pub min_profit: f64,

    /// Maximum flash-loan trade size in USD
    #[arg(long, default_value_t = MAX_TRADE_USDC)]
    pub max_trade_size: f64,

    /// Minimum flash-loan trade size in USD
    #[arg(long, default_value_t = MIN_TRADE_USDC)]
    pub min_trade_size: f64,

    /// SQLite database path
    #[arg(long, default_value = "agent.db")]
    pub db: String,

    /// Fallback HTTP poll interval in seconds (WS overrides this)
    #[arg(long, default_value_t = 2)]
    pub interval: u64,
}

// ─── Runtime config built from CLI + env ─────────────────────────────────────

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub mode:           String,
    pub min_profit:     f64,
    pub max_trade_usdc: f64,
    pub min_trade_usdc: f64,
    pub db_path:        String,
    pub poll_interval:  u64,

    // From .env
    pub rpc_primary:   String,
    pub rpc_tertiary:  String,
    pub ws_url:        String,
    pub private_key:   String,

    // Parsed addresses (ready to use)
    pub usdc:           Address,
    pub weth:           Address,
    pub cbbtc:          Address,
    pub agent_alpha:    Address,
    pub profit_dist:    Address,
    pub aave_pool:      Address,
    pub uni_factory:    Address,
    pub aero_factory:   Address,
    pub aero_router:    Address,
    pub multicall3:     Address,
}

impl AppConfig {
    pub fn from_cli(cli: &Cli) -> anyhow::Result<Self> {
        let rpc_primary  = std::env::var("BASE_SEPOLIA_RPC_URL")
            .unwrap_or_else(|_| "https://sepolia.base.org".into());
        let ws_url       = std::env::var("BASE_SEPOLIA_WS_URL").unwrap_or_default();
        let private_key  = std::env::var("PRIVATE_KEY")
            .map_err(|_| anyhow::anyhow!("PRIVATE_KEY not set in .env"))?;

        Ok(Self {
            mode:           cli.mode.clone(),
            min_profit:     cli.min_profit,
            max_trade_usdc: cli.max_trade_size,
            min_trade_usdc: cli.min_trade_size,
            db_path:        cli.db.clone(),
            poll_interval:  cli.interval,
            rpc_primary,
            rpc_tertiary:   "https://sepolia.base.org".into(),
            ws_url,
            private_key,

            usdc:         addr(USDC_ADDR),
            weth:         addr(WETH_ADDR),
            cbbtc:        addr(CBBTC_ADDR),
            agent_alpha:  addr(AGENT_ALPHA_ADDR),
            profit_dist:  addr(PROFIT_DIST_ADDR),
            aave_pool:    addr(AAVE_POOL),
            uni_factory:  addr(UNISWAP_V3_FACTORY),
            aero_factory: addr(AERODROME_FACTORY),
            aero_router:  addr(AERODROME_ROUTER),
            multicall3:   addr(MULTICALL3),
        })
    }
}
