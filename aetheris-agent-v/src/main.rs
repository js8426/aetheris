// Aetherisetheris-agent-v\src\main.rs

/// Entry point for Agent V. Responsibilities:
///   1. Load config from .env
///   2. Initialise SQLite database
///   3. Seed slot snapshot from DB (avoids false-positives on restart)
///   4. Start monitor loop (WebSocket block subscription)
///   5. Start daily summary scheduler (midnight UTC)
///   6. Handle SIGTERM for clean PM2 shutdown

use aetheris_agent_v::alerts;
use aetheris_agent_v::config;
use aetheris_agent_v::db;
use aetheris_agent_v::monitor;
use aetheris_agent_v::responder;
use aetheris_agent_v::rpc;

use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    // Load .env file (if present). Errors are not fatal — env may be set externally.
    dotenv::dotenv().ok();

    // Initialise structured logging. Respects RUST_LOG env var.
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .with_target(true)
        .with_thread_ids(false)
        .with_level(true)
        .init();

    info!("═══════════════════════════════════════════════");
    info!("  Aetheris Agent V — Security Monitor v0.1.0  ");
    info!("  Network: Base Mainnet (Chain ID 8453)        ");
    info!("═══════════════════════════════════════════════");

    // Load and validate config
    let config = match config::Config::from_env() {
        Ok(c) => {
            info!("Config loaded: {} contracts on watchlist", c.watched_contracts.len());
            Arc::new(c)
        }
        Err(e) => {
            error!("Config error: {}", e);
            error!("Make sure .env is populated. See .env.example for required fields.");
            std::process::exit(1);
        }
    };

    // Open database
    let db = match db::Database::open(&config.db_path) {
        Ok(d) => {
            info!("Database ready at '{}'", config.db_path);
            Arc::new(Mutex::new(d))
        }
        Err(e) => {
            error!("Database error: {}", e);
            std::process::exit(1);
        }
    };

    // Build RPC provider (HTTP for batch reads, WS for block subscriptions)
    let rpc = Arc::new(rpc::RpcProvider::new(
        config.rpc_http_url.clone(),
        config.rpc_http_fallback.clone(),
        config.circuit_breaker_threshold,
    ));
    info!("RPC provider ready (primary={}, fallback={})",
        &config.rpc_http_url[..40.min(config.rpc_http_url.len())],
        config.rpc_http_fallback.as_deref().unwrap_or("none")
    );

    // Build alert sender
    let alerts = Arc::new(alerts::AlertSender::new(config.clone()));
    if config.has_alerts() {
        info!("Alert channels configured: Telegram={} Discord={}",
            config.telegram_bot_token.is_some(),
            config.discord_webhook_url.is_some()
        );
    } else {
        info!("No alert channels configured — alerts will be logged to stdout only");
    }

    // Register SIGTERM handler for PM2 clean shutdown
    let config_clone = config.clone();
    let alerts_clone = alerts.clone();
    tokio::spawn(async move {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install SIGTERM handler");
        info!("Shutdown signal received — Agent V stopping cleanly");
        alerts_clone
            .send_warning("Agent V", "⚠️ Agent V shutting down (SIGTERM received)")
            .await;
        std::process::exit(0);
    });

    // Start daily summary scheduler
    let db_clone = db.clone();
    let alerts_clone = alerts.clone();
    tokio::spawn(async move {
        run_daily_summary_scheduler(db_clone, alerts_clone).await;
    });

    // Start the main monitoring loop (runs forever)
    if let Err(e) = monitor::run_monitor(config, rpc, db, alerts).await {
        error!("Monitor loop terminated with error: {}", e);
        std::process::exit(1);
    }
}

/// Runs the daily summary scheduler.
/// Every day at midnight UTC, sends a summary of the day's monitoring activity.
async fn run_daily_summary_scheduler(
    db: Arc<Mutex<db::Database>>,
    alerts: Arc<alerts::AlertSender>,
) {
    loop {
        // Calculate seconds until next midnight UTC
        let now = chrono::Utc::now();
        let next_midnight = (now + chrono::Duration::days(1))
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc();
        let secs_until_midnight = (next_midnight - now).num_seconds().max(1) as u64;

        tokio::time::sleep(tokio::time::Duration::from_secs(secs_until_midnight)).await;

        // Build and send daily summary
        let summary_text = {
            let db_guard = db.lock().await;
            match db_guard.get_today_summary() {
                Ok(Some(s)) => format!(
                    "Date: {}\n\
                     Blocks monitored: {}\n\
                     Contracts watched: {}\n\
                     Threats detected: {} ({} Critical, {} High)\n\
                     Responses executed: {}\n\
                     RPC failures: {}",
                    s.date,
                    s.blocks_monitored,
                    s.contracts_watched,
                    s.threats_detected,
                    s.critical_count,
                    s.high_count,
                    s.responses_executed,
                    s.rpc_failures
                ),
                Ok(None) => "No data for today (no blocks processed?)".to_string(),
                Err(e) => format!("Failed to load daily summary: {}", e),
            }
        };

        alerts.send_daily_summary("Agent V", &summary_text).await;
    }
}
