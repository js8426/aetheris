/// Aetheris\aetheris-agent-alpha-rust\src\arb\routes.rs
///
/// Arbitrage route definitions and dynamic scoring (Phase 2 U6).
///
/// Routes mirror the Python bot exactly:
///   2-leg: buy on DEX A, sell on DEX B for the same pair
///   3-leg: triangular USDC → WETH → cbBTC → USDC (and reverse)
///
/// Scores start at the Python initial values and update after every scan:
///   profitable scan → boost by ROUTE_WIN_BOOST
///   unprofitable    → decay by ROUTE_MISS_DECAY (floor: ROUTE_MIN_SCORE)

use std::collections::HashMap;
use crate::config::*;
use alloy::primitives::Address;

// ─── Route key constants (match Python route_key strings exactly) ─────────────

pub const ROUTE_2LEG_USDC_WETH:         &str = "2leg_usdc_weth";
pub const ROUTE_2LEG_WETH_CBBTC:        &str = "2leg_weth_cbbtc";
pub const ROUTE_2LEG_USDC_CBBTC:        &str = "2leg_usdc_cbbtc";
pub const ROUTE_3LEG_USDC_WETH_CBBTC:   &str = "3leg_usdc_weth_cbbtc";
pub const ROUTE_3LEG_USDC_CBBTC_WETH:   &str = "3leg_usdc_cbbtc_weth";

// ─── Token identifier ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Token {
    Usdc,
    Weth,
    CbBtc,
}

impl Token {
    pub fn address(&self, cfg: &crate::config::AppConfig) -> Address {
        match self {
            Token::Usdc  => cfg.usdc,
            Token::Weth  => cfg.weth,
            Token::CbBtc => cfg.cbbtc,
        }
    }

    pub fn decimals(&self) -> u32 {
        match self {
            Token::Usdc  => USDC_DECIMALS,
            Token::Weth  => WETH_DECIMALS,
            Token::CbBtc => CBBTC_DECIMALS,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Token::Usdc  => "USDC",
            Token::Weth  => "WETH",
            Token::CbBtc => "cbBTC",
        }
    }
}

// ─── Dex identifier ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dex {
    UniswapV3 { fee_ppm: u32 },
    Aerodrome  { stable: bool },
}

impl Dex {
    pub fn fee_ppm(&self) -> u32 {
        match self {
            Dex::UniswapV3 { fee_ppm } => *fee_ppm,
            Dex::Aerodrome { stable }  => if *stable { 500 } else { 3000 },
        }
    }
}

// ─── Leg: a single swap in the route ─────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Leg {
    pub token_in:  Token,
    pub token_out: Token,
    pub dex:       Dex,
}

// ─── Route definition ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Route {
    pub key:      &'static str,
    pub legs:     Vec<Leg>,
    pub start_token: Token,
}

/// Build all routes — 2-leg and 3-leg — exactly as in the Python bot.
/// Called once at startup.
pub fn all_routes() -> Vec<Route> {
    let fee_tiers = [100u32, 500, 3000, 10000];

    let mut routes = Vec::new();

    // ── 2-leg routes ─────────────────────────────────────────────────────────
    // For each pair we generate routes for every (buy_dex, sell_dex) combination
    // where buy_dex ≠ sell_dex. The scanner will pick the profitable one.
    //
    // We model each 2-leg route at the pair level and let the detector pick
    // the best fee tier dynamically from pool states.

    routes.push(Route {
        key: ROUTE_2LEG_USDC_WETH,
        legs: vec![
            Leg { token_in: Token::Usdc, token_out: Token::Weth, dex: Dex::UniswapV3 { fee_ppm: 500 } },
            Leg { token_in: Token::Weth, token_out: Token::Usdc, dex: Dex::Aerodrome  { stable: false } },
        ],
        start_token: Token::Usdc,
    });

    routes.push(Route {
        key: ROUTE_2LEG_WETH_CBBTC,
        legs: vec![
            Leg { token_in: Token::Weth,  token_out: Token::CbBtc, dex: Dex::UniswapV3 { fee_ppm: 500 } },
            Leg { token_in: Token::CbBtc, token_out: Token::Weth,  dex: Dex::Aerodrome  { stable: false } },
        ],
        start_token: Token::Weth,
    });

    routes.push(Route {
        key: ROUTE_2LEG_USDC_CBBTC,
        legs: vec![
            Leg { token_in: Token::Usdc,  token_out: Token::CbBtc, dex: Dex::UniswapV3 { fee_ppm: 500 } },
            Leg { token_in: Token::CbBtc, token_out: Token::Usdc,  dex: Dex::Aerodrome  { stable: false } },
        ],
        start_token: Token::Usdc,
    });

    // ── 3-leg triangular routes ───────────────────────────────────────────────
    routes.push(Route {
        key: ROUTE_3LEG_USDC_WETH_CBBTC,
        legs: vec![
            Leg { token_in: Token::Usdc,  token_out: Token::Weth,  dex: Dex::UniswapV3 { fee_ppm: 500  } },
            Leg { token_in: Token::Weth,  token_out: Token::CbBtc, dex: Dex::UniswapV3 { fee_ppm: 500  } },
            Leg { token_in: Token::CbBtc, token_out: Token::Usdc,  dex: Dex::Aerodrome  { stable: false } },
        ],
        start_token: Token::Usdc,
    });

    routes.push(Route {
        key: ROUTE_3LEG_USDC_CBBTC_WETH,
        legs: vec![
            Leg { token_in: Token::Usdc,  token_out: Token::CbBtc, dex: Dex::UniswapV3 { fee_ppm: 500  } },
            Leg { token_in: Token::CbBtc, token_out: Token::Weth,  dex: Dex::UniswapV3 { fee_ppm: 500  } },
            Leg { token_in: Token::Weth,  token_out: Token::Usdc,  dex: Dex::Aerodrome  { stable: false } },
        ],
        start_token: Token::Usdc,
    });

    routes
}

// ─── Route Scorer (U6) ────────────────────────────────────────────────────────

pub struct RouteScorer {
    scores: HashMap<String, f64>,
}

impl RouteScorer {
    /// Initialise with Python Phase 2 starting scores.
    pub fn new(saved: HashMap<String, f64>) -> Self {
        let mut scores = HashMap::from([
            (ROUTE_2LEG_USDC_WETH.into(),       SCORE_2LEG_USDC_WETH),
            (ROUTE_2LEG_WETH_CBBTC.into(),      SCORE_2LEG_WETH_CBBTC),
            (ROUTE_2LEG_USDC_CBBTC.into(),      SCORE_2LEG_USDC_CBBTC),
            (ROUTE_3LEG_USDC_WETH_CBBTC.into(), SCORE_3LEG_USDC_WETH_CBBTC),
            (ROUTE_3LEG_USDC_CBBTC_WETH.into(), SCORE_3LEG_USDC_CBBTC_WETH),
        ]);
        // Overlay saved scores from DB
        for (k, v) in saved {
            scores.insert(k, v);
        }
        Self { scores }
    }

    pub fn score(&self, key: &str) -> f64 {
        self.scores.get(key).copied().unwrap_or(1.0)
    }

    pub fn all_scores(&self) -> &HashMap<String, f64> {
        &self.scores
    }

    /// Call after a profitable scan on this route.
    pub fn record_win(&mut self, key: &str) {
        let s = self.scores.entry(key.into()).or_insert(1.0);
        *s += ROUTE_WIN_BOOST;
    }

    /// Call after an unprofitable scan on this route.
    pub fn record_miss(&mut self, key: &str) {
        let s = self.scores.entry(key.into()).or_insert(1.0);
        *s = (*s - ROUTE_MISS_DECAY).max(ROUTE_MIN_SCORE);
    }
}
