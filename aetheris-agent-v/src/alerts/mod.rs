// Aetherisetheris-agent-v\src\alerts\mod.rs

/// alerts/mod.rs — Telegram + Discord alert sender
///
/// Sends structured alert messages to Telegram and/or Discord.
/// Alert format mirrors Agent Alpha's alert pattern.
///
/// Format:
///   [AGENT_V] 🚨 CRITICAL
///   Contract: 0x1234...5678
///   Threat: ProxySwap
///   Block: 18234567
///   Details: PROXY IMPLEMENTATION SWAPPED...
///   Old: 0xabc... → New: 0xdef...
///
/// All sends are fire-and-forget — alert failures never block the monitor loop.

use std::sync::Arc;
use tracing::{debug, warn};

use crate::config::Config;
use crate::detector::{ThreatLevel, ThreatReport};

/// Cloneable alert sender. Holds HTTP client and config references.
#[derive(Clone)]
pub struct AlertSender {
    config: Arc<Config>,
    client: reqwest::Client,
}

impl AlertSender {
    pub fn new(config: Arc<Config>) -> Self {
        Self {
            config,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("Failed to build alert HTTP client"),
        }
    }

    /// Send a threat report as a formatted alert.
    pub async fn send_threat(&self, agent: &str, threat: &ThreatReport) {
        let msg = format_threat_alert(agent, threat);
        self.broadcast(&msg).await;
    }

    /// Send an info-level message.
    pub async fn send_info(&self, agent: &str, message: &str) {
        let msg = format!("[{}] ℹ️ INFO\n{}", agent, message);
        self.broadcast(&msg).await;
    }

    /// Send a warning-level message.
    pub async fn send_warning(&self, agent: &str, message: &str) {
        let msg = format!("[{}] ⚠️ WARNING\n{}", agent, message);
        self.broadcast(&msg).await;
    }

    /// Send an error-level message.
    pub async fn send_error(&self, agent: &str, message: &str) {
        let msg = format!("[{}] ❌ ERROR\n{}", agent, message);
        self.broadcast(&msg).await;
    }

    /// Send the daily summary message.
    pub async fn send_daily_summary(&self, agent: &str, summary: &str) {
        let msg = format!("[{}] 📊 DAILY SUMMARY\n{}", agent, summary);
        self.broadcast(&msg).await;
    }

    /// Broadcast to all configured channels.
    async fn broadcast(&self, message: &str) {
        if let (Some(token), Some(chat_id)) = (
            &self.config.telegram_bot_token,
            &self.config.telegram_chat_id,
        ) {
            self.send_telegram(token, chat_id, message).await;
        }

        if let Some(webhook_url) = &self.config.discord_webhook_url {
            self.send_discord(webhook_url, message).await;
        }

        if !self.config.has_alerts() {
            debug!("[ALERT (no channels configured)] {}", message);
        }
    }

    /// Send a message via Telegram Bot API.
    async fn send_telegram(&self, token: &str, chat_id: &str, message: &str) {
        let url = format!("https://api.telegram.org/bot{}/sendMessage", token);
        let body = serde_json::json!({
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown"
        });

        match self.client.post(&url).json(&body).send().await {
            Ok(resp) if resp.status().is_success() => {
                debug!("Telegram alert sent successfully");
            }
            Ok(resp) => {
                warn!(
                    "Telegram alert HTTP {}: {}",
                    resp.status(),
                    resp.text().await.unwrap_or_default()
                );
            }
            Err(e) => {
                warn!("Telegram alert failed: {}", e);
            }
        }
    }

    /// Send a message via Discord webhook.
    async fn send_discord(&self, webhook_url: &str, message: &str) {
        // Discord webhooks have a 2000 char limit — truncate if needed
        let content = if message.len() > 1900 {
            format!("{}... [truncated]", &message[..1900])
        } else {
            message.to_string()
        };

        let body = serde_json::json!({ "content": content });

        match self.client.post(webhook_url).json(&body).send().await {
            Ok(resp) if resp.status().is_success() => {
                debug!("Discord alert sent successfully");
            }
            Ok(resp) => {
                warn!(
                    "Discord alert HTTP {}: {}",
                    resp.status(),
                    resp.text().await.unwrap_or_default()
                );
            }
            Err(e) => {
                warn!("Discord alert failed: {}", e);
            }
        }
    }
}

/// Format a ThreatReport into a structured alert message.
fn format_threat_alert(agent: &str, threat: &ThreatReport) -> String {
    let header = format!(
        "[{}] {} {}\n",
        agent,
        threat.threat_level.emoji(),
        threat.threat_level.label().to_uppercase()
    );

    let mut parts = vec![
        header,
        format!("Contract: `{}`\n", threat.contract_address),
        format!("Threat: {}\n", threat.threat_type),
        format!("Block: {}\n", threat.block_number),
        format!("Details: {}\n", threat.description),
    ];

    if let (Some(old), Some(new)) = (&threat.old_value, &threat.new_value) {
        parts.push(format!("Old: `{}`\n", old));
        parts.push(format!("New: `{}`\n", new));
    }

    if let Some(slot) = &threat.slot_key {
        parts.push(format!("Slot: `{}`\n", slot));
    }

    parts.join("")
}
