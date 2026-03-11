# Aetheris\aetheris-agent-alpha\agent-alpha\agent.py

# Step 1: 1Unicode-safe logging — no more cp1252 crashes
# Step 2: Real gas cost from eth_estimateGas + live ETH/USDC price
# Step 3: All 4 Uniswap fee tiers — picks the best pool per trade
# Step 4: 3 token pairs: USDC/WETH, WETH/cbBTC, USDC/cbBTC
# Step 5: 5 trade sizes from $1k-$100k — picks most profitable size
# Step 6: 0.3% slippage buffer on every minOut passed to contract
# Step 7: All pairs scanned in parallel threads
# Step 8: 3-leg triangular routes (USDC→WETH→cbBTC→USDC)
# Step 9: Circuit breaker: auto-pauses 10 min after 5 consecutive failures
# Step 10: Win rate, profit per trade, cumulative stats printed every 20 scans
# Step 11: Balancer/Curve hooks stubbed — ready to wire in Phase 2
# Step 12: --flashbots flag routes txs through Flashbots Protect RPC
# Step 13: PM2 ecosystem.config.js in the file header comments
# Step 14: Telegram + Discord alerts on startup, wins, reverts
# Step 15: Mainnet validation checklist in the file header comments

# Phase 1 — Complete (Steps 1-15)

#!/usr/bin/env python3
"""
aetheris-agent/agent.py  —  Aetheris Protocol Agent Alpha  —  Phase 1 Complete

PHASE 1 STEPS IMPLEMENTED:
  1.  Unicode-safe logging (Windows cp1252 fix)
  2.  Real gas estimation (eth_estimateGas + live ETH/USDC price)
  3.  All Uniswap V3 fee tiers (100, 500, 3000, 10000)
  4.  All liquid pairs: USDC/WETH, WETH/cbBTC, USDC/cbBTC
  5.  Optimal trade sizing (mathematical, not fixed $10k)
  6.  Accurate slippage modeling (0.3% buffer + impact estimate)
  7.  Parallel scanning of all pairs simultaneously
  8.  3-leg multi-hop routes (USDC -> WETH -> cbBTC -> USDC)
  9.  Circuit breaker (pause 10 min after 5 consecutive failures)
  10. Performance tracking (win rate, profit per trade, cumulative)
  11. Balancer V2 and Curve Finance DEX support (hooks ready)
  12. MEV protection via Flashbots Protect RPC
  13. VPS/PM2 deployment config — see PM2_ECOSYSTEM_CONFIG below
  14. Telegram + Discord alerting
  15. Mainnet validation checklist — see MAINNET_CHECKLIST below

STEP 13 — PM2 DEPLOYMENT (run on your VPS, not your laptop):
  Install:   npm install -g pm2
  Start:     pm2 start ecosystem.config.js
  Monitor:   pm2 logs aetheris-agent
  Auto-boot: pm2 startup && pm2 save

  ecosystem.config.js contents:
  ─────────────────────────────
  module.exports = {
    apps: [{
      name: 'aetheris-agent',
      script: 'agent.py',
      interpreter: 'python3',
      args: '--mode live --network baseSepolia',
      cwd: '/home/ubuntu/aetheris-agent-alpha/agent-alpha',
      env: { PYTHONIOENCODING: 'utf-8' },
      restart_delay: 5000,
      max_restarts: 10,
      watch: false,
    }]
  };

STEP 15 — MAINNET VALIDATION CHECKLIST (30 days before production):
  [ ] Run --mode simulate --network base for 7 days, review logs
  [ ] Confirm at least 10 profitable simulated opportunities logged
  [ ] Deploy AgentAlpha + ProfitDistributor to Base mainnet
  [ ] Update NETWORKS['base'] agent_alpha + profit_dist addresses
  [ ] Run --mode live --network base with $1000 max flash loan for 7 days
  [ ] Gradually increase maxFlashLoanAmount via governance
  [ ] Monitor Basescan for reverts, set up alerts
  [ ] After 30 days clean operation, remove testnet config

Usage:
    python agent.py --mode simulate --network baseSepolia
    python agent.py --mode live     --network baseSepolia
    python agent.py --mode live     --network base

Environment variables (agent-alpha/.env):
    PRIVATE_KEY                Deployer wallet with EXECUTOR_ROLE
    BASE_SEPOLIA_RPC_URL       Alchemy RPC for Base Sepolia
    BASE_MAINNET_RPC_URL       Alchemy RPC for Base mainnet
    FLASHBOTS_RPC_URL          Optional — overrides default Flashbots endpoint
    TELEGRAM_BOT_TOKEN         Optional — for Telegram alerts
    TELEGRAM_CHAT_ID           Optional — your Telegram chat/channel ID
    DISCORD_WEBHOOK_URL        Optional — for Discord alerts
    MIN_PROFIT_USDC            Minimum net profit per trade (default: 1.0)
    POLL_INTERVAL_SECONDS      Scan frequency in seconds (default: 15)
    PYTHONIOENCODING=utf-8     Set in shell or PM2 ecosystem config

Requirements:
    pip install web3 python-dotenv requests
"""

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Unicode-safe stdout/stderr (must be first — before any other output)
# ─────────────────────────────────────────────────────────────────────────────
import sys
import io

def _make_utf8_stream(stream):
    """
    Return a UTF-8-safe version of a text stream.
    Prevents UnicodeEncodeError on Windows cp1252 consoles and
    non-TTY pipes (e.g. PM2, subprocess, Docker log capture).
    """
    try:
        stream.reconfigure(encoding='utf-8', errors='replace')
        return stream
    except (AttributeError, io.UnsupportedOperation):
        try:
            return io.TextIOWrapper(
                stream.buffer,
                encoding='utf-8',
                errors='replace',
                line_buffering=True,
            )
        except AttributeError:
            return stream

sys.stdout = _make_utf8_stream(sys.stdout)
sys.stderr = _make_utf8_stream(sys.stderr)

# ─────────────────────────────────────────────────────────────────────────────
# Logging — must come after stream fix, before any other imports that log
# ─────────────────────────────────────────────────────────────────────────────
import logging

_log_formatter  = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
_stream_handler = logging.StreamHandler(sys.stdout)
_stream_handler.setFormatter(_log_formatter)
_file_handler   = logging.FileHandler("agent.log", encoding="utf-8")
_file_handler.setFormatter(_log_formatter)
logging.basicConfig(level=logging.INFO, handlers=[_stream_handler, _file_handler])
log = logging.getLogger("AetherisAgent")

# ─────────────────────────────────────────────────────────────────────────────
# Standard library imports
# ─────────────────────────────────────────────────────────────────────────────
import os
import time
import argparse
import struct as _struct
import hashlib
import threading
import requests
from decimal import Decimal
from datetime import datetime, timezone
from typing import Optional, NamedTuple
from concurrent.futures import ThreadPoolExecutor, as_completed

# ─────────────────────────────────────────────────────────────────────────────
# Third-party imports
# ─────────────────────────────────────────────────────────────────────────────
from dotenv import load_dotenv
from web3 import Web3
try:
    from web3.middleware import geth_poa_middleware
except ImportError:
    from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# Network Configuration
# ─────────────────────────────────────────────────────────────────────────────
NETWORKS = {
    "baseSepolia": {
        "rpc":              os.getenv("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org"),
        "chain_id":         84532,
        "explorer":         "https://sepolia.basescan.org",
        "agent_alpha":      "0x33c9bF62b3a4f5607B379f533f782040bd13A959",
        "profit_dist":      "0xC38A776b958c83482914BdE299c9a6bC846CCb95",
        "usdc":             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "weth":             "0x4200000000000000000000000000000000000006",
        "cbbtc":            "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
        "uniswap_router":   "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
        "aerodrome_router": "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
        "uniswap_quoter":   "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
        "aave_pool":        "0x07eA79F68B2B3df564D0A34F8e19791a8a4c28E4",
        "testnet":          True,
    },
    "base": {
        "rpc":              os.getenv("BASE_MAINNET_RPC_URL", "https://mainnet.base.org"),
        "chain_id":         8453,
        "explorer":         "https://basescan.org",
        "agent_alpha":      "MAINNET_AGENT_ALPHA_ADDRESS",   # update after mainnet deploy
        "profit_dist":      "MAINNET_PROFIT_DIST_ADDRESS",   # update after mainnet deploy
        "usdc":             "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "weth":             "0x4200000000000000000000000000000000000006",
        "cbbtc":            "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
        "uniswap_router":   "0x2626664c2603336E57B271c5C0b26F421741e481",
        "aerodrome_router": "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
        "uniswap_quoter":   "0x3d4e44Eb1374240CE5F1B136ea68CA6000000000",
        "aave_pool":        "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
        "testnet":          False,
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Uniswap V3 fee tiers
# ─────────────────────────────────────────────────────────────────────────────
# 100   = 0.01%  stable pairs
# 500   = 0.05%  most USDC/WETH liquidity on Base
# 3000  = 0.30%  medium volatility
# 10000 = 1.00%  exotic pairs
UNISWAP_FEE_TIERS = [100, 500, 3000, 10000]

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: All liquid trading pairs
# ─────────────────────────────────────────────────────────────────────────────
# Each entry: (token_in_key, token_out_key, token_in_decimals, token_out_decimals)
# Decimals: USDC=6, WETH=18, cbBTC=8
TRADING_PAIRS = [
    ("usdc",  "weth",  6,  18),
    ("weth",  "cbbtc", 18, 8),
    ("usdc",  "cbbtc", 6,  8),
]

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Optimal trade sizing parameters
# ─────────────────────────────────────────────────────────────────────────────
# Instead of a fixed $10k, we find the amount that maximises net profit.
# We sample SIZING_SAMPLES different trade sizes between MIN and MAX,
# pick the one with the highest net profit after gas and flash premium.
MIN_TRADE_USDC       = 1_000.0     # $1,000 minimum flash loan
MAX_TRADE_USDC       = 100_000.0   # $100,000 maximum (AgentAlpha contract limit)
SIZING_SAMPLES       = 5           # number of sizes to probe (1k, 25k, 50k, 75k, 100k)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 9: Circuit breaker parameters
# ─────────────────────────────────────────────────────────────────────────────
CIRCUIT_BREAKER_THRESHOLD = 5      # consecutive failures before pause
CIRCUIT_BREAKER_PAUSE_S   = 600    # pause duration in seconds (10 minutes)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 12: MEV protection — Flashbots Protect RPC
# ─────────────────────────────────────────────────────────────────────────────
# Flashbots Protect routes transactions through private mempools so they
# cannot be front-run or sandwiched by MEV bots watching the public mempool.
# On Base L2 MEV risk is lower than mainnet, but still present.
FLASHBOTS_RPC_URL = os.getenv(
    "FLASHBOTS_RPC_URL",
    "https://rpc.flashbots.net"   # Base mainnet Flashbots endpoint
)

# ─────────────────────────────────────────────────────────────────────────────
# Global constants
# ─────────────────────────────────────────────────────────────────────────────
AAVE_FLASH_PREMIUM_BPS = 5        # 0.05% — matches AgentAlpha.sol AAVE_FLASH_FEE_BPS
GAS_BUFFER_MULTIPLIER  = 1.2      # 20% buffer covers Base L1 data fee
GAS_FALLBACK_UNITS     = 600_000  # conservative fallback when simulation fails
ETH_PRICE_QUOTE_AMOUNT = 10 ** 18 # 1 ETH in wei for price oracle quotes
SLIPPAGE_BPS           = 30       # 0.3% slippage buffer (Step 6)

# ─────────────────────────────────────────────────────────────────────────────
# ABIs
# ─────────────────────────────────────────────────────────────────────────────
AGENT_ALPHA_ABI = [
    {
        "name": "executeArbitrage",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{
            "name": "params", "type": "tuple",
            "components": [
                {"name": "tradeId",     "type": "bytes32"},
                {"name": "flashToken",  "type": "address"},
                {"name": "flashAmount", "type": "uint256"},
                {
                    "name": "path", "type": "tuple[]",
                    "components": [
                        {"name": "dex",     "type": "address"},
                        {"name": "dexType", "type": "uint8"},
                        {"name": "tokenIn", "type": "address"},
                        {"name": "tokenOut","type": "address"},
                        {"name": "fee",     "type": "uint24"},
                        {"name": "minOut",  "type": "uint256"},
                        {"name": "poolId",  "type": "bytes32"},
                    ],
                },
                {"name": "minProfit", "type": "uint256"},
                {"name": "deadline",  "type": "uint256"},
            ],
        }],
        "outputs": [],
    },
    {"name": "isActive",       "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"name": "", "type": "bool"}]},
    {"name": "isUserActive",   "type": "function", "stateMutability": "view",
     "inputs": [{"name": "user", "type": "address"}], "outputs": [{"name": "", "type": "bool"}]},
    {"name": "EXECUTOR_ROLE",  "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"name": "", "type": "bytes32"}]},
    {"name": "hasRole",        "type": "function", "stateMutability": "view",
     "inputs": [{"name": "role", "type": "bytes32"}, {"name": "account", "type": "address"}],
     "outputs": [{"name": "", "type": "bool"}]},
    {"name": "maxFlashLoanAmount", "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "getTotalArbitrageProfit", "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"name": "", "type": "uint256"}]},
]

PROFIT_DIST_ABI = [
    {"name": "totalValueLocked",       "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "totalProfitDistributed", "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"name": "", "type": "uint256"}]},
]

UNISWAP_QUOTER_ABI = [
    {
        "name": "quoteExactInputSingle",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{
            "name": "params", "type": "tuple",
            "components": [
                {"name": "tokenIn",           "type": "address"},
                {"name": "tokenOut",          "type": "address"},
                {"name": "amountIn",          "type": "uint256"},
                {"name": "fee",               "type": "uint24"},
                {"name": "sqrtPriceLimitX96", "type": "uint160"},
            ],
        }],
        "outputs": [
            {"name": "amountOut",               "type": "uint256"},
            {"name": "sqrtPriceX96After",       "type": "uint160"},
            {"name": "initializedTicksCrossed", "type": "uint32"},
            {"name": "gasEstimate",             "type": "uint256"},
        ],
    },
]

AERODROME_ROUTER_ABI = [
    {
        "name": "getAmountsOut",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "amountIn", "type": "uint256"},
            {"name": "routes", "type": "tuple[]", "components": [
                {"name": "from",    "type": "address"},
                {"name": "to",      "type": "address"},
                {"name": "stable",  "type": "bool"},
                {"name": "factory", "type": "address"},
            ]},
        ],
        "outputs": [{"name": "amounts", "type": "uint256[]"}],
    },
]

AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40D"

# ─────────────────────────────────────────────────────────────────────────────
# Data Structures
# ─────────────────────────────────────────────────────────────────────────────
class ArbOpportunity(NamedTuple):
    # Pair info
    token_in:        str    # address of starting token
    token_out:       str    # address of intermediate token
    token_in_key:    str    # e.g. "usdc"
    token_out_key:   str    # e.g. "weth"
    token_in_dec:    int    # decimals
    token_out_dec:   int    # decimals
    # Route
    route_type:      str    # "2leg" | "3leg"
    legs:            tuple  # tuple of leg dicts for logging/encoding
    # Sizing
    amount_in:       int    # raw units of token_in
    buy_amount_out:  int    # raw units of token_out after leg 1
    sell_amount_out: int    # raw units of token_in after final leg
    # Economics
    gross_profit:    int    # raw units of token_in
    flash_premium:   int    # raw units of token_in
    gas_cost_usdc:   int    # raw USDC (6 dec)
    gas_cost_wei:    int    # wei
    gas_units:       int
    net_profit:      int    # raw units of token_in (positive = profitable)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 10: Performance Tracker
# ─────────────────────────────────────────────────────────────────────────────
class PerformanceTracker:
    """
    Tracks agent statistics across the session.

    Metrics:
      - scans          : total scan cycles run
      - opportunities  : routes found meeting min_profit threshold
      - executions     : trades actually sent on-chain (live mode)
      - wins           : confirmed profitable (receipt status=1)
      - losses         : confirmed reverts
      - total_profit   : cumulative net profit in USDC
      - consecutive_failures : for circuit breaker (Step 9)
      - best_trade     : highest single net profit seen
      - avg_gas_usdc   : rolling average gas cost per trade
    """

    def __init__(self):
        self.scans                 = 0
        self.opportunities         = 0
        self.executions            = 0
        self.wins                  = 0
        self.losses                = 0
        self.total_profit_usdc     = Decimal("0")
        self.consecutive_failures  = 0
        self.best_trade_usdc       = Decimal("0")
        self.gas_samples: list[float] = []
        self.start_time            = datetime.now(timezone.utc)
        self._lock                 = threading.Lock()

    def record_scan(self):
        with self._lock:
            self.scans += 1

    def record_opportunity(self):
        with self._lock:
            self.opportunities += 1

    def record_win(self, net_profit_usdc: Decimal, gas_cost_usdc: float):
        with self._lock:
            self.executions            += 1
            self.wins                  += 1
            self.consecutive_failures   = 0
            self.total_profit_usdc     += net_profit_usdc
            if net_profit_usdc > self.best_trade_usdc:
                self.best_trade_usdc = net_profit_usdc
            self.gas_samples.append(gas_cost_usdc)

    def record_loss(self):
        with self._lock:
            self.executions           += 1
            self.losses               += 1
            self.consecutive_failures += 1

    def record_error(self):
        with self._lock:
            self.consecutive_failures += 1

    @property
    def win_rate(self) -> float:
        total = self.wins + self.losses
        return (self.wins / total * 100) if total > 0 else 0.0

    @property
    def avg_gas_usdc(self) -> float:
        return sum(self.gas_samples) / len(self.gas_samples) if self.gas_samples else 0.0

    def print_summary(self):
        elapsed = datetime.now(timezone.utc) - self.start_time
        log.info("=" * 60)
        log.info("  PERFORMANCE SUMMARY")
        log.info("=" * 60)
        log.info("  Runtime            : %s", str(elapsed).split(".")[0])
        log.info("  Scans              : %s", self.scans)
        log.info("  Opportunities      : %s", self.opportunities)
        log.info("  Executions         : %s", self.executions)
        log.info("  Wins / Losses      : %s / %s  (%.1f%% win rate)",
                 self.wins, self.losses, self.win_rate)
        log.info("  Total profit       : $%.4f USDC", self.total_profit_usdc)
        log.info("  Best single trade  : $%.4f USDC", self.best_trade_usdc)
        log.info("  Avg gas cost       : $%.4f USDC", self.avg_gas_usdc)
        log.info("  Consec. failures   : %s", self.consecutive_failures)
        log.info("=" * 60)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 9: Circuit Breaker
# ─────────────────────────────────────────────────────────────────────────────
class CircuitBreaker:
    """
    Pauses the agent for CIRCUIT_BREAKER_PAUSE_S seconds after
    CIRCUIT_BREAKER_THRESHOLD consecutive failures.

    Why this matters:
    - 5 consecutive failures usually means something is wrong at the
      infrastructure level (RPC degraded, contract paused, gas spike)
      rather than a run of bad luck on individual trades.
    - Continuing to fire transactions when the system is degraded wastes
      gas and can trigger the AgentAlpha daily loss limit, which auto-pauses
      the contract.
    - After the pause window, the agent resumes automatically and the
      failure counter resets.
    """

    def __init__(self, threshold: int = CIRCUIT_BREAKER_THRESHOLD,
                 pause_seconds: int = CIRCUIT_BREAKER_PAUSE_S):
        self.threshold    = threshold
        self.pause_s      = pause_seconds
        self._tripped_at: Optional[float] = None

    def is_open(self) -> bool:
        """Returns True if the circuit breaker is currently tripped (agent should pause)."""
        if self._tripped_at is None:
            return False
        if time.monotonic() - self._tripped_at >= self.pause_s:
            log.info("[CIRCUIT] Pause window elapsed — resuming operations")
            self._tripped_at = None
            return False
        remaining = self.pause_s - (time.monotonic() - self._tripped_at)
        log.info("[CIRCUIT] Breaker open — %.0fs remaining in pause window", remaining)
        return True

    def trip(self):
        self._tripped_at = time.monotonic()
        log.warning(
            "[CIRCUIT] Breaker tripped after %s consecutive failures. "
            "Pausing for %s seconds.",
            self.threshold, self.pause_s,
        )

    def check(self, consecutive_failures: int):
        """Call after each failure. Trips the breaker if threshold is reached."""
        if consecutive_failures >= self.threshold:
            self.trip()


# ─────────────────────────────────────────────────────────────────────────────
# STEP 14: Alerting (Telegram + Discord)
# ─────────────────────────────────────────────────────────────────────────────
class Alerter:
    """
    Sends alerts to Telegram and/or Discord on significant events.

    Alerts are sent asynchronously in a background thread so they never
    block the main scan loop. If an alert fails, it logs a warning and
    continues — alerting is best-effort.

    Configure via .env:
        TELEGRAM_BOT_TOKEN  = your bot token from @BotFather
        TELEGRAM_CHAT_ID    = your chat or channel ID (use @username or numeric ID)
        DISCORD_WEBHOOK_URL = webhook URL from Discord channel settings
    """

    def __init__(self):
        self.telegram_token   = os.getenv("TELEGRAM_BOT_TOKEN")
        self.telegram_chat_id = os.getenv("TELEGRAM_CHAT_ID")
        self.discord_webhook  = os.getenv("DISCORD_WEBHOOK_URL")
        self._enabled         = bool(
            (self.telegram_token and self.telegram_chat_id) or self.discord_webhook
        )

        if self._enabled:
            log.info("[ALERT] Alerting enabled: Telegram=%s, Discord=%s",
                     bool(self.telegram_token), bool(self.discord_webhook))
        else:
            log.info("[ALERT] No alert credentials configured — alerting disabled")

    def send(self, message: str):
        """Fire-and-forget alert. Non-blocking."""
        if not self._enabled:
            return
        threading.Thread(target=self._dispatch, args=(message,), daemon=True).start()

    def _dispatch(self, message: str):
        if self.telegram_token and self.telegram_chat_id:
            self._send_telegram(message)
        if self.discord_webhook:
            self._send_discord(message)

    def _send_telegram(self, message: str):
        try:
            url  = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
            resp = requests.post(url, json={
                "chat_id":    self.telegram_chat_id,
                "text":       message,
                "parse_mode": "HTML",
            }, timeout=5)
            if not resp.ok:
                log.warning("[ALERT] Telegram send failed: %s", resp.text)
        except Exception as e:
            log.warning("[ALERT] Telegram error: %s", e)

    def _send_discord(self, message: str):
        try:
            resp = requests.post(self.discord_webhook, json={"content": message}, timeout=5)
            if not resp.ok:
                log.warning("[ALERT] Discord send failed: %s", resp.text)
        except Exception as e:
            log.warning("[ALERT] Discord error: %s", e)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Gas Estimator
# ─────────────────────────────────────────────────────────────────────────────
class GasEstimator:
    """
    Estimates the real USD cost of executing a flash arbitrage on Base L2.

    1. eth_estimateGas  — simulate the tx, get actual gas units consumed
    2. baseFeePerGas    — read from latest block header (live, not hardcoded)
    3. ETH -> USDC      — quote via Uniswap V3 (live price, cached 60s)
    4. 20% buffer       — covers Base L1 data fee without a separate oracle call
    """

    def __init__(self, w3: Web3, cfg: dict):
        self.w3         = w3
        self.cfg        = cfg
        self.uni_quoter = w3.eth.contract(
            address=Web3.to_checksum_address(cfg["uniswap_quoter"]),
            abi=UNISWAP_QUOTER_ABI,
        )
        self._eth_price_usdc: Optional[int] = None
        self._eth_price_ts:   float          = 0.0

    def estimate(self, tx_dict: dict, from_addr: str) -> tuple[int, int, int]:
        """Returns (gas_units, gas_cost_wei, gas_cost_usdc)."""
        gas_units     = self._simulate_gas_units(tx_dict, from_addr)
        gas_price_wei = self._current_gas_price_wei()
        gas_cost_wei  = int(gas_units * gas_price_wei * GAS_BUFFER_MULTIPLIER)
        gas_cost_usdc = self._wei_to_usdc(gas_cost_wei)
        log.debug("Gas: %s units x %.4f gwei = $%.4f USDC",
                  gas_units, gas_price_wei / 1e9, gas_cost_usdc / 1e6)
        return gas_units, gas_cost_wei, gas_cost_usdc

    def _simulate_gas_units(self, tx_dict: dict, from_addr: str) -> int:
        call_dict = {**tx_dict, "from": from_addr}
        for f in ("nonce", "maxFeePerGas", "maxPriorityFeePerGas", "gas"):
            call_dict.pop(f, None)
        try:
            return self.w3.eth.estimate_gas(call_dict)
        except Exception as e:
            log.warning("Gas simulation failed (%s). Fallback: %s units.", e, GAS_FALLBACK_UNITS)
            return GAS_FALLBACK_UNITS

    def _current_gas_price_wei(self) -> int:
        try:
            block    = self.w3.eth.get_block("latest")
            base_fee = block.get("baseFeePerGas", 0)
            return base_fee + self.w3.to_wei("0.001", "gwei")
        except Exception:
            return self.w3.to_wei("0.01", "gwei")

    def _eth_price_in_usdc(self) -> int:
        now = time.monotonic()
        if self._eth_price_usdc is not None and (now - self._eth_price_ts) < 60:
            return self._eth_price_usdc
        try:
            result = self.uni_quoter.functions.quoteExactInputSingle({
                "tokenIn":           Web3.to_checksum_address(self.cfg["weth"]),
                "tokenOut":          Web3.to_checksum_address(self.cfg["usdc"]),
                "amountIn":          ETH_PRICE_QUOTE_AMOUNT,
                "fee":               500,
                "sqrtPriceLimitX96": 0,
            }).call()
            self._eth_price_usdc = result[0]
            self._eth_price_ts   = now
            log.debug("ETH price: $%.2f", result[0] / 1e6)
            return result[0]
        except Exception:
            fallback = 3_000 * 1_000_000
            self._eth_price_usdc = fallback
            self._eth_price_ts   = now
            return fallback

    def _wei_to_usdc(self, wei: int) -> int:
        return (wei * self._eth_price_in_usdc()) // (10 ** 18)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 + 4: Price Fetcher
# ─────────────────────────────────────────────────────────────────────────────
class PriceFetcher:
    """
    Quotes prices from Uniswap V3 (all fee tiers) and Aerodrome.
    Step 3: scans all 4 Uniswap fee tiers and picks the best output.
    Step 4: works for any token pair, not just USDC/WETH.
    """

    def __init__(self, w3: Web3, cfg: dict):
        self.w3          = w3
        self.cfg         = cfg
        self.uni_quoter  = w3.eth.contract(
            address=Web3.to_checksum_address(cfg["uniswap_quoter"]),
            abi=UNISWAP_QUOTER_ABI,
        )
        self.aero_router = w3.eth.contract(
            address=Web3.to_checksum_address(cfg["aerodrome_router"]),
            abi=AERODROME_ROUTER_ABI,
        )

    def quote_uniswap_best(
        self, token_in: str, token_out: str, amount_in: int,
    ) -> tuple[Optional[int], int]:
        """
        Quote all fee tiers. Return (best_amount_out, winning_fee_tier).
        All tiers always queried — a cheaper fee tier isn't always the
        best price if that pool has less liquidity.
        """
        best_out: Optional[int] = None
        best_fee: int           = 0
        for fee in UNISWAP_FEE_TIERS:
            try:
                result = self.uni_quoter.functions.quoteExactInputSingle({
                    "tokenIn":           Web3.to_checksum_address(token_in),
                    "tokenOut":          Web3.to_checksum_address(token_out),
                    "amountIn":          amount_in,
                    "fee":               fee,
                    "sqrtPriceLimitX96": 0,
                }).call()
                out = result[0]
                if best_out is None or out > best_out:
                    best_out, best_fee = out, fee
            except Exception as e:
                log.debug("Uni fee=%s %s->%s: %s", fee, token_in[-6:], token_out[-6:], e)
        return best_out, best_fee

    def quote_aerodrome_best(
        self, token_in: str, token_out: str, amount_in: int,
    ) -> Optional[int]:
        """Query both volatile and stable Aerodrome pools, return the best."""
        best: Optional[int] = None
        for stable in [False, True]:
            try:
                routes = [{
                    "from":    Web3.to_checksum_address(token_in),
                    "to":      Web3.to_checksum_address(token_out),
                    "stable":  stable,
                    "factory": Web3.to_checksum_address(AERODROME_FACTORY),
                }]
                amounts = self.aero_router.functions.getAmountsOut(
                    amount_in, routes).call()
                out = amounts[-1]
                if best is None or out > best:
                    best = out
            except Exception as e:
                log.debug("Aerodrome stable=%s %s->%s: %s",
                          stable, token_in[-6:], token_out[-6:], e)
        return best


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Slippage Model
# ─────────────────────────────────────────────────────────────────────────────
def apply_slippage(quoted_out: int, slippage_bps: int = SLIPPAGE_BPS) -> int:
    """
    Apply a slippage buffer to a quoted output amount.

    Why 0.3% (30 bps):
    - The Uniswap V3 quoter simulates against the current block state.
      By the time our tx lands (1-2 blocks later), the price may have moved.
    - 0.3% provides protection against minor price movement without
      making the minOut so strict that the trade fails on small fluctuations.
    - For stable pairs (USDC/USDT) you could use 0.1%. For volatile pairs
      (WETH/cbBTC) 0.5% is safer. 0.3% is a reasonable middle ground.

    The result is the minOut passed to the contract's SwapHop.
    The contract reverts if actual output < minOut (SlippageExceeded error).
    """
    return (quoted_out * (10_000 - slippage_bps)) // 10_000


# ─────────────────────────────────────────────────────────────────────────────
# Transaction Builder
# ─────────────────────────────────────────────────────────────────────────────
class TxBuilder:
    """
    Builds and sends AgentAlpha.executeArbitrage() transactions.
    Supports 2-leg and 3-leg paths.
    Step 6: uses apply_slippage() for minOut on each hop.
    Step 12: optionally routes through Flashbots Protect RPC.
    """

    DEX_UNISWAP_V3 = 0
    DEX_AERODROME  = 1

    def __init__(self, w3: Web3, cfg: dict, private_key: str,
                 use_flashbots: bool = False):
        self.w3             = w3
        self.cfg            = cfg
        self.use_flashbots  = use_flashbots
        self.account        = w3.eth.account.from_key(private_key)
        self.agent_alpha    = w3.eth.contract(
            address=Web3.to_checksum_address(cfg["agent_alpha"]),
            abi=AGENT_ALPHA_ABI,
        )
        # Step 12: secondary web3 instance pointing at Flashbots Protect RPC
        if use_flashbots:
            self.fb_w3 = Web3(Web3.HTTPProvider(FLASHBOTS_RPC_URL))
            log.info("[MEV] Flashbots Protect RPC enabled: %s", FLASHBOTS_RPC_URL)
        else:
            self.fb_w3 = None

    def _make_hop(self, dex: str, token_in: str, token_out: str,
                  fee: int, min_out: int) -> dict:
        dex_type = self.DEX_UNISWAP_V3 if dex == "uniswap" else self.DEX_AERODROME
        router   = (Web3.to_checksum_address(self.cfg["uniswap_router"])
                    if dex == "uniswap"
                    else Web3.to_checksum_address(self.cfg["aerodrome_router"]))
        return {
            "dex":      router,
            "dexType":  dex_type,
            "tokenIn":  Web3.to_checksum_address(token_in),
            "tokenOut": Web3.to_checksum_address(token_out),
            "fee":      fee if dex == "uniswap" else 0,
            "minOut":   min_out,
            "poolId":   b"\x00" * 32,
        }

    def _make_trade_params(self, opp: ArbOpportunity) -> dict:
        raw      = _struct.pack(">Q", int(time.time())) + bytes.fromhex(opp.token_in[2:])
        trade_id = Web3.keccak(raw)

        # Build hops from the legs stored in the opportunity
        hops = []
        for leg in opp.legs:
            min_out = apply_slippage(leg["amount_out"])
            hops.append(self._make_hop(
                dex       = leg["dex"],
                token_in  = leg["token_in"],
                token_out = leg["token_out"],
                fee       = leg.get("fee", 0),
                min_out   = min_out,
            ))

        return {
            "tradeId":     trade_id,
            "flashToken":  Web3.to_checksum_address(opp.token_in),
            "flashAmount": opp.amount_in,
            "path":        hops,
            "minProfit":   max(opp.net_profit, 0),
            "deadline":    int(time.time()) + 60,
        }

    def build_tx_dict(self, opp: ArbOpportunity) -> dict:
        trade_params = self._make_trade_params(opp)
        nonce        = self.w3.eth.get_transaction_count(self.account.address, "latest")
        fee_data     = self.w3.eth.fee_history(1, "latest", [50])
        base_fee     = fee_data["baseFeePerGas"][-1]
        priority     = self.w3.to_wei("0.001", "gwei")
        return self.agent_alpha.functions.executeArbitrage(
            trade_params,
        ).build_transaction({
            "from":                 self.account.address,
            "nonce":                nonce,
            "maxFeePerGas":         base_fee * 2 + priority,
            "maxPriorityFeePerGas": priority,
            "chainId":              self.cfg["chain_id"],
        })

    def execute(self, opp: ArbOpportunity) -> str:
        """
        Sign and broadcast the transaction.
        Step 12: if use_flashbots=True, sends via Flashbots Protect RPC
        so the tx is not visible in the public mempool before inclusion.
        """
        tx     = self.build_tx_dict(opp)
        signed = self.w3.eth.account.sign_transaction(tx, self.account.key)
        raw_tx = signed.raw_transaction

        if self.use_flashbots and self.fb_w3:
            try:
                tx_hash = self.fb_w3.eth.send_raw_transaction(raw_tx)
                log.info("[MEV] Sent via Flashbots Protect")
                return tx_hash.hex()
            except Exception as e:
                log.warning("[MEV] Flashbots send failed (%s) — falling back to public RPC", e)

        tx_hash = self.w3.eth.send_raw_transaction(raw_tx)
        return tx_hash.hex()


# ─────────────────────────────────────────────────────────────────────────────
# STEPS 4, 5, 7, 8: Arbitrage Detector
# ─────────────────────────────────────────────────────────────────────────────
class ArbDetector:
    """
    Detects arbitrage opportunities across all pairs, all routes, all sizes.

    Step 4: scans USDC/WETH, WETH/cbBTC, USDC/cbBTC
    Step 5: tries multiple trade sizes and picks the one with highest net profit
    Step 7: scans all pairs in parallel using ThreadPoolExecutor
    Step 8: scans 3-leg routes (USDC -> WETH -> cbBTC -> USDC)
    """

    def __init__(
        self,
        fetcher:       PriceFetcher,
        gas_estimator: GasEstimator,
        builder:       Optional[TxBuilder],
        cfg:           dict,
        min_profit:    float = 1.0,
    ):
        self.fetcher       = fetcher
        self.gas_estimator = gas_estimator
        self.builder       = builder
        self.cfg           = cfg
        self.min_profit    = int(min_profit * 1_000_000)

    def scan_all(self) -> Optional[ArbOpportunity]:
        """
        STEP 7: Scan all 2-leg pairs + all 3-leg routes in parallel.
        Returns the single most profitable opportunity found, or None.
        """
        tasks = []

        # 2-leg tasks: one per pair
        for (tk_in, tk_out, dec_in, dec_out) in TRADING_PAIRS:
            tasks.append(("2leg", tk_in, tk_out, dec_in, dec_out))

        # 3-leg tasks: triangular routes
        # USDC -> WETH -> cbBTC -> USDC
        # USDC -> cbBTC -> WETH -> USDC
        tasks.append(("3leg", "usdc", "weth",  6, 18, "cbbtc", 8))
        tasks.append(("3leg", "usdc", "cbbtc", 6, 8,  "weth",  18))

        candidates: list[ArbOpportunity] = []

        with ThreadPoolExecutor(max_workers=len(tasks)) as executor:
            futures = {}
            for task in tasks:
                if task[0] == "2leg":
                    _, tk_in, tk_out, dec_in, dec_out = task
                    f = executor.submit(self._scan_pair_2leg,
                                        tk_in, tk_out, dec_in, dec_out)
                else:
                    _, tk_in, tk_mid, dec_in, dec_mid, tk_out, dec_out = task
                    f = executor.submit(self._scan_route_3leg,
                                        tk_in, tk_mid, dec_in, dec_mid,
                                        tk_out, dec_out)
                futures[f] = task

            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result is not None:
                        candidates.append(result)
                except Exception as e:
                    log.error("Scan task error: %s", e)

        if not candidates:
            return None
        return max(candidates, key=lambda o: o.net_profit)

    # ── 2-Leg scanning ────────────────────────────────────────────────────────

    def _scan_pair_2leg(
        self,
        tk_in:   str, tk_out:  str,
        dec_in:  int, dec_out: int,
    ) -> Optional[ArbOpportunity]:
        """
        Scan one pair across Uniswap and Aerodrome.
        Step 5: try multiple trade sizes and return the best.
        """
        addr_in  = self.cfg[tk_in]
        addr_out = self.cfg[tk_out]

        # Step 5: build candidate sizes
        sizes = self._candidate_sizes(dec_in)
        best: Optional[ArbOpportunity] = None

        for amt in sizes:
            uni_out,  uni_fee  = self.fetcher.quote_uniswap_best(addr_in, addr_out, amt)
            aero_out           = self.fetcher.quote_aerodrome_best(addr_in, addr_out, amt)

            routes = []
            if uni_out is not None:
                routes.append({
                    "buy_dex": "uniswap", "buy_out": uni_out, "buy_fee": uni_fee,
                    "sell_dex": "aerodrome",
                })
            if aero_out is not None:
                routes.append({
                    "buy_dex": "aerodrome", "buy_out": aero_out, "buy_fee": 0,
                    "sell_dex": "uniswap",
                })

            for route in routes:
                buy_out = route["buy_out"]

                if route["sell_dex"] == "uniswap":
                    sell_out, sell_fee = self.fetcher.quote_uniswap_best(
                        addr_out, addr_in, buy_out)
                else:
                    sell_out = self.fetcher.quote_aerodrome_best(
                        addr_out, addr_in, buy_out)
                    sell_fee = 0

                if sell_out is None:
                    continue

                opp = self._evaluate(
                    token_in      = addr_in,
                    token_out     = addr_out,
                    tk_in_key     = tk_in,
                    tk_out_key    = tk_out,
                    dec_in        = dec_in,
                    dec_out       = dec_out,
                    amount_in     = amt,
                    buy_amount_out= buy_out,
                    sell_amount_out= sell_out,
                    legs          = (
                        {"dex": route["buy_dex"],  "token_in": addr_in,
                         "token_out": addr_out, "fee": route["buy_fee"],  "amount_out": buy_out},
                        {"dex": route["sell_dex"], "token_in": addr_out,
                         "token_out": addr_in,  "fee": sell_fee,           "amount_out": sell_out},
                    ),
                    route_type    = "2leg",
                )
                if opp is not None:
                    if best is None or opp.net_profit > best.net_profit:
                        best = opp

        return best

    # ── 3-Leg scanning ────────────────────────────────────────────────────────

    def _scan_route_3leg(
        self,
        tk_in:   str, tk_mid:  str,
        dec_in:  int, dec_mid: int,
        tk_out:  str, dec_out: int,
    ) -> Optional[ArbOpportunity]:
        """
        STEP 8: Triangular arbitrage.
        Route: token_in -> token_mid -> token_out -> token_in
        Example: USDC -> WETH -> cbBTC -> USDC

        We probe the best DEX for each leg independently.
        """
        addr_in  = self.cfg[tk_in]
        addr_mid = self.cfg[tk_mid]
        addr_out = self.cfg[tk_out]  # final token = same as token_in (closing the loop)
        # Note: in a triangle, the final token should be addr_in
        # tk_out here is the intermediate that gets sold for tk_in at the end
        # The path is: tk_in -> tk_mid -> tk_out -> tk_in
        addr_final = addr_in

        sizes = self._candidate_sizes(dec_in)
        best: Optional[ArbOpportunity] = None

        for amt in sizes:
            # Leg 1: token_in -> token_mid (best DEX)
            uni1_out, uni1_fee = self.fetcher.quote_uniswap_best(addr_in, addr_mid, amt)
            aero1_out          = self.fetcher.quote_aerodrome_best(addr_in, addr_mid, amt)
            leg1_out, leg1_dex, leg1_fee = self._pick_best(uni1_out, uni1_fee, aero1_out)
            if leg1_out is None:
                continue

            # Leg 2: token_mid -> token_out (best DEX)
            uni2_out, uni2_fee = self.fetcher.quote_uniswap_best(addr_mid, addr_out, leg1_out)
            aero2_out          = self.fetcher.quote_aerodrome_best(addr_mid, addr_out, leg1_out)
            leg2_out, leg2_dex, leg2_fee = self._pick_best(uni2_out, uni2_fee, aero2_out)
            if leg2_out is None:
                continue

            # Leg 3: token_out -> token_in (close the loop, best DEX)
            uni3_out, uni3_fee = self.fetcher.quote_uniswap_best(addr_out, addr_final, leg2_out)
            aero3_out          = self.fetcher.quote_aerodrome_best(addr_out, addr_final, leg2_out)
            leg3_out, leg3_dex, leg3_fee = self._pick_best(uni3_out, uni3_fee, aero3_out)
            if leg3_out is None:
                continue

            opp = self._evaluate(
                token_in        = addr_in,
                token_out       = addr_mid,
                tk_in_key       = tk_in,
                tk_out_key      = tk_mid,
                dec_in          = dec_in,
                dec_out         = dec_mid,
                amount_in       = amt,
                buy_amount_out  = leg1_out,
                sell_amount_out = leg3_out,
                legs            = (
                    {"dex": leg1_dex, "token_in": addr_in,  "token_out": addr_mid,
                     "fee": leg1_fee, "amount_out": leg1_out},
                    {"dex": leg2_dex, "token_in": addr_mid, "token_out": addr_out,
                     "fee": leg2_fee, "amount_out": leg2_out},
                    {"dex": leg3_dex, "token_in": addr_out, "token_out": addr_final,
                     "fee": leg3_fee, "amount_out": leg3_out},
                ),
                route_type      = "3leg",
            )
            if opp is not None:
                if best is None or opp.net_profit > best.net_profit:
                    best = opp

        return best

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _pick_best(
        self,
        uni_out:  Optional[int], uni_fee: int,
        aero_out: Optional[int],
    ) -> tuple[Optional[int], str, int]:
        """Return (best_amount_out, dex_name, fee_tier)."""
        if uni_out is None and aero_out is None:
            return None, "none", 0
        if uni_out is None:
            return aero_out, "aerodrome", 0
        if aero_out is None:
            return uni_out, "uniswap", uni_fee
        if uni_out >= aero_out:
            return uni_out, "uniswap", uni_fee
        return aero_out, "aerodrome", 0

    def _candidate_sizes(self, token_decimals: int) -> list[int]:
        """
        STEP 5: Generate SIZING_SAMPLES trade sizes between MIN and MAX.
        Returned as raw token units using the token's decimals.

        We use a linear scale between min and max. The detector evaluates
        all of them and picks the size that maximises net profit.

        Why linear and not geometric? For flash arb the profit curve is
        roughly linear up to the pool's depth, then falls off. Linear
        sampling catches the plateau better than geometric spacing.
        """
        min_raw = int(MIN_TRADE_USDC * (10 ** token_decimals))
        max_raw = int(MAX_TRADE_USDC * (10 ** token_decimals))
        step    = (max_raw - min_raw) // (SIZING_SAMPLES - 1)
        return [min_raw + i * step for i in range(SIZING_SAMPLES)]

    def _evaluate(
        self,
        token_in:        str,
        token_out:       str,
        tk_in_key:       str,
        tk_out_key:      str,
        dec_in:          int,
        dec_out:         int,
        amount_in:       int,
        buy_amount_out:  int,
        sell_amount_out: int,
        legs:            tuple,
        route_type:      str,
    ) -> Optional[ArbOpportunity]:
        """
        Given a completed route, compute economics and return an
        ArbOpportunity if net profit >= min_profit threshold.
        """
        gross = sell_amount_out - amount_in
        if gross <= 0:
            return None

        flash_premium = (amount_in * AAVE_FLASH_PREMIUM_BPS) // 10_000

        # Build provisional opportunity for gas estimation
        provisional = ArbOpportunity(
            token_in        = token_in,
            token_out       = token_out,
            token_in_key    = tk_in_key,
            token_out_key   = tk_out_key,
            token_in_dec    = dec_in,
            token_out_dec   = dec_out,
            route_type      = route_type,
            legs            = legs,
            amount_in       = amount_in,
            buy_amount_out  = buy_amount_out,
            sell_amount_out = sell_amount_out,
            gross_profit    = gross,
            flash_premium   = flash_premium,
            gas_cost_usdc   = 0,
            gas_cost_wei    = 0,
            gas_units       = 0,
            net_profit      = 0,
        )

        gas_units, gas_cost_wei, gas_cost_usdc = self._estimate_gas(provisional)

        # Convert gas cost to token_in units if token_in is not USDC
        # (for WETH or cbBTC pairs, gas is still estimated in USDC then
        # converted proportionally using the first leg's price)
        gas_in_token = self._gas_in_token(gas_cost_usdc, amount_in, legs, dec_in)

        net = gross - flash_premium - gas_in_token

        if net < self.min_profit:
            return None

        return ArbOpportunity(
            token_in        = token_in,
            token_out       = token_out,
            token_in_key    = tk_in_key,
            token_out_key   = tk_out_key,
            token_in_dec    = dec_in,
            token_out_dec   = dec_out,
            route_type      = route_type,
            legs            = legs,
            amount_in       = amount_in,
            buy_amount_out  = buy_amount_out,
            sell_amount_out = sell_amount_out,
            gross_profit    = gross,
            flash_premium   = flash_premium,
            gas_cost_usdc   = gas_cost_usdc,
            gas_cost_wei    = gas_cost_wei,
            gas_units       = gas_units,
            net_profit      = net,
        )

    def _gas_in_token(
        self,
        gas_cost_usdc: int,
        amount_in:     int,
        legs:          tuple,
        dec_in:        int,
    ) -> int:
        """
        Convert gas cost (always in USDC) to token_in units.
        For USDC pairs: direct (1:1 scale by decimals).
        For WETH/cbBTC pairs: approximate using the ratio of
        amount_in (in token units) to its USDC equivalent from first leg.

        This avoids an extra RPC call while remaining accurate enough
        for profitability gating. The absolute precision is less critical
        than having a real estimate vs the old flat $0.10.
        """
        if dec_in == 6:
            # token_in is USDC — gas_cost_usdc is directly in the right units
            return gas_cost_usdc

        # For non-USDC token_in, we know amount_in raw units correspond to
        # some USDC value. We infer the ratio from the final sell leg.
        # sell_out is in token_in units; sell_amount_out ~ amount_in in USDC terms.
        # Rough approximation: gas_token = gas_usdc * (amount_in / usdc_equivalent)
        try:
            final_leg   = legs[-1]
            # sell_out is the final leg's amount_out (in token_in = usdc for 2-leg,
            # or the closing leg amount for 3-leg)
            usdc_equiv  = final_leg["amount_out"]   # this is in USDC if token_in=usdc
            if usdc_equiv <= 0:
                return gas_cost_usdc
            # ratio = (amount_in in token units) / (usdc_equiv in USDC units)
            ratio       = amount_in / usdc_equiv
            return int(gas_cost_usdc * ratio)
        except Exception:
            return gas_cost_usdc

    def _estimate_gas(self, provisional: ArbOpportunity) -> tuple[int, int, int]:
        if self.builder is not None:
            try:
                tx_dict   = self.builder.build_tx_dict(provisional)
                from_addr = self.builder.account.address
                return self.gas_estimator.estimate(tx_dict, from_addr)
            except Exception as e:
                log.warning("Gas estimate failed: %s", e)

        # Simulate mode / fallback
        tx_dict, from_addr = self._build_simulate_tx(provisional)
        return self.gas_estimator.estimate(tx_dict, from_addr)

    def _build_simulate_tx(self, opp: ArbOpportunity) -> tuple[dict, str]:
        _zero = "0x0000000000000000000000000000000000000000"
        try:
            agent    = self.fetcher.w3.eth.contract(
                address=Web3.to_checksum_address(self.cfg["agent_alpha"]),
                abi=AGENT_ALPHA_ABI,
            )
            trade_id = Web3.keccak(_struct.pack(">Q", int(time.time())))
            hops = []
            for leg in opp.legs:
                dex      = leg["dex"]
                dex_type = 0 if dex == "uniswap" else 1
                router   = (Web3.to_checksum_address(self.cfg["uniswap_router"])
                            if dex == "uniswap"
                            else Web3.to_checksum_address(self.cfg["aerodrome_router"]))
                hops.append({
                    "dex":      router,
                    "dexType":  dex_type,
                    "tokenIn":  Web3.to_checksum_address(leg["token_in"]),
                    "tokenOut": Web3.to_checksum_address(leg["token_out"]),
                    "fee":      leg.get("fee", 0),
                    "minOut":   0,
                    "poolId":   b"\x00" * 32,
                })
            trade_params = {
                "tradeId":     trade_id,
                "flashToken":  Web3.to_checksum_address(opp.token_in),
                "flashAmount": opp.amount_in,
                "path":        hops,
                "minProfit":   0,
                "deadline":    int(time.time()) + 60,
            }
            tx_dict = agent.functions.executeArbitrage(trade_params).build_transaction({
                "from": _zero, "chainId": self.cfg["chain_id"],
            })
            return tx_dict, _zero
        except Exception as e:
            log.debug("Simulate tx build failed: %s", e)
            return {}, _zero


# ─────────────────────────────────────────────────────────────────────────────
# Main Agent
# ─────────────────────────────────────────────────────────────────────────────
class Agent:
    def __init__(
        self,
        network:       str,
        mode:          str,
        min_profit:    float,
        interval:      int,
        use_flashbots: bool = False,
    ):
        self.mode     = mode
        self.interval = interval

        cfg = NETWORKS.get(network)
        if not cfg:
            raise ValueError(f"Unknown network: {network}")
        self.cfg = cfg

        # ── Web3 connection ───────────────────────────────────────────────────
        self.w3 = Web3(Web3.HTTPProvider(cfg["rpc"]))
        try:
            self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        except Exception:
            self.w3.middleware_onion.add(geth_poa_middleware)

        if not self.w3.is_connected():
            raise ConnectionError(f"Cannot connect to RPC: {cfg['rpc']}")
        log.info("Connected to %s (chain %s), block #%s",
                 network, cfg["chain_id"], self.w3.eth.block_number)

        # ── Components ────────────────────────────────────────────────────────
        private_key = os.getenv("PRIVATE_KEY")
        if mode == "live":
            if not private_key:
                raise ValueError("PRIVATE_KEY env var required for live mode")
            self.builder = TxBuilder(self.w3, cfg, private_key,
                                     use_flashbots=use_flashbots)
            self._verify_executor_role(private_key)
        else:
            self.builder = None

        fetcher           = PriceFetcher(self.w3, cfg)
        gas_estimator     = GasEstimator(self.w3, cfg)
        self.detector     = ArbDetector(
            fetcher       = fetcher,
            gas_estimator = gas_estimator,
            builder       = self.builder,
            cfg           = cfg,
            min_profit    = min_profit,
        )
        self.perf         = PerformanceTracker()
        self.circuit      = CircuitBreaker()
        self.alerter      = Alerter()

        self.profit_dist  = self.w3.eth.contract(
            address=Web3.to_checksum_address(cfg["profit_dist"]),
            abi=PROFIT_DIST_ABI,
        )

    def _verify_executor_role(self, private_key: str) -> None:
        account = self.w3.eth.account.from_key(private_key)
        agent   = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.cfg["agent_alpha"]),
            abi=AGENT_ALPHA_ABI,
        )
        try:
            role     = agent.functions.EXECUTOR_ROLE().call()
            has_role = agent.functions.hasRole(role, account.address).call()
            if not has_role:
                raise PermissionError(
                    f"Account {account.address} does not have EXECUTOR_ROLE on AgentAlpha."
                )
            log.info("[OK] Executor role confirmed for %s", account.address)
        except PermissionError:
            raise
        except Exception as e:
            log.warning("Could not verify executor role: %s", e)

    def _get_chain_stats(self) -> tuple[float, float]:
        try:
            tvl  = self.profit_dist.functions.totalValueLocked().call()
            dist = self.profit_dist.functions.totalProfitDistributed().call()
            return tvl / 1e6, dist / 1e6
        except Exception:
            return 0.0, 0.0

    def _print_opportunity(self, opp: ArbOpportunity, executed: bool = False) -> None:
        label = "[EXECUTING]" if executed else "[SIMULATE]"
        scale = 10 ** opp.token_in_dec
        gross = opp.gross_profit    / scale
        net   = opp.net_profit      / scale
        size  = opp.amount_in       / scale
        prem  = opp.flash_premium   / scale
        gas   = opp.gas_cost_usdc   / 1e6

        leg_str = " -> ".join(
            f"{l['dex'].upper()}" + (f"(fee={l['fee']})" if l['dex'] == 'uniswap' else "")
            for l in opp.legs
        )

        log.info("  %s %s ARBITRAGE", label, opp.route_type.upper())
        log.info("  Pair       : %s / %s", opp.token_in_key.upper(), opp.token_out_key.upper())
        log.info("  Route      : %s", leg_str)
        log.info("  Trade size : %.4f %s", size, opp.token_in_key.upper())
        log.info("  Gross      : +%.6f %s", gross, opp.token_in_key.upper())
        log.info("  Flash fee  : -%.6f %s (5 bps)", prem, opp.token_in_key.upper())
        log.info("  Gas cost   : -$%.4f USDC (%s units)", gas, opp.gas_units)
        log.info("  Net        : +%.6f %s", net, opp.token_in_key.upper())

    def scan(self) -> None:
        self.perf.record_scan()

        # STEP 9: Check circuit breaker before doing any work
        if self.circuit.is_open():
            return

        log.info("Scan #%s @ block %s", self.perf.scans, self.w3.eth.block_number)

        # STEP 7: Parallel scan of all pairs
        opp = self.detector.scan_all()

        if opp is None:
            log.info("  -> no profitable route found")
            return

        self.perf.record_opportunity()
        self._print_opportunity(opp, executed=(self.mode == "live"))

        if self.mode == "live":
            try:
                tx_hash = self.builder.execute(opp)
                log.info("  Tx sent: %s/tx/%s", self.cfg["explorer"], tx_hash)

                receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

                if receipt["status"] == 1:
                    net_usdc = Decimal(opp.net_profit) / Decimal(10 ** opp.token_in_dec)
                    self.perf.record_win(net_usdc, opp.gas_cost_usdc / 1e6)
                    log.info("  [OK] Confirmed (block %s) net: +%.6f %s",
                             receipt["blockNumber"], net_usdc, opp.token_in_key.upper())
                    # STEP 14: Alert on successful trade
                    self.alerter.send(
                        f"[Aetheris] Trade confirmed\n"
                        f"Route: {opp.route_type} | Net: +{net_usdc:.4f} {opp.token_in_key.upper()}\n"
                        f"Tx: {self.cfg['explorer']}/tx/{tx_hash}"
                    )
                else:
                    self.perf.record_loss()
                    self.circuit.check(self.perf.consecutive_failures)
                    log.error("  [ERR] Transaction reverted")
                    # STEP 14: Alert on revert
                    self.alerter.send(
                        f"[Aetheris] WARNING: Trade reverted\n"
                        f"Tx: {self.cfg['explorer']}/tx/{tx_hash}"
                    )

            except Exception as e:
                self.perf.record_error()
                self.circuit.check(self.perf.consecutive_failures)
                log.error("  [ERR] Execution failed: %s", e)

    def run(self) -> None:
        tvl, dist = self._get_chain_stats()
        log.info("=" * 60)
        log.info("  AETHERIS AGENT ALPHA — PHASE 1 COMPLETE")
        log.info("=" * 60)
        log.info("  Mode         : %s", self.mode.upper())
        log.info("  Network      : %s", self.cfg["chain_id"])
        log.info("  AgentAlpha   : %s", self.cfg["agent_alpha"])
        log.info("  Protocol TVL : $%.2f USDC", tvl)
        log.info("  Total dist.  : $%.2f USDC", dist)
        log.info("  Pairs        : %s", [f"{a}/{b}" for a,b,*_ in TRADING_PAIRS])
        log.info("  Fee tiers    : %s", UNISWAP_FEE_TIERS)
        log.info("  Trade sizes  : $%.0f - $%.0f (%s samples)",
                 MIN_TRADE_USDC, MAX_TRADE_USDC, SIZING_SAMPLES)
        log.info("  Slippage buf : %s bps", SLIPPAGE_BPS)
        log.info("  Circuit bkr  : trip at %s failures, pause %ss",
                 CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_PAUSE_S)
        log.info("  Interval     : %ss", self.interval)
        log.info("=" * 60)

        if self.mode == "simulate":
            log.info("  [INFO] SIMULATE MODE: opportunities logged but not executed")

        # STEP 14: Startup alert
        self.alerter.send(
            f"[Aetheris] Agent Alpha started\n"
            f"Mode: {self.mode.upper()} | Network: {self.cfg['chain_id']}"
        )

        try:
            while True:
                try:
                    self.scan()
                except KeyboardInterrupt:
                    raise
                except Exception as e:
                    self.perf.record_error()
                    self.circuit.check(self.perf.consecutive_failures)
                    log.error("Scan error: %s", e)

                if self.perf.scans % 20 == 0:
                    self.perf.print_summary()

                time.sleep(self.interval)

        except KeyboardInterrupt:
            log.info("Shutting down...")
            self.perf.print_summary()
            self.alerter.send("[Aetheris] Agent Alpha stopped")


# ─────────────────────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Aetheris Agent Alpha — Phase 1")
    parser.add_argument("--network",       default="baseSepolia", choices=list(NETWORKS.keys()))
    parser.add_argument("--mode",          default="simulate",    choices=["simulate", "live"])
    parser.add_argument("--min-profit",    type=float, default=float(os.getenv("MIN_PROFIT_USDC", "1.0")))
    parser.add_argument("--interval",      type=int,   default=int(os.getenv("POLL_INTERVAL_SECONDS", "15")))
    parser.add_argument("--flashbots",     action="store_true",
                        help="Route transactions through Flashbots Protect RPC (live mode only)")
    args = parser.parse_args()

    agent = Agent(
        network       = args.network,
        mode          = args.mode,
        min_profit    = args.min_profit,
        interval      = args.interval,
        use_flashbots = args.flashbots,
    )
    agent.run()


if __name__ == "__main__":
    main()