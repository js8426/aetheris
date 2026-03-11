// Aetherisetheris-agent-v\src\rpc\mod.rs

/// rpc/mod.rs — Multi-RPC provider with failover and health tracking
///
/// Wraps two HTTP RPC endpoints (primary + fallback) with automatic failover.
/// If the primary fails, requests are re-tried on the fallback transparently.
/// Tracks consecutive failure counts per endpoint for circuit-breaker logic.
///
/// Pattern mirrors Agent Alpha's rpc/pool.rs.

pub mod multicall;

use anyhow::{anyhow, Result};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use tracing::{info, warn};

/// Shared, cloneable RPC provider.
#[derive(Clone)]
pub struct RpcProvider {
    inner: Arc<RpcProviderInner>,
}

struct RpcProviderInner {
    primary_url: String,
    fallback_url: String,  // empty string = no fallback configured
    client: reqwest::Client,
    /// Consecutive failures on the primary endpoint
    primary_failures: AtomicU32,
    /// Consecutive failures on the fallback endpoint
    fallback_failures: AtomicU32,
    /// After this many consecutive failures, we stop auto-triggering responses
    failure_threshold: u32,
}

impl RpcProvider {
    pub fn new(primary_url: String, fallback_url: Option<String>, failure_threshold: u32) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .pool_max_idle_per_host(10)
            .build()
            .expect("Failed to build HTTP client");

        Self {
            inner: Arc::new(RpcProviderInner {
                primary_url,
                fallback_url: fallback_url.unwrap_or_default(),
                client,
                primary_failures: AtomicU32::new(0),
                fallback_failures: AtomicU32::new(0),
                failure_threshold,
            }),
        }
    }

    /// Returns a reference to the underlying reqwest client.
    pub fn client(&self) -> &reqwest::Client {
        &self.inner.client
    }

    /// Returns the currently active HTTP URL.
    /// If primary has accumulated too many failures, returns fallback.
    pub fn active_url(&self) -> &str {
        let primary_failures = self.inner.primary_failures.load(Ordering::Relaxed);
        if primary_failures >= self.inner.failure_threshold {
            warn!(
                "Primary RPC has {} consecutive failures, using fallback",
                primary_failures
            );
            &self.inner.fallback_url
        } else {
            &self.inner.primary_url
        }
    }

    /// Record a successful call to the primary endpoint. Resets failure count.
    pub fn record_primary_success(&self) {
        let prev = self.inner.primary_failures.swap(0, Ordering::Relaxed);
        if prev > 0 {
            info!("Primary RPC recovered after {} failures", prev);
        }
    }

    /// Record a failed call. Increments primary failure count.
    pub fn record_primary_failure(&self) {
        let count = self.inner.primary_failures.fetch_add(1, Ordering::Relaxed) + 1;
        warn!("Primary RPC failure #{}", count);
    }

    /// Record a successful call to the fallback endpoint.
    pub fn record_fallback_success(&self) {
        let prev = self.inner.fallback_failures.swap(0, Ordering::Relaxed);
        if prev > 0 {
            info!("Fallback RPC recovered after {} failures", prev);
        }
    }

    /// Record a fallback failure.
    pub fn record_fallback_failure(&self) {
        let count = self.inner.fallback_failures.fetch_add(1, Ordering::Relaxed) + 1;
        warn!("Fallback RPC failure #{}", count);
    }

    /// Returns true if both RPC endpoints are failing above threshold.
    /// In this state, Agent V should NOT execute emergency responses (to avoid
    /// false positives from network issues).
    pub fn is_circuit_open(&self) -> bool {
        let pf = self.inner.primary_failures.load(Ordering::Relaxed);
        let ff = self.inner.fallback_failures.load(Ordering::Relaxed);
        pf >= self.inner.failure_threshold && ff >= self.inner.failure_threshold
    }

    /// Total consecutive failures across both endpoints.
    pub fn total_failures(&self) -> u32 {
        self.inner.primary_failures.load(Ordering::Relaxed)
            + self.inner.fallback_failures.load(Ordering::Relaxed)
    }

    /// Batch-read storage slots using the active endpoint, with fallback on failure.
    pub async fn batch_read_slots(
        &self,
        requests: &[multicall::SlotReadRequest],
        block_tag: &str,
    ) -> Result<Vec<multicall::SlotReadResult>> {
        // Try primary first
        let primary_url = self.inner.primary_url.clone();
        match multicall::batch_read_storage_slots(
            &self.inner.client,
            &primary_url,
            requests,
            block_tag,
        )
        .await
        {
            Ok(results) => {
                self.record_primary_success();
                Ok(results)
            }
            Err(e) => {
                self.record_primary_failure();
                warn!("Primary RPC batch read failed: {}. Trying fallback.", e);

                // Try fallback
                let fallback_url = self.inner.fallback_url.clone();
                match multicall::batch_read_storage_slots(
                    &self.inner.client,
                    &fallback_url,
                    requests,
                    block_tag,
                )
                .await
                {
                    Ok(results) => {
                        self.record_fallback_success();
                        Ok(results)
                    }
                    Err(e2) => {
                        self.record_fallback_failure();
                        Err(anyhow!(
                            "Both RPC endpoints failed. Primary: {}. Fallback: {}",
                            e,
                            e2
                        ))
                    }
                }
            }
        }
    }

    /// Execute a raw JSON-RPC call with failover.
    /// Returns the "result" field from the JSON-RPC response.
    pub async fn call_raw(&self, method: &str, params: serde_json::Value) -> Result<serde_json::Value> {
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params
        });

        let primary_url = self.inner.primary_url.clone();
        match self
            .inner
            .client
            .post(&primary_url)
            .json(&body)
            .send()
            .await
        {
            Ok(resp) => {
                let json: serde_json::Value = resp.json().await?;
                if let Some(err) = json.get("error") {
                    self.record_primary_failure();
                    return Err(anyhow!("RPC error: {}", err));
                }
                self.record_primary_success();
                Ok(json["result"].clone())
            }
            Err(e) => {
                self.record_primary_failure();
                warn!("Primary RPC call_raw failed: {}. Trying fallback.", e);

                let fallback_url = self.inner.fallback_url.clone();
                let resp = self
                    .inner
                    .client
                    .post(&fallback_url)
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e2| anyhow!("Both RPCs failed: primary={}, fallback={}", e, e2))?;

                let json: serde_json::Value = resp.json().await?;
                if let Some(err) = json.get("error") {
                    self.record_fallback_failure();
                    return Err(anyhow!("Fallback RPC error: {}", err));
                }
                self.record_fallback_success();
                Ok(json["result"].clone())
            }
        }
    }
}
