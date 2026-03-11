// Aetheris\aetheris-agent-v\src\monitor\mod.rs

/// monitor/mod.rs — Main monitoring loop
///
/// Subscribes to new blocks via WebSocket (eth_subscribe "newHeads").
/// On every new block:
///   1. Batch-read all watched storage slots in a single JSON-RPC batch
///   2. Diff against the previous block's snapshot
///   3. Classify all diffs using the detector module
///   4. Check oracle divergence
///   5. Route all ThreatReports to the responder
///   6. Persist incidents and snapshots to SQLite
///   7. Update daily summary
///
/// This module is the central nervous system of Agent V.

pub mod oracle;
pub mod ownership;
pub mod proxy;
pub mod state;
pub mod watchlist;

use anyhow::{anyhow, Result};
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};
use tracing::{error, info, warn};

use crate::alerts::AlertSender;
use crate::config::Config;
use crate::db::Database;
use crate::detector::{ThreatLevel, ThreatReport};
use crate::responder;
use crate::rpc::multicall::{normalise_slot_value, SlotReadRequest};
use crate::rpc::RpcProvider;
use self::state::SlotSnapshot;
use self::watchlist::{build_watchlist, SlotType, WatchedContract};

/// Run the main monitoring loop. This function does not return under normal
/// operation — it loops until the process is killed or an unrecoverable error
/// occurs.
pub async fn run_monitor(
    config: Arc<Config>,
    rpc: Arc<RpcProvider>,
    db: Arc<Mutex<Database>>,
    alerts: Arc<AlertSender>,
) -> Result<()> {
    let watchlist = build_watchlist(&config);
    info!(
        "Watchlist: {} contracts, {} total slot reads per block",
        watchlist.len(),
        watchlist::total_slot_reads(&watchlist)
    );

    // Seed snapshot from DB (avoids false positives on startup)
    let mut snapshot = SlotSnapshot::new();
    {
        let db_guard = db.lock().await;
        let saved = db_guard.load_latest_snapshots()?;
        for (contract, slot, value) in saved {
            snapshot.seed(&contract, &slot, &value);
        }
    }
    info!("Snapshot seeded with {} entries from DB", snapshot.len());

    alerts
        .send_info("Agent V", "🟢 Agent V started. Monitoring all watched contracts.")
        .await;

    // Connect to WebSocket for block subscription
    connect_and_monitor(config, rpc, db, alerts, watchlist, snapshot).await
}

/// Connects to the WebSocket endpoint and subscribes to newHeads.
/// If the connection drops, reconnects automatically with backoff.
async fn connect_and_monitor(
    config: Arc<Config>,
    rpc: Arc<RpcProvider>,
    db: Arc<Mutex<Database>>,
    alerts: Arc<AlertSender>,
    watchlist: Vec<WatchedContract>,
    mut snapshot: SlotSnapshot,
) -> Result<()> {
    let mut reconnect_delay_secs = 2u64;
    const MAX_RECONNECT_DELAY: u64 = 60;

    loop {
        info!("Connecting to WebSocket: {}", &config.rpc_ws_url[..40]);

        match connect_async(&config.rpc_ws_url).await {
            Err(e) => {
                warn!("WebSocket connection failed: {}. Retrying in {}s", e, reconnect_delay_secs);
                tokio::time::sleep(tokio::time::Duration::from_secs(reconnect_delay_secs)).await;
                reconnect_delay_secs = (reconnect_delay_secs * 2).min(MAX_RECONNECT_DELAY);
                continue;
            }
            Ok((mut ws_stream, _)) => {
                reconnect_delay_secs = 2; // Reset on success

                // Subscribe to newHeads
                let subscribe_msg = serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "eth_subscribe",
                    "params": ["newHeads"]
                });
                if let Err(e) = ws_stream.send(Message::Text(subscribe_msg.to_string())).await {
                    warn!("Failed to send subscribe message: {}", e);
                    continue;
                }

                // Skip subscription confirmation message
                let _ = ws_stream.next().await;

                info!("WebSocket connected. Waiting for blocks...");

                // Block processing loop
                while let Some(msg) = ws_stream.next().await {
                    match msg {
                        Ok(Message::Text(text)) => {
                            if let Err(e) = process_block_message(
                                &text,
                                &config,
                                &rpc,
                                &db,
                                &alerts,
                                &watchlist,
                                &mut snapshot,
                            )
                            .await
                            {
                                error!("Block processing error: {}", e);
                            }
                        }
                        Ok(Message::Ping(data)) => {
                            let _ = ws_stream.send(Message::Pong(data)).await;
                        }
                        Ok(Message::Close(_)) => {
                            warn!("WebSocket closed by server. Reconnecting...");
                            break;
                        }
                        Err(e) => {
                            warn!("WebSocket error: {}. Reconnecting...", e);
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }
    }
}

/// Process a single newHeads notification.
/// This is the per-block processing function called from the WS loop.
async fn process_block_message(
    text: &str,
    config: &Arc<Config>,
    rpc: &Arc<RpcProvider>,
    db: &Arc<Mutex<Database>>,
    alerts: &Arc<AlertSender>,
    watchlist: &[WatchedContract],
    snapshot: &mut SlotSnapshot,
) -> Result<()> {
    // Parse block number from the newHeads notification
    let json: serde_json::Value =
        serde_json::from_str(text).map_err(|e| anyhow!("JSON parse error: {}", e))?;

    let block_number_hex = json["params"]["result"]["number"]
        .as_str()
        .ok_or_else(|| anyhow!("Missing block number in newHeads"))?;

    let block_number = u64::from_str_radix(
        block_number_hex.strip_prefix("0x").unwrap_or(block_number_hex),
        16,
    )
    .map_err(|e| anyhow!("Failed to parse block number '{}': {}", block_number_hex, e))?;

    let timestamp = Utc::now().timestamp();

    info!("Block #{}: reading {} slots", block_number, watchlist::total_slot_reads(watchlist));

    // Build the batch of slot reads
    let requests: Vec<SlotReadRequest> = watchlist
        .iter()
        .flat_map(|contract| {
            contract.slots.iter().map(move |slot| SlotReadRequest {
                contract_address: contract.address.clone(),
                slot_key: slot.slot_key.clone(),
            })
        })
        .collect();

    // Batch-read all slots in one JSON-RPC batch call
    let results = match rpc.batch_read_slots(&requests, "latest").await {
        Ok(r) => r,
        Err(e) => {
            // RPC failure — do NOT trigger emergency responses, just alert
            let msg = format!("Block #{}: RPC failure reading slots: {}", block_number, e);
            warn!("{}", msg);
            if rpc.is_circuit_open() {
                alerts.send_warning("Agent V", &format!("⚠️ Circuit open: {}", msg)).await;
            }
            // Update daily summary with RPC failure count
            let mut db_guard = db.lock().await;
            db_guard.record_rpc_failure(block_number)?;
            return Ok(());
        }
    };

    // Build normalised (contract, slot, value) tuples for diff check
    let reads_for_diff: Vec<(String, String, String)> = results
        .iter()
        .filter_map(|r| {
            r.value.as_ref().map(|v| {
                (
                    r.contract_address.clone(),
                    r.slot_key.clone(),
                    normalise_slot_value(v),
                )
            })
        })
        .collect();

    // Diff against snapshot — returns only changed slots
    let diffs = snapshot.diff_and_update(&reads_for_diff);

    // Classify all diffs and collect threat reports
    let mut threats: Vec<ThreatReport> = Vec::new();

    for diff in &diffs {
        // Find the WatchedSlot definition to know how to classify it
        let slot_def = watchlist
            .iter()
            .find(|c| c.address == diff.contract_address)
            .and_then(|c| c.slots.iter().find(|s| s.slot_key == diff.slot_key));

        let slot_type = slot_def
            .map(|s| &s.slot_type)
            .unwrap_or(&SlotType::GeneralState);

        let threat = match slot_type {
            SlotType::ProxyImplementation | SlotType::ProxyAdmin => {
                proxy::analyse_proxy_slot_change(
                    block_number,
                    timestamp,
                    &diff.contract_address,
                    &diff.slot_key,
                    slot_type,
                    &diff.old_value,
                    &diff.new_value,
                )
            }
            SlotType::Ownership => ownership::analyse_ownership_change(
                block_number,
                timestamp,
                &diff.contract_address,
                &diff.slot_key,
                slot_type,
                &diff.old_value,
                &diff.new_value,
            ),
            SlotType::HiddenFunction => Some(crate::detector::classify_hidden_function(
                block_number,
                timestamp,
                &diff.contract_address,
                &diff.slot_key,
                &diff.old_value,
                &diff.new_value,
            )),
            SlotType::GeneralState => Some(crate::detector::classify_unexpected_change(
                block_number,
                timestamp,
                &diff.contract_address,
                &diff.slot_key,
                &diff.old_value,
                &diff.new_value,
            )),
        };

        if let Some(t) = threat {
            threats.push(t);
        }
    }

    // Oracle divergence check (separate from slot diffs)
    let oracle_result = oracle::check_oracle_divergence(
        rpc,
        &config.chainlink_eth_usd,
        &config.pyth_contract,
        &config.pyth_eth_usd_feed_id,
        config.oracle_divergence_bps,
        block_number,
        timestamp,
    )
    .await;

    if let Some(oracle_threat) = oracle_result.threat {
        threats.push(oracle_threat);
    }

    // Route all threats
    if !threats.is_empty() {
        info!(
            "Block #{}: {} threats detected",
            block_number,
            threats.len()
        );
    }

    for threat in &threats {
        // Persist to DB
        {
            let mut db_guard = db.lock().await;
            db_guard.insert_incident(threat)?;
        }

        // Send alert
        alerts.send_threat("Agent V", threat).await;

        // Execute emergency response for Critical and High threats
        // Only if circuit is NOT open (prevents false-trigger on RPC failures)
        if threat.threat_level >= ThreatLevel::High && !rpc.is_circuit_open() {
            if let Err(e) = responder::execute_response(config, threat, db.clone()).await {
                error!("Emergency response failed: {}", e);
                alerts
                    .send_error(
                        "Agent V",
                        &format!("❌ Emergency response failed: {}", e),
                    )
                    .await;
            }
        }
    }

    // Persist snapshot to DB every 100 blocks
    if block_number % 100 == 0 {
        let db_guard = db.lock().await;
        for (key, value) in snapshot.entries() {
            let _ = db_guard.upsert_snapshot(
                block_number,
                &key.contract_address,
                &key.slot_key,
                value,
            );
        }
        info!("Block #{}: snapshot persisted to DB", block_number);
    }

    // Update daily summary
    {
        let mut db_guard = db.lock().await;
        db_guard.update_daily_summary(
            block_number,
            watchlist.len() as u32,
            threats.len() as u32,
            threats.iter().filter(|t| t.threat_level == ThreatLevel::Critical).count() as u32,
            threats.iter().filter(|t| t.threat_level == ThreatLevel::High).count() as u32,
        )?;
    }

    Ok(())
}
