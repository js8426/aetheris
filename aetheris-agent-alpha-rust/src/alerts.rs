/// Aetheris\aetheris-agent-alpha-rust\src\alerts.rs
///
/// Telegram + Discord alerting. Fire-and-forget async sends.

use reqwest::Client;
use tracing::warn;

pub struct Alerter {
    client:          Client,
    telegram_token:  Option<String>,
    telegram_chat:   Option<String>,
    discord_webhook: Option<String>,
}

impl Alerter {
    pub fn new() -> Self {
        let telegram_token  = std::env::var("TELEGRAM_BOT_TOKEN").ok().filter(|s| !s.is_empty());
        let telegram_chat   = std::env::var("TELEGRAM_CHAT_ID").ok().filter(|s| !s.is_empty());
        let discord_webhook = std::env::var("DISCORD_WEBHOOK_URL").ok().filter(|s| !s.is_empty());

        let enabled = telegram_token.is_some() || discord_webhook.is_some();
        tracing::info!(
            "[ALERT] {} (Telegram={} Discord={})",
            if enabled { "Enabled" } else { "Disabled (no credentials)" },
            telegram_token.is_some(),
            discord_webhook.is_some(),
        );

        Self {
            client: Client::new(),
            telegram_token,
            telegram_chat,
            discord_webhook,
        }
    }

    /// Non-blocking send — spawns a task and returns immediately.
    pub fn send(&self, message: String) {
        let client    = self.client.clone();
        let token     = self.telegram_token.clone();
        let chat_id   = self.telegram_chat.clone();
        let discord   = self.discord_webhook.clone();

        tokio::spawn(async move {
            if let (Some(tok), Some(chat)) = (token, chat_id) {
                let url = format!("https://api.telegram.org/bot{tok}/sendMessage");
                let _ = client
                    .post(&url)
                    .json(&serde_json::json!({
                        "chat_id": chat,
                        "text":    message,
                        "parse_mode": "HTML",
                    }))
                    .timeout(std::time::Duration::from_secs(5))
                    .send()
                    .await;
            }
            if let Some(webhook) = discord {
                let _ = client
                    .post(&webhook)
                    .json(&serde_json::json!({ "content": message }))
                    .timeout(std::time::Duration::from_secs(5))
                    .send()
                    .await;
            }
        });
    }
}
