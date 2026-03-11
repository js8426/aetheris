/// Aetheris\aetheris-agent-alpha-rust\src\rpc\pool.rs
///
/// Multi-RPC pool with automatic failover (Phase 2 U4).
/// Maintains health metrics for each endpoint and always routes calls to the
/// lowest-latency healthy node. Falls back to the primary if all are degraded.

use std::{
    sync::{Arc, atomic::{AtomicU64, Ordering}},
    time::{Duration, Instant},
};
use tokio::sync::RwLock;
use tracing::{info, warn};

#[derive(Debug, Clone)]
pub struct EndpointHealth {
    pub url:             String,
    pub latency_ms:      f64,
    pub error_count:     u32,
    pub is_healthy:      bool,
    pub failover_events: u32,
}

/// Thread-safe, async RPC pool with health tracking.
/// Callers call `best_url()` to get the current recommended endpoint URL,
/// then construct their own provider with that URL (alloy providers are not
/// easily shared across tasks, so we track URLs and let callers build providers).
pub struct RpcPool {
    endpoints: RwLock<Vec<EndpointHealth>>,
    call_count: AtomicU64,
}

impl RpcPool {
    pub fn new(primary: String, secondary: Option<String>, tertiary: Option<String>) -> Arc<Self> {
        let mut endpoints = vec![EndpointHealth {
            url:             primary,
            latency_ms:      999.0,
            error_count:     0,
            is_healthy:      true,
            failover_events: 0,
        }];
        if let Some(url) = secondary {
            if !url.is_empty() {
                endpoints.push(EndpointHealth {
                    url,
                    latency_ms:      999.0,
                    error_count:     0,
                    is_healthy:      true,
                    failover_events: 0,
                });
            }
        }
        if let Some(url) = tertiary {
            if !url.is_empty() && !endpoints.iter().any(|e| e.url == url) {
                endpoints.push(EndpointHealth {
                    url,
                    latency_ms:      999.0,
                    error_count:     0,
                    is_healthy:      true,
                    failover_events: 0,
                });
            }
        }

        info!("[U4] RpcPool initialised with {} endpoints:", endpoints.len());
        for ep in &endpoints {
            info!("[U4]   {}", &ep.url[..ep.url.len().min(60)]);
        }

        Arc::new(Self {
            endpoints: RwLock::new(endpoints),
            call_count: AtomicU64::new(0),
        })
    }

    /// Return the URL of the best available endpoint.
    pub async fn best_url(&self) -> String {
        self.call_count.fetch_add(1, Ordering::Relaxed);
        let eps = self.endpoints.read().await;
        let healthy: Vec<_> = eps.iter().filter(|e| e.is_healthy).collect();
        if healthy.is_empty() {
            warn!("[U4] All endpoints unhealthy, falling back to primary");
            return eps[0].url.clone();
        }
        healthy
            .iter()
            .min_by(|a, b| a.latency_ms.partial_cmp(&b.latency_ms).unwrap())
            .unwrap()
            .url
            .clone()
    }

    /// Record a successful call to `url` with the given latency.
    pub async fn record_success(&self, url: &str, latency_ms: f64) {
        let mut eps = self.endpoints.write().await;
        if let Some(ep) = eps.iter_mut().find(|e| e.url == url) {
            // Exponential moving average: 30% weight to new measurement
            ep.latency_ms = 0.7 * ep.latency_ms + 0.3 * latency_ms;
            ep.error_count = 0;
            ep.is_healthy  = true;
        }
    }

    /// Record a failed call to `url`.
    pub async fn record_error(&self, url: &str) {
        let mut eps = self.endpoints.write().await;
        if let Some(ep) = eps.iter_mut().find(|e| e.url == url) {
            ep.error_count += 1;
            if ep.error_count >= crate::config::RPC_MAX_CONSECUTIVE_ERR {
                ep.is_healthy = false;
                warn!(
                    "[U4] Endpoint marked unhealthy after {} errors: {}",
                    ep.error_count,
                    &ep.url[..ep.url.len().min(60)]
                );
            }
        }
    }

    /// Background health-check loop — call this in a spawned task.
    pub async fn health_loop(self: Arc<Self>) {
        loop {
            tokio::time::sleep(Duration::from_secs(crate::config::RPC_HEALTH_INTERVAL_S)).await;
            self.run_health_checks().await;
        }
    }

    async fn run_health_checks(&self) {
        let urls: Vec<String> = self.endpoints.read().await
            .iter().map(|e| e.url.clone()).collect();

        for url in urls {
            let start = Instant::now();
            // Simple health check: eth_blockNumber via JSON-RPC
            let result = reqwest::Client::new()
                .post(&url)
                .json(&serde_json::json!({
                    "jsonrpc": "2.0",
                    "method": "eth_blockNumber",
                    "params": [],
                    "id": 1
                }))
                .timeout(Duration::from_secs(3))
                .send()
                .await;

            let latency_ms = start.elapsed().as_secs_f64() * 1000.0;

            match result {
                Ok(resp) if resp.status().is_success() => {
                    let mut eps = self.endpoints.write().await;
                    if let Some(ep) = eps.iter_mut().find(|e| e.url == url) {
                        ep.latency_ms = latency_ms;
                        ep.error_count = 0;
                        ep.is_healthy = latency_ms < crate::config::RPC_MAX_LATENCY_MS as f64;
                        if !ep.is_healthy {
                            warn!("[U4] High latency ({:.0}ms) on {}", latency_ms, &url[..url.len().min(60)]);
                        }
                    }
                }
                _ => {
                    let mut eps = self.endpoints.write().await;
                    if let Some(ep) = eps.iter_mut().find(|e| e.url == url) {
                        ep.error_count += 1;
                        ep.is_healthy = false;
                        warn!("[U4] Health check failed for {}", &url[..url.len().min(60)]);
                    }
                }
            }
        }
    }

    /// Return current status of all endpoints for display.
    pub async fn status(&self) -> Vec<EndpointHealth> {
        self.endpoints.read().await.clone()
    }
}
