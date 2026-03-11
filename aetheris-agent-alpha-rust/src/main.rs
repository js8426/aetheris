/// Aetheris\aetheris-agent-alpha-rust\src\main.rs
///
/// main.rs — Aetheris Agent-V Rust Phase 3
/// 30-day silent launch observation mode

mod alerts;
mod arb;
mod circuit_breaker;
mod config;
mod db;
mod math;
mod rpc;
mod tx;
mod volatility;
mod ws;

use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use alloy::providers::Provider;
use anyhow::Result;
use clap::Parser;
use tokio::sync::RwLock;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

use crate::{
    alerts::Alerter,
    arb::{
        detector::Detector,
        routes::{all_routes, RouteScorer},
    },
    circuit_breaker::CircuitBreaker,
    config::{AppConfig, Cli, CHAIN_ID},
    db::Database,
    rpc::{
        multicall::{
            discover_aero_pools, discover_uni_v3_pools,
            fetch_all_pool_states, make_http_provider,
        },
        pool::RpcPool,
    },
    tx::TxExecutor,
    volatility::VolatilityTracker,
};

#[tokio::main]
async fn main() -> Result<()> {
    // ── Logging setup ─────────────────────────────────────────────────────────
    // Writes to both stdout and agent.log file
    let file_appender = tracing_appender::rolling::daily(".", "agent");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("aetheris_agent_v_rust=info,warn")),
        )
        .with_writer(std::io::stdout)
        .with_target(false)
        .init();

    let _ = dotenvy::dotenv();
    let cli = Cli::parse();
    let cfg = AppConfig::from_cli(&cli)?;
    print_banner(&cfg);

    // ── Components ────────────────────────────────────────────────────────────
    let db = Arc::new(Database::open(&cfg.db_path)?);

    let saved_scores: HashMap<String, f64> = db
        .load_route_scores().await.unwrap_or_default()
        .into_iter().collect();

    let scorer  = Arc::new(RwLock::new(RouteScorer::new(saved_scores)));
    let alerter = Arc::new(Alerter::new());
    let routes  = all_routes();
    let detector = Arc::new(Detector {
        min_profit_usdc: cfg.min_profit,
        min_trade_usdc:  cfg.min_trade_usdc,
        max_trade_usdc:  cfg.max_trade_usdc,
    });
    let executor = Arc::new(TxExecutor::new(&cfg.private_key)?);
    info!("Signer: {}", executor.signer_address());

    // RPC pool
    let rpc_pool = RpcPool::new(
        cfg.rpc_primary.clone(), None, Some(cfg.rpc_tertiary.clone()),
    );
    let pool_clone = rpc_pool.clone();
    tokio::spawn(async move { pool_clone.health_loop().await });

    // ── Pool discovery ────────────────────────────────────────────────────────
    let rpc_url       = rpc_pool.best_url().await;
    let http_provider = make_http_provider(&rpc_url)?;
    let token_pairs   = vec![
        (cfg.usdc, cfg.weth),
        (cfg.weth, cfg.cbbtc),
        (cfg.usdc, cfg.cbbtc),
    ];

    info!("Discovering Uniswap V3 pools...");
    let uni_descs = discover_uni_v3_pools(
        &http_provider, cfg.uni_factory, &token_pairs,
        &crate::config::UNISWAP_FEE_TIERS,
    ).await;
    info!("Found {} UniV3 pools", uni_descs.len());

    info!("Discovering Aerodrome pools...");
    let aero_descs = discover_aero_pools(
        &http_provider, cfg.aero_factory, &token_pairs,
    ).await;
    info!("Found {} Aerodrome pools", aero_descs.len());

    let uni_descs  = Arc::new(uni_descs);
    let aero_descs = Arc::new(aero_descs);

    // ── WebSocket ─────────────────────────────────────────────────────────────
    let mut block_rx = if !cfg.ws_url.is_empty() {
        info!("[U1] Starting WebSocket subscriber");
        Some(ws::spawn(cfg.ws_url.clone()))
    } else {
        warn!("[U1] No WS URL — using HTTP polling fallback");
        None
    };

    // ── State ─────────────────────────────────────────────────────────────────
    let mut volatility       = VolatilityTracker::new();
    let mut circuit          = CircuitBreaker::new();
    let mut consecutive_fail = 0u32;
    let mut total_scans      = 0u64;
    let mut total_profit     = 0.0_f64;
    let cfg_arc              = Arc::new(cfg.clone());
    let start_time           = Instant::now();

    // Track last known scores for change detection
    let mut last_known_scores: HashMap<String, f64> = {
        let r = scorer.read().await;
        r.all_scores().clone()
    };

    // Track last RPC URL for failover detection
    let mut last_rpc_url = rpc_pool.best_url().await;

    // Track last daily report date
    let mut last_report_date = String::new();
    let mut last_uptime_checkpoint = Instant::now();

    alerter.send(format!(
        "[Aetheris] Agent-V Rust started\nMode: {} | Base Sepolia\nSigner: {}\n30-day observation period begun.",
        cfg.mode.to_uppercase(),
        executor.signer_address(),
    ));

    info!("Entering main scan loop...");

    loop {
        // ── Wait for next block ───────────────────────────────────────────────
        let block_num: u64 = if let Some(ref mut rx) = block_rx {
            match tokio::time::timeout(
                Duration::from_secs(cfg.poll_interval + 4), rx.recv(),
            ).await {
                Ok(Some(n)) => n,
                Ok(None) => {
                    warn!("[U1] WS closed, reconnecting...");
                    block_rx = Some(ws::spawn(cfg.ws_url.clone()));
                    continue;
                }
                Err(_) => {
                    match make_http_provider(&rpc_pool.best_url().await) {
                        Ok(p) => p.get_block_number().await.unwrap_or(0),
                        Err(_) => 0,
                    }
                }
            }
        } else {
            tokio::time::sleep(Duration::from_secs(cfg.poll_interval)).await;
            match make_http_provider(&rpc_pool.best_url().await) {
                Ok(p) => p.get_block_number().await.unwrap_or(0),
                Err(_) => 0,
            }
        };

        if circuit.is_open() {
            continue;
        }

        // ── Fetch pool state ──────────────────────────────────────────────────
        let rpc_url    = rpc_pool.best_url().await;
        let scan_start = Instant::now();

        // Detect RPC failover
        if rpc_url != last_rpc_url {
            info!("[U4] RPC failover: {} → {}", &last_rpc_url[..last_rpc_url.len().min(40)], &rpc_url[..rpc_url.len().min(40)]);
            let _ = db.record_rpc_failover(&last_rpc_url, &rpc_url).await;
            last_rpc_url = rpc_url.clone();
        }

        let fetch_provider = match make_http_provider(&rpc_url) {
            Ok(p)  => p,
            Err(e) => { error!("[RPC] {e}"); continue; }
        };

        let (uni_states, aero_states) = match fetch_all_pool_states(
            &fetch_provider, cfg_arc.multicall3, &uni_descs, &aero_descs,
        ).await {
            Ok(states) => {
                rpc_pool.record_success(&rpc_url, scan_start.elapsed().as_secs_f64() * 1000.0).await;
                states
            }
            Err(e) => {
                error!("[SCAN] Multicall3 failed on block {block_num}: {e}");
                rpc_pool.record_error(&rpc_url).await;
                consecutive_fail += 1;
                if circuit.check_and_trip(consecutive_fail) {
                    let _ = db.record_circuit_trip().await;
                    alerter.send(format!(
                        "[Aetheris] ⚠️ Circuit breaker tripped after {consecutive_fail} failures"
                    ));
                }
                continue;
            }
        };

        let multicall_ms = scan_start.elapsed().as_secs_f64() * 1000.0;

        // ── ETH price + volatility ────────────────────────────────────────────
        let eth_price_usdc = estimate_eth_price_usdc(&uni_states, &cfg_arc);
        volatility.update(eth_price_usdc);
        let adj_min_profit = volatility.adjusted_min_profit(cfg_arc.min_profit);

        // ── Arbitrage scan ────────────────────────────────────────────────────
        let arb_start = Instant::now();
        let scorer_r  = scorer.read().await;
        let opps      = detector.scan(
            &routes, &scorer_r, &uni_states, &aero_states, &cfg_arc, eth_price_usdc,
        );
        drop(scorer_r);

        let arb_ms        = arb_start.elapsed().as_secs_f64() * 1000.0;
        let total_scan_ms = scan_start.elapsed().as_secs_f64() * 1000.0;
        total_scans      += 1;

        info!(
            "Block {:>8} | MC {:.1}ms | Arb {:.2}ms | Total {:.1}ms | {} opps | ETH=${:.0} | Vol={}",
            block_num, multicall_ms, arb_ms, total_scan_ms,
            opps.len(), eth_price_usdc, volatility.mode.as_str()
        );

        let _ = db.log_scan(
            block_num, opps.len(), total_scan_ms,
            volatility.mode.as_str(), volatility.value, &rpc_url,
        ).await;

        // ── Execute best opportunity ───────────────────────────────────────────
        for opp in &opps {
            if opp.net_profit_usdc < adj_min_profit {
                continue;
            }

            info!(
                "[OPP] route={} profit=${:.4} score={:.2}",
                opp.route_key, opp.net_profit_usdc, opp.route_score,
            );

            let exec_start  = Instant::now();
            let exec_result = executor.execute(
                opp, &cfg_arc, &rpc_url, block_num, &cfg_arc.mode, eth_price_usdc,
            ).await;
            let exec_time_s = exec_start.elapsed().as_secs_f64();

            match exec_result {
                Ok(result) => {
                    if result.success {
                        consecutive_fail  = 0;
                        total_profit     += opp.net_profit_usdc;
                        scorer.write().await.record_win(&opp.route_key);
                    } else {
                        scorer.write().await.record_miss(&opp.route_key);
                    }

                    let _ = db.log_trade(
                        opp,
                        result.success,
                        result.tx_hash.as_deref(),
                        exec_time_s,
                        if result.success { None } else { Some("reverted_or_simulated") },
                        &rpc_url,
                        result.gas_tier,
                        result.gas_cost_usd,
                        block_num,
                        "baseSepolia",
                        &cfg_arc.mode,
                    ).await;

                    if result.success {
                        if let Some(ref hash) = result.tx_hash {
                            alerter.send(format!(
                                "[Aetheris] ✅ Trade confirmed\nRoute: {} | Net: +${:.4} | Gas: ${:.4}\nhttps://sepolia.basescan.org/tx/{hash}",
                                opp.route_key, opp.net_profit_usdc, result.gas_cost_usd,
                            ));
                        }
                    }
                }
                Err(e) => {
                    consecutive_fail += 1;
                    if circuit.check_and_trip(consecutive_fail) {
                        let _ = db.record_circuit_trip().await;
                        alerter.send(format!(
                            "[Aetheris] ⚠️ Circuit breaker tripped after {consecutive_fail} failures"
                        ));
                    }
                    error!("[ERR] Execution failed: {e}");
                    let reason = e.to_string();
                    let reason = &reason[..reason.len().min(200)];
                    let _ = db.log_trade(
                        opp, false, None, exec_time_s, Some(reason),
                        &rpc_url, 0, 0.0, block_num, "baseSepolia", &cfg_arc.mode,
                    ).await;
                    let _ = db.log_event("EXECUTION_ERROR", reason).await;
                    scorer.write().await.record_miss(&opp.route_key);
                    alerter.send(format!(
                        "[Aetheris] ⚠️ Execution failed\nRoute: {}\nError: {e}",
                        opp.route_key,
                    ));
                }
            }
            break; // one opportunity per block
        }

        // ── Periodic tasks (every 20 scans) ───────────────────────────────────
        if total_scans % 20 == 0 {
            // Save route scores and detect changes
            let scorer_r = scorer.read().await;
            let current_scores = scorer_r.all_scores().clone();
            drop(scorer_r);

            let _ = db.record_score_changes(&last_known_scores, &current_scores).await;

            for (key, &score) in &current_scores {
                let _ = db.save_route_score(key, score, 0.0).await;
            }
            last_known_scores = current_scores;

            // Refresh best/worst route
            let _ = db.refresh_best_worst_routes().await;

            info!(
                "Scans: {}  Profit: ${:.4}  Uptime: {:.1}h",
                total_scans,
                total_profit,
                start_time.elapsed().as_secs_f64() / 3600.0,
            );
        }

        // ── Uptime checkpoint every hour ──────────────────────────────────────
        if last_uptime_checkpoint.elapsed() >= Duration::from_secs(3600) {
            let uptime_h = start_time.elapsed().as_secs_f64() / 3600.0;
            let _ = db.record_uptime(uptime_h).await;
            last_uptime_checkpoint = Instant::now();
        }

        // ── Daily report at midnight UTC ──────────────────────────────────────
        let today = Utc::now_str();
        if today != last_report_date && !last_report_date.is_empty() {
            // Print yesterday's report
            if let Ok(Some(summary)) = db.get_daily_summary(&last_report_date).await {
                summary.print_report();
                alerter.send(format!(
                    "[Aetheris] 📊 Daily Report — {}\nTrades: {}/{} ({:.1}% win)\nNet profit: ${:.4}\nCumulative: ${:.4}\nAPY on $100: {:.2}%\nUptime: {:.1}h",
                    summary.date,
                    summary.successful_trades, summary.total_trades,
                    summary.win_rate,
                    summary.net_profit_usd,
                    summary.cumulative_net_profit,
                    summary.monthly_apy_on_100,
                    summary.uptime_hours,
                ));
            }
        }
        last_report_date = today;
    }
}

// ─── ETH price from USDC/WETH pool state ─────────────────────────────────────

fn estimate_eth_price_usdc(
    uni_states: &[crate::rpc::multicall::UniV3PoolState],
    cfg:        &AppConfig,
) -> f64 {
    let q96: f64 = 7.922816251426434e28;
    for pool in uni_states.iter().filter(|p| p.valid) {
        let is_usdc_weth =
            (pool.token0 == cfg.usdc && pool.token1 == cfg.weth)
            || (pool.token0 == cfg.weth && pool.token1 == cfg.usdc);
        if !is_usdc_weth { continue; }
        let raw_price = (pool.sqrt_price_x96 / q96).powi(2);
        if raw_price == 0.0 { continue; }
        let eth_price = 1e12 / raw_price;
        if eth_price > 100.0 && eth_price < 1_000_000.0 {
            return eth_price;
        }
    }
    3_000.0
}

// ─── Utility: current date string ────────────────────────────────────────────

struct Utc;
impl Utc {
    fn now_str() -> String {
        chrono::Utc::now().format("%Y-%m-%d").to_string()
    }
}

// ─── Startup banner ──────────────────────────────────────────────────────────

fn print_banner(cfg: &AppConfig) {
    let sep = "=".repeat(65);
    info!("{sep}");
    info!("  AETHERIS AGENT-V — RUST PHASE 3");
    info!("  30-Day Silent Launch Observation Mode");
    info!("{sep}");
    info!("  Mode       : {}", cfg.mode.to_uppercase());
    info!("  Network    : Base Sepolia (chain {})", CHAIN_ID);
    info!("  AgentAlpha : {}", cfg.agent_alpha);
    info!("  Min profit : ${:.2} USDC", cfg.min_profit);
    info!("  Trade range: ${:.0}–${:.0}", cfg.min_trade_usdc, cfg.max_trade_usdc);
    info!("  WebSocket  : {}", if cfg.ws_url.is_empty() { "NO (polling)" } else { "YES" });
    info!("  Database   : {}", cfg.db_path);
    info!("{sep}");
    if cfg.mode == "simulate" {
        info!("  SIMULATE MODE — opportunities logged, no txs sent");
        info!("{sep}");
    }
}
