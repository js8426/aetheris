/// Aetheris\aetheris-agent-alpha-rust\src\ws.rs
///
/// WebSocket block subscriber (Phase 2 U1).
///
/// Subscribes to eth_subscribe("newHeads") via an alloy WS provider.
/// On every new block header, sends the block number through a tokio channel
/// so the main scan loop can start immediately — no polling delay.
///
/// If the WS connection is lost the loop reconnects with exponential back-off.
/// Flashblock-ready: swap the WS URL for a Flashblock endpoint and this
/// module handles it transparently.

use alloy::{
    providers::{Provider, ProviderBuilder, WsConnect},
    rpc::types::Header,
};
use futures::StreamExt;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{error, info, warn};

const RECONNECT_MIN_S: u64 = 1;
const RECONNECT_MAX_S: u64 = 60;

/// Spawn the WebSocket subscriber.
///
/// Returns a receiver that yields the block number of every new block.
/// The channel is unbounded on the sender side so the subscriber never blocks;
/// the scanner is expected to drain it promptly.
pub fn spawn(ws_url: String) -> mpsc::UnboundedReceiver<u64> {
    let (tx, rx) = mpsc::unbounded_channel::<u64>();

    tokio::spawn(async move {
        let mut backoff_s = RECONNECT_MIN_S;

        loop {
            info!("[U1] Connecting to WebSocket: {}", ws_url);

            match try_subscribe(&ws_url, tx.clone()).await {
                Ok(()) => {
                    // Returned cleanly (stream ended) — reconnect immediately
                    warn!("[U1] WS stream ended, reconnecting...");
                    backoff_s = RECONNECT_MIN_S;
                }
                Err(e) => {
                    error!("[U1] WS error: {e} — retrying in {backoff_s}s");
                    tokio::time::sleep(Duration::from_secs(backoff_s)).await;
                    backoff_s = (backoff_s * 2).min(RECONNECT_MAX_S);
                }
            }
        }
    });

    rx
}

/// Connect, subscribe, and forward block numbers until the stream ends.
async fn try_subscribe(
    ws_url: &str,
    tx: mpsc::UnboundedSender<u64>,
) -> anyhow::Result<()> {
    let ws = WsConnect::new(ws_url);
    let provider = ProviderBuilder::new()
        .on_ws(ws)
        .await
        .map_err(|e| anyhow::anyhow!("WS connect failed: {e}"))?;

    info!("[U1] WebSocket connected ✓");

    let mut stream = provider.subscribe_blocks().await?.into_stream();

    while let Some(header) = stream.next().await {
        let block_num = header.number;
        // Non-blocking send — if the scanner is behind we just continue;
        // it will catch up on the next block.
        let _ = tx.send(block_num);
    }

    Ok(())
}
