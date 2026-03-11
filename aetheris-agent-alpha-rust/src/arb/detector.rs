/// Aetheris\aetheris-agent-alpha-rust\src\arb\detector.rs
///
/// Arbitrage detector with golden-section search (GSS) trade-size optimizer (U2).
///
/// All price calculations are LOCAL — zero RPC calls per scan.
/// GSS runs ~14 evaluations against the in-memory pool state cache.

use crate::{
    arb::routes::{Dex, Leg, Route, RouteScorer, Token},
    config::*,
    math::{aerodrome, uniswap_v3},
    rpc::multicall::{AeroPoolState, UniV3PoolState},
};
use alloy::primitives::Address;
use tracing::debug;

// ─── Opportunity ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ArbOpportunity {
    pub route_key:       String,
    pub start_token:     Token,
    pub amount_in:       f64,
    pub gross_profit:    f64,
    pub net_profit:      f64,
    pub net_profit_usdc: f64,
    pub route_score:     f64,
    pub legs_summary:    Vec<LegResult>,
}

#[derive(Debug, Clone)]
pub struct LegResult {
    pub token_in:   Token,
    pub token_out:  Token,
    pub dex:        Dex,
    pub amount_in:  f64,
    pub amount_out: f64,
    pub pool_addr:  Option<Address>,
}

// ─── Pool state lookup helper ─────────────────────────────────────────────────

struct PoolLookup<'a> {
    uni:  &'a [UniV3PoolState],
    aero: &'a [AeroPoolState],
}

impl<'a> PoolLookup<'a> {
    fn best_amount_out(
        &self,
        token_in:  Address,
        token_out: Address,
        amount_in: f64,
        dex:       &Dex,
    ) -> (f64, Option<Address>) {
        match dex {
            Dex::UniswapV3 { fee_ppm: _ } => {
                let mut best_out  = 0.0_f64;
                let mut best_addr = None;
                for pool in self.uni.iter().filter(|p| p.valid) {
                    if !Self::matches_pair(pool.token0, pool.token1, token_in, token_out) {
                        continue;
                    }
                    let zero_for_one = token_in == pool.token0;
                    let out = uniswap_v3::compute_amount_out(
                        pool.sqrt_price_x96,
                        pool.liquidity,
                        amount_in,
                        pool.fee_ppm,
                        zero_for_one,
                    );
                    if out > best_out {
                        best_out  = out;
                        best_addr = Some(pool.address);
                    }
                }
                (best_out, best_addr)
            }
            Dex::Aerodrome { stable } => {
                let mut best_out  = 0.0_f64;
                let mut best_addr = None;
                for pool in self.aero.iter().filter(|p| p.valid && p.stable == *stable) {
                    if !Self::matches_pair(pool.token0, pool.token1, token_in, token_out) {
                        continue;
                    }
                    let (reserve_in, reserve_out) = if token_in == pool.token0 {
                        (pool.reserve0, pool.reserve1)
                    } else {
                        (pool.reserve1, pool.reserve0)
                    };
                    let out = if *stable {
                        aerodrome::stable_amount_out(
                            reserve_in, reserve_out, amount_in, pool.fee_ppm, 6, 18,
                        )
                    } else {
                        aerodrome::volatile_amount_out(
                            reserve_in, reserve_out, amount_in, pool.fee_ppm,
                        )
                    };
                    if out > best_out {
                        best_out  = out;
                        best_addr = Some(pool.address);
                    }
                }
                (best_out, best_addr)
            }
        }
    }

    #[inline]
    fn matches_pair(t0: Address, t1: Address, ta: Address, tb: Address) -> bool {
        (t0 == ta && t1 == tb) || (t0 == tb && t1 == ta)
    }
}

// ─── Detector ────────────────────────────────────────────────────────────────

pub struct Detector {
    pub min_profit_usdc: f64,
    pub min_trade_usdc:  f64,
    pub max_trade_usdc:  f64,
}

impl Detector {
    /// Scan all routes. Returns opportunities sorted by net_profit descending.
    /// Zero RPC calls — all computation is local.
    pub fn scan(
        &self,
        routes:         &[Route],
        scorer:         &RouteScorer,
        uni_states:     &[UniV3PoolState],
        aero_states:    &[AeroPoolState],
        cfg:            &crate::config::AppConfig,
        eth_price_usdc: f64,
    ) -> Vec<ArbOpportunity> {
        let lookup = PoolLookup { uni: uni_states, aero: aero_states };
        let mut opps = Vec::new();

        let mut sorted_routes: Vec<_> = routes.iter().collect();
        sorted_routes.sort_by(|a, b| {
            scorer.score(b.key).partial_cmp(&scorer.score(a.key)).unwrap()
        });

        for route in sorted_routes {
            let score = scorer.score(route.key);
            if let Some(opp) =
                self.check_route(route, score, &lookup, cfg, eth_price_usdc)
            {
                opps.push(opp);
            }
        }

        opps.sort_by(|a, b| {
            b.net_profit_usdc.partial_cmp(&a.net_profit_usdc).unwrap()
        });
        opps
    }

    fn check_route(
        &self,
        route:          &Route,
        score:          f64,
        lookup:         &PoolLookup,
        cfg:            &crate::config::AppConfig,
        eth_price_usdc: f64,
    ) -> Option<ArbOpportunity> {
        let dec_start = route.start_token.decimals();
        let scale     = 10f64.powi(dec_start as i32);

        let lo = self.min_trade_usdc * scale;
        let hi = self.max_trade_usdc * scale;

        let profit_fn = |amount_in: f64| -> f64 {
            let outputs = simulate_legs(&route.legs, amount_in, lookup, cfg);
            match outputs.last() {
                Some(&final_out) => {
                    let gross = final_out - amount_in;
                    if gross <= 0.0 {
                        return f64::NEG_INFINITY;
                    }
                    let premium = (amount_in * AAVE_FLASH_PREMIUM_BPS as f64) / 10_000.0;
                    gross - premium
                }
                None => f64::NEG_INFINITY,
            }
        };

        let optimal_amount = golden_section_max(&profit_fn, lo, hi);
        let profit_at_opt  = profit_fn(optimal_amount);

        if profit_at_opt <= 0.0 {
            debug!("[ARB] Route {} no profit at optimal size", route.key);
            return None;
        }

        let net_profit_usdc = match route.start_token {
            Token::Usdc  => profit_at_opt / scale,
            Token::Weth  => profit_at_opt / scale * eth_price_usdc,
            Token::CbBtc => profit_at_opt / scale * 90_000.0,
        };

        if net_profit_usdc < self.min_profit_usdc {
            return None;
        }

        let legs_simulated = simulate_legs_detailed(&route.legs, optimal_amount, lookup, cfg);
        let premium        = (optimal_amount * AAVE_FLASH_PREMIUM_BPS as f64) / 10_000.0;

        Some(ArbOpportunity {
            route_key:       route.key.into(),
            start_token:     route.start_token,
            amount_in:       optimal_amount,
            gross_profit:    profit_at_opt + premium,
            net_profit:      profit_at_opt,
            net_profit_usdc,
            route_score:     score,
            legs_summary:    legs_simulated,
        })
    }
}

// ─── Leg simulation ──────────────────────────────────────────────────────────

/// Returns the output amount of each leg. Used inside GSS profit function.
fn simulate_legs(
    legs:      &[Leg],
    amount_in: f64,
    lookup:    &PoolLookup,
    cfg:       &crate::config::AppConfig,
) -> Vec<f64> {
    let mut current = amount_in;
    let mut outputs = Vec::with_capacity(legs.len());

    for leg in legs {
        let tin  = leg.token_in.address(cfg);
        let tout = leg.token_out.address(cfg);
        let (out, _) = lookup.best_amount_out(tin, tout, current, &leg.dex);
        if out == 0.0 {
            return vec![];
        }
        outputs.push(out);
        current = out;
    }
    outputs
}

/// Like simulate_legs but captures full LegResult including pool addresses.
/// Called once after GSS converges.
fn simulate_legs_detailed(
    legs:      &[Leg],
    amount_in: f64,
    lookup:    &PoolLookup,
    cfg:       &crate::config::AppConfig,
) -> Vec<LegResult> {
    let mut current = amount_in;
    let mut results = Vec::with_capacity(legs.len());

    for leg in legs {
        let tin  = leg.token_in.address(cfg);
        let tout = leg.token_out.address(cfg);
        let (out, addr) = lookup.best_amount_out(tin, tout, current, &leg.dex);
        results.push(LegResult {
            token_in:   leg.token_in,
            token_out:  leg.token_out,
            dex:        leg.dex,
            amount_in:  current,
            amount_out: out,
            pool_addr:  addr,
        });
        current = out;
    }
    results
}

// ─── Golden Section Search (U2) ──────────────────────────────────────────────

const GOLDEN_RATIO: f64 = 1.618_033_988_749_895;

pub fn golden_section_max(f: &impl Fn(f64) -> f64, mut lo: f64, mut hi: f64) -> f64 {
    let resphi = 2.0 - GOLDEN_RATIO;

    let mut x1 = lo + resphi * (hi - lo);
    let mut x2 = hi - resphi * (hi - lo);
    let mut f1 = f(x1);
    let mut f2 = f(x2);

    for _ in 0..GSS_MAX_ITERATIONS {
        if (hi - lo).abs() < 1.0 { break; }
        if f1 < f2 {
            lo = x1;
            x1 = x2; f1 = f2;
            x2 = hi - resphi * (hi - lo);
            f2 = f(x2);
        } else {
            hi = x2;
            x2 = x1; f2 = f1;
            x1 = lo + resphi * (hi - lo);
            f1 = f(x1);
        }
    }

    (lo + hi) / 2.0
}
