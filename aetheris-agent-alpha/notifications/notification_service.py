# Aetheris\aetheris-protocol\notifications\notification_service.py

# Aetheris\aetheris-agent-alpha\notifications\notification_service.py

"""
Aetheris Security Agent V — User Notification System

Subscribes to the Redis pub/sub channel and dispatches security alerts via:
  - Email (SendGrid)
  - Discord bot
  - Twitter/X bot
  - Dashboard (WebSocket push)

Severity routing:
  INFO     → Dashboard only
  LOW      → Dashboard + Discord
  MEDIUM   → Dashboard + Discord + Email
  HIGH     → All channels
  CRITICAL → All channels + PagerDuty (immediate escalation)
  EMERGENCY→ All channels + PagerDuty + SMS

Dependencies:
    pip install sendgrid tweepy aiohttp redis structlog
    pip install fastapi uvicorn websockets python-dotenv
"""

import asyncio
import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import aiohttp
import redis.asyncio as aioredis
import structlog
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, To

load_dotenv()

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
)
log = structlog.get_logger("aetheris.notifications")


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
class Config:
    REDIS_URL:          str = os.getenv("REDIS_URL", "redis://localhost:6379")
    SENDGRID_API_KEY:   str = os.getenv("SENDGRID_API_KEY", "")
    FROM_EMAIL:         str = os.getenv("FROM_EMAIL", "security@aetheris.io")
    DISCORD_BOT_TOKEN:  str = os.getenv("DISCORD_BOT_TOKEN", "")
    DISCORD_CHANNEL_ID: str = os.getenv("DISCORD_ALERT_CHANNEL_ID", "")
    TWITTER_BEARER:     str = os.getenv("TWITTER_BEARER_TOKEN", "")
    TWITTER_API_KEY:    str = os.getenv("TWITTER_API_KEY", "")
    TWITTER_API_SECRET: str = os.getenv("TWITTER_API_SECRET", "")
    TWITTER_TOKEN:      str = os.getenv("TWITTER_ACCESS_TOKEN", "")
    TWITTER_SECRET:     str = os.getenv("TWITTER_ACCESS_TOKEN_SECRET", "")
    PAGERDUTY_KEY:      str = os.getenv("PAGERDUTY_INTEGRATION_KEY", "")
    BASESCAN_URL:       str = "https://basescan.org/address"


# ─────────────────────────────────────────────────────────────────────────────
# Routing Table — which channels fire for each severity
# ─────────────────────────────────────────────────────────────────────────────
SEVERITY_ROUTING = {
    "INFO":      ["dashboard"],
    "LOW":       ["dashboard", "discord"],
    "MEDIUM":    ["dashboard", "discord", "email"],
    "HIGH":      ["dashboard", "discord", "email", "twitter"],
    "CRITICAL":  ["dashboard", "discord", "email", "twitter", "pagerduty"],
    "EMERGENCY": ["dashboard", "discord", "email", "twitter", "pagerduty"],
}

SEVERITY_COLORS = {
    "INFO":      0x5865F2,   # Discord blurple
    "LOW":       0x57F287,   # Green
    "MEDIUM":    0xFEE75C,   # Yellow
    "HIGH":      0xED4245,   # Red
    "CRITICAL":  0xFF0000,   # Bright red
    "EMERGENCY": 0xFF0000,
}

SEVERITY_EMOJI = {
    "INFO":      "📋",
    "LOW":       "ℹ️",
    "MEDIUM":    "🔶",
    "HIGH":      "⚠️",
    "CRITICAL":  "🚨",
    "EMERGENCY": "🆘",
}


# ─────────────────────────────────────────────────────────────────────────────
# Channel: Email (SendGrid)
# ─────────────────────────────────────────────────────────────────────────────
class EmailNotifier:
    def __init__(self):
        self._sg = SendGridAPIClient(Config.SENDGRID_API_KEY) if Config.SENDGRID_API_KEY else None

    async def send(self, alert: dict, recipients: list[str]):
        if not self._sg or not recipients:
            return

        severity  = alert.get("severity", "UNKNOWN")
        contract  = alert.get("contract", "")
        emoji     = SEVERITY_EMOJI.get(severity, "⚠️")
        basescan  = f"{Config.BASESCAN_URL}/{contract}"
        timestamp = datetime.fromtimestamp(alert.get("timestamp", time.time()), tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #ffffff; padding: 32px;">
  <div style="max-width: 600px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 32px; border: 1px solid #e63946;">
    <div style="display: flex; align-items: center; margin-bottom: 24px;">
      <span style="font-size: 32px; margin-right: 12px;">{emoji}</span>
      <div>
        <h1 style="margin: 0; color: #e63946; font-size: 20px;">
          Aetheris Security Alert — {severity}
        </h1>
        <p style="margin: 4px 0 0; color: #aaa; font-size: 13px;">{timestamp}</p>
      </div>
    </div>

    <div style="background: #0d0d1a; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <p style="margin: 0 0 12px; font-size: 15px; line-height: 1.6; color: #e0e0e0;">
        {alert.get("description", "")}
      </p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>
        <td style="padding: 8px 12px; background: #0d0d1a; color: #aaa; font-size: 13px; width: 35%; border-radius: 4px 0 0 4px;">Contract</td>
        <td style="padding: 8px 12px; background: #0d0d1a; font-family: monospace; font-size: 12px;">{contract}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; color: #aaa; font-size: 13px;">Change Type</td>
        <td style="padding: 8px 12px; font-size: 13px;">{alert.get("change_type", "")}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; background: #0d0d1a; color: #aaa; font-size: 13px;">Block</td>
        <td style="padding: 8px 12px; background: #0d0d1a; font-family: monospace; font-size: 13px;">{alert.get("block_number", "")}</td>
      </tr>
      {"<tr><td style='padding: 8px 12px; color: #aaa; font-size: 13px;'>Old Value</td><td style='padding: 8px 12px; font-family: monospace; font-size: 12px; word-break: break-all;'>" + str(alert.get("old_value", "N/A")) + "</td></tr>" if alert.get("old_value") else ""}
      {"<tr><td style='padding: 8px 12px; background: #0d0d1a; color: #aaa; font-size: 13px;'>New Value</td><td style='padding: 8px 12px; background: #0d0d1a; font-family: monospace; font-size: 12px; word-break: break-all;'>" + str(alert.get("new_value", "N/A")) + "</td></tr>" if alert.get("new_value") else ""}
    </table>

    <a href="{basescan}" style="display: inline-block; background: #e63946; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-bottom: 20px;">
      View on Basescan →
    </a>

    <div style="border-top: 1px solid #333; padding-top: 16px; margin-top: 20px;">
      <p style="color: #555; font-size: 12px; margin: 0;">
        This is an automated security alert from Aetheris Agent V.<br>
        To manage your notification preferences, visit <a href="https://app.aetheris.io/settings" style="color: #e63946;">app.aetheris.io</a>
      </p>
    </div>
  </div>
</body>
</html>"""

        subject = f"{emoji} [{severity}] Aetheris Security Alert — {alert.get('change_type', '')}"

        try:
            to_list = [To(email=r) for r in recipients]
            message = Mail(
                from_email=Config.FROM_EMAIL,
                to_emails=to_list,
                subject=subject,
                html_content=html,
            )
            await asyncio.to_thread(self._sg.send, message)
            log.info("email_sent", recipients=len(recipients), severity=severity)
        except Exception as e:
            log.error("email_send_error", error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Channel: Discord
# ─────────────────────────────────────────────────────────────────────────────
class DiscordNotifier:
    DISCORD_API = "https://discord.com/api/v10"

    async def send(self, alert: dict):
        if not Config.DISCORD_BOT_TOKEN or not Config.DISCORD_CHANNEL_ID:
            return

        severity  = alert.get("severity", "UNKNOWN")
        contract  = alert.get("contract", "")
        emoji     = SEVERITY_EMOJI.get(severity, "⚠️")
        color     = SEVERITY_COLORS.get(severity, 0xED4245)
        basescan  = f"{Config.BASESCAN_URL}/{contract}"
        timestamp = datetime.fromtimestamp(
            alert.get("timestamp", time.time()), tz=timezone.utc
        ).isoformat()

        embed = {
            "title": f"{emoji} Security Alert — {severity}",
            "description": alert.get("description", ""),
            "color": color,
            "fields": [
                {"name": "Contract",    "value": f"`{contract}`",                     "inline": False},
                {"name": "Change Type", "value": alert.get("change_type", ""),         "inline": True},
                {"name": "Block",       "value": str(alert.get("block_number", "")),   "inline": True},
            ],
            "footer": {"text": "Aetheris Security Agent V"},
            "timestamp": timestamp,
            "url": basescan,
        }

        if alert.get("old_value"):
            embed["fields"].append({"name": "Old Value", "value": f"`{alert['old_value'][:100]}`", "inline": False})
        if alert.get("new_value"):
            embed["fields"].append({"name": "New Value", "value": f"`{alert['new_value'][:100]}`", "inline": False})

        # Add action button for CRITICAL/EMERGENCY alerts
        components = []
        if severity in ("CRITICAL", "EMERGENCY"):
            embed["description"] += (
                "\n\n**⚡ Proof of Exit may trigger automatically if threat score ≥ 75.**\n"
                "Guardian override available."
            )

        payload = {"embeds": [embed], "components": components}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.DISCORD_API}/channels/{Config.DISCORD_CHANNEL_ID}/messages",
                    json=payload,
                    headers={
                        "Authorization": f"Bot {Config.DISCORD_BOT_TOKEN}",
                        "Content-Type": "application/json",
                    },
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status in (200, 201):
                        log.info("discord_sent", severity=severity)
                    else:
                        body = await resp.text()
                        log.error("discord_error", status=resp.status, body=body[:200])
        except Exception as e:
            log.error("discord_send_error", error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Channel: Twitter/X
# ─────────────────────────────────────────────────────────────────────────────
class TwitterNotifier:
    TWITTER_API = "https://api.twitter.com/2/tweets"

    async def send(self, alert: dict):
        if not all([Config.TWITTER_API_KEY, Config.TWITTER_API_SECRET,
                    Config.TWITTER_TOKEN, Config.TWITTER_SECRET]):
            return

        severity = alert.get("severity", "UNKNOWN")
        contract = alert.get("contract", "")
        emoji    = SEVERITY_EMOJI.get(severity, "⚠️")
        basescan = f"{Config.BASESCAN_URL}/{contract}"

        # Twitter has 280 char limit — keep it concise
        tweet = (
            f"{emoji} AETHERIS SECURITY ALERT — {severity}\n\n"
            f"{alert.get('change_type', '').replace('_', ' ')}\n\n"
            f"Contract: {contract[:10]}...{contract[-6:]}\n\n"
            f"🔍 Details: {basescan}\n\n"
            "#DeFiSecurity #Aetheris #Web3Security"
        )

        # Only tweet CRITICAL and EMERGENCY to avoid noise
        if severity not in ("CRITICAL", "EMERGENCY", "HIGH"):
            return

        try:
            import tweepy
            client = tweepy.AsyncClient(
                consumer_key=Config.TWITTER_API_KEY,
                consumer_secret=Config.TWITTER_API_SECRET,
                access_token=Config.TWITTER_TOKEN,
                access_token_secret=Config.TWITTER_SECRET,
            )
            await client.create_tweet(text=tweet[:280])
            log.info("twitter_sent", severity=severity)
        except Exception as e:
            log.error("twitter_send_error", error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Channel: PagerDuty (on-call escalation for CRITICAL/EMERGENCY)
# ─────────────────────────────────────────────────────────────────────────────
class PagerDutyNotifier:
    PAGERDUTY_API = "https://events.pagerduty.com/v2/enqueue"

    async def send(self, alert: dict):
        if not Config.PAGERDUTY_KEY:
            return

        severity_map = {
            "CRITICAL":  "critical",
            "EMERGENCY": "critical",
            "HIGH":      "error",
            "MEDIUM":    "warning",
        }

        payload = {
            "routing_key":  Config.PAGERDUTY_KEY,
            "event_action": "trigger",
            "dedup_key":    alert.get("alert_id", ""),
            "payload": {
                "summary":        f"[{alert.get('severity')}] {alert.get('description', '')}",
                "source":         "Aetheris Security Agent V",
                "severity":       severity_map.get(alert.get("severity", ""), "warning"),
                "timestamp":      datetime.fromtimestamp(
                    alert.get("timestamp", time.time()), tz=timezone.utc
                ).isoformat(),
                "custom_details": {
                    "contract":    alert.get("contract"),
                    "change_type": alert.get("change_type"),
                    "old_value":   alert.get("old_value"),
                    "new_value":   alert.get("new_value"),
                    "block":       alert.get("block_number"),
                },
            },
            "links": [{
                "href": f"{Config.BASESCAN_URL}/{alert.get('contract', '')}",
                "text": "View on Basescan",
            }],
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.PAGERDUTY_API,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status == 202:
                        log.info("pagerduty_sent", severity=alert.get("severity"))
                    else:
                        log.error("pagerduty_error", status=resp.status)
        except Exception as e:
            log.error("pagerduty_send_error", error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket Manager — pushes alerts to dashboard in real-time
# ─────────────────────────────────────────────────────────────────────────────
class WebSocketManager:
    def __init__(self):
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.add(ws)
        log.info("dashboard_connected", total=len(self._connections))

    def disconnect(self, ws: WebSocket):
        self._connections.discard(ws)

    async def broadcast(self, message: dict):
        if not self._connections:
            return
        dead = set()
        for ws in self._connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        self._connections -= dead


ws_manager = WebSocketManager()


# ─────────────────────────────────────────────────────────────────────────────
# Subscriber — listens to Redis pub/sub and routes to channels
# ─────────────────────────────────────────────────────────────────────────────
class AlertSubscriber:
    def __init__(self):
        self._email    = EmailNotifier()
        self._discord  = DiscordNotifier()
        self._twitter  = TwitterNotifier()
        self._pagerduty = PagerDutyNotifier()

        # In production, load from database; here use env vars
        self._email_recipients: list[str] = [
            e.strip() for e in os.getenv("ALERT_EMAIL_RECIPIENTS", "").split(",") if e.strip()
        ]

    async def run(self):
        redis = await aioredis.from_url(Config.REDIS_URL, decode_responses=True)
        pubsub = redis.pubsub()
        await pubsub.subscribe("aetheris:alerts")

        log.info("alert_subscriber_started")

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            try:
                alert = json.loads(message["data"])
                await self._route(alert)
            except Exception as e:
                log.error("alert_routing_error", error=str(e))

    async def _route(self, alert: dict):
        severity = alert.get("severity", "LOW")
        channels = SEVERITY_ROUTING.get(severity, ["dashboard"])

        tasks = []

        if "dashboard" in channels:
            tasks.append(ws_manager.broadcast({"type": "security_alert", "data": alert}))

        if "discord" in channels:
            tasks.append(self._discord.send(alert))

        if "email" in channels:
            tasks.append(self._email.send(alert, self._email_recipients))

        if "twitter" in channels:
            tasks.append(self._twitter.send(alert))

        if "pagerduty" in channels:
            tasks.append(self._pagerduty.send(alert))

        await asyncio.gather(*tasks, return_exceptions=True)
        log.info("alert_routed", severity=severity, channels=channels)


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI App — WebSocket endpoint + alert history API
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Aetheris Notification Service",
    description="Multi-channel security notification system for Aetheris Protocol",
    version="1.0.0",
)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.websocket("/ws/alerts")
async def alerts_websocket(ws: WebSocket):
    """Dashboard subscribes here to receive live security alerts."""
    await ws_manager.connect(ws)
    try:
        while True:
            await ws.receive_text()  # Keep connection alive
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)


@app.get("/alerts/history")
async def alert_history(limit: int = 50):
    """Returns the last N security alerts for the dashboard."""
    redis = await aioredis.from_url(Config.REDIS_URL, decode_responses=True)
    raw   = await redis.lrange("aetheris:alert_history", 0, limit - 1)
    await redis.close()
    return {"alerts": [json.loads(a) for a in raw], "count": len(raw)}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "aetheris-notifications",
        "dashboard_connections": len(ws_manager._connections),
        "ts": int(time.time()),
    }


@app.on_event("startup")
async def startup():
    """Start the Redis subscriber in the background."""
    subscriber = AlertSubscriber()
    asyncio.create_task(subscriber.run())
    log.info("notification_service_started")


if __name__ == "__main__":
    uvicorn.run("notification_service:app", host="0.0.0.0", port=8002, reload=False)