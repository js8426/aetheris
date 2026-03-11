// Aetheris\aetheris-agent-v\src\responder\mod.rs

/// responder/mod.rs — Response router
///
/// Decides what to do with a ThreatReport based on its ThreatLevel.
/// Routes to the appropriate response:
///   Critical → execute all emergency on-chain responses + alert
///   High     → alert + execute emergency responses
///   Medium   → alert only
///   Low      → log only

pub mod emergency;

use anyhow::Result;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, warn};

use crate::config::Config;
use crate::db::Database;
use crate::detector::{ThreatLevel, ThreatReport};
use self::emergency::execute_emergency_responses;

/// Execute the appropriate response for a given threat.
///
/// For Critical and High threats, executes on-chain emergency responses.
/// Returns Ok(()) whether or not on-chain responses succeed — individual
/// failures are logged but don't bubble up to the monitor loop.
pub async fn execute_response(
    config: &Arc<Config>,
    threat: &ThreatReport,
    db: Arc<Mutex<Database>>,
) -> Result<()> {
    match &threat.threat_level {
        ThreatLevel::None | ThreatLevel::Low => {
            info!("[RESPONDER] Low/None threat — log only. {}", threat.description);
            Ok(())
        }
        ThreatLevel::Medium => {
            info!("[RESPONDER] Medium threat — alerted, no on-chain action. {}", threat.description);
            Ok(())
        }
        ThreatLevel::High | ThreatLevel::Critical => {
            warn!(
                "[RESPONDER] {} threat on {} — executing emergency responses",
                threat.threat_level, threat.contract_address
            );

            // Build RPC provider just for the emergency response
            let rpc = crate::rpc::RpcProvider::new(
                config.rpc_http_url.clone(),
                config.rpc_http_fallback.clone(),
                config.circuit_breaker_threshold,
            );

            match execute_emergency_responses(config, &rpc).await {
                Ok(result) => {
                    // Determine the response description string
                    let response_parts: Vec<String> = [
                        result.beta_emergency_return_tx.as_ref().map(|tx| format!("Beta.emergencyReturn={}", tx)),
                        result.alpha_pause_tx.as_ref().map(|tx| format!("Alpha.pause={}", tx)),
                        result.vault_pause_tx.as_ref().map(|tx| format!("Vault.pause={}", tx)),
                    ]
                    .into_iter()
                    .flatten()
                    .collect();

                    let response_desc = if response_parts.is_empty() {
                        "All emergency calls failed".to_string()
                    } else {
                        response_parts.join(", ")
                    };

                    info!("[RESPONDER] Emergency responses submitted: {}", response_desc);

                    // Update the incident record with response details
                    let mut db_guard = db.lock().await;
                    db_guard.update_incident_response(
                        threat.block_number,
                        &threat.contract_address,
                        &response_desc,
                        result.alpha_pause_tx.as_deref().or(result.vault_pause_tx.as_deref()),
                    )?;

                    Ok(())
                }
                Err(e) => {
                    warn!("[RESPONDER] Emergency responses failed: {}", e);
                    Err(e)
                }
            }
        }
    }
}
