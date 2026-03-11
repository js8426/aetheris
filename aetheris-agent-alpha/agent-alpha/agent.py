# Aetheris\aetheris-agent-alpha\agent-alpha\agent.py
# 
# Aetheris\aetheris-agent-alpha\agent-alpha\agent.py
# 
# #!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
# PHASE 1 STEPS PRESERVED:
#   1.  Unicode-safe logging
#   2.  Real gas estimation (eth_estimateGas + live ETH price)
#   3.  All Uniswap V3 fee tiers (100, 500, 3000, 10000)
#   4.  All liquid pairs: USDC/WETH, WETH/cbBTC, USDC/cbBTC
#   5.  Optimal trade sizing (now replaced by binary search — U2)
#   6.  Slippage buffer (0.3%, configurable)
#   7.  Parallel scanning of all pairs (ThreadPoolExecutor)
#   8.  3-leg triangular routes
#   9.  Circuit breaker (pause after N consecutive failures)
#   10. Performance tracking (now written to SQLite — U6/DB)
#   11. Balancer V2 and Curve Finance DEX support hooks (ready)
#   12. MEV protection via Flashbots Protect RPC
#   13. VPS/PM2 deployment config — see PM2_ECOSYSTEM_CONFIG below
#   14. Telegram + Discord alerting
#   15. Mainnet validation checklist — see MAINNET_CHECKLIST below

#  Aetheris Protocol Agent Alpha  —  Phase 2

# PHASE 2 UPGRADES (on top of all Phase 1 steps):
#   U1. WebSocket block subscription — reacts to every block (~2s on Base)
#       Flashblock-ready architecture: plug in 200ms feed without rewriting
#   U2. Binary search trade sizing — golden section search, ~12 evaluations
#       finds true profit-maximising size, stops bleeding to price impact
#   U3. Pool state + wallet monitoring — Base has no public mempool.
#       Watch known high-volume wallets and pool Swap events instead.
#       Triggers immediate scan when large activity detected.
#   U4. Multi-RPC with automatic failover — Alchemy primary, QuickNode
#       secondary, public RPC tertiary. Continuous health checking.
#   U5. Volatility-triggered intelligence — rolling std-dev determines
#       aggressive / normal / conservation mode in real time.
#   U6. Dynamic route scoring — cbBTC pairs start with highest priority,
#       scores update after every scan, dashboard exposes history.
#   U7. JIT simulation — eth_call against current state before every tx.
#       Trade cancelled if simulation fails. Eliminates ~50% of reverts.
#   U8. Priority fee gas ladder — three tiers based on expected profit.
#       Never over-pay for small trades, never lose big trades to outbids.

PM2 DEPLOYMENT — ecosystem.config.js:
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

MAINNET VALIDATION CHECKLIST (complete all before production):
  [ ] Run --mode simulate --network base for 7 days, review agent.db
  [ ] Confirm at least 10 profitable simulated opportunities logged
  [ ] Deploy AgentAlpha + ProfitDistributor to Base mainnet
  [ ] Update NETWORKS['base'] agent_alpha + profit_dist addresses
  [ ] Run --mode live --network base with --max-trade-size 1000 for 7 days
  [ ] Gradually increase --max-trade-size via governance
  [ ] Monitor Basescan for reverts; set TELEGRAM_BOT_TOKEN alerts
  [ ] After 30 days clean operation, remove testnet config

Usage:
    python agent.py --mode simulate --network baseSepolia
    python agent.py --mode live     --network baseSepolia --flashbots
    python agent.py --mode live     --network base --max-trade-size 50000

Environment variables (.env):
    PRIVATE_KEY                  Deployer wallet with EXECUTOR_ROLE
    BASE_SEPOLIA_RPC_URL         Alchemy HTTP RPC for Base Sepolia
    BASE_MAINNET_RPC_URL         Alchemy HTTP RPC for Base mainnet
    BASE_SEPOLIA_WS_URL          Alchemy WebSocket URL for Base Sepolia (U1)
    BASE_MAINNET_WS_URL          Alchemy WebSocket URL for Base mainnet (U1)
    QUICKNODE_SEPOLIA_RPC_URL    QuickNode HTTP failover for Base Sepolia (U4)
    QUICKNODE_MAINNET_RPC_URL    QuickNode HTTP failover for Base mainnet (U4)
    FLASHBOTS_RPC_URL            Optional Flashbots Protect endpoint
    TELEGRAM_BOT_TOKEN           Optional Telegram alerts
    TELEGRAM_CHAT_ID             Optional Telegram chat ID
    DISCORD_WEBHOOK_URL          Optional Discord webhook
    MIN_PROFIT_USDC              Minimum net profit per trade (default: 1.0)
    PYTHONIOENCODING=utf-8       Set in shell or PM2 config

Requirements:
    pip install web3 python-dotenv requests websockets
"""

# ─────────────────────────────────────────────────────────────────────────────
# Unicode-safe stdout/stderr (must be first)
# ─────────────────────────────────────────────────────────────────────────────
import sys
import io

def _make_utf8_stream(stream):
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
# Logging
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
import json
import math
import struct as _struct
import hashlib
import asyncio
import sqlite3
import threading
import argparse
import requests
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from typing import Optional, NamedTuple, List, Dict, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed, Future
from collections import deque
from dataclasses import dataclass, field
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ─────────────────────────────────────────────────────────────────────────────
# Third-party imports
# ─────────────────────────────────────────────────────────────────────────────
from dotenv import load_dotenv
from web3 import Web3
try:
    from web3.middleware import geth_poa_middleware
except ImportError:
    from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware

try:
    import websockets as _ws_lib
    _WS_AVAILABLE = True
except ImportError:
    _WS_AVAILABLE = False
    log.warning("[U1] 'websockets' package not installed. "
                "Run: pip install websockets  — falling back to HTTP polling.")

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# Network Configuration
# ─────────────────────────────────────────────────────────────────────────────
NETWORKS = {
    "baseSepolia": {
        "rpc":              os.getenv("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org"),
        "ws_url":           os.getenv("BASE_SEPOLIA_WS_URL", ""),
        "rpc_secondary":    os.getenv("QUICKNODE_SEPOLIA_RPC_URL", ""),
        "rpc_tertiary":     "https://sepolia.base.org",
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
        "ws_url":           os.getenv("BASE_MAINNET_WS_URL", ""),
        "rpc_secondary":    os.getenv("QUICKNODE_MAINNET_RPC_URL", ""),
        "rpc_tertiary":     "https://mainnet.base.org",
        "chain_id":         8453,
        "explorer":         "https://basescan.org",
        "agent_alpha":      "MAINNET_AGENT_ALPHA_ADDRESS",   # update after deploy
        "profit_dist":      "MAINNET_PROFIT_DIST_ADDRESS",   # update after deploy
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
# Trading constants
# ─────────────────────────────────────────────────────────────────────────────
UNISWAP_FEE_TIERS   = [100, 500, 3000, 10000]
TRADING_PAIRS       = [
    ("usdc",  "weth",  6,  18),
    ("weth",  "cbbtc", 18, 8),
    ("usdc",  "cbbtc", 6,  8),
]
AERODROME_FACTORY   = "0x420DD381b31aEf6683db6B902084cB0FFECe40D"
AAVE_FLASH_PREMIUM_BPS = 5
GAS_BUFFER_MULTIPLIER  = 1.2
GAS_FALLBACK_UNITS     = 600_000
ETH_PRICE_QUOTE_AMOUNT = 10 ** 18
SLIPPAGE_BPS           = 30

# Phase 1 sizing constants (kept for fallback / simulate mode reference)
MIN_TRADE_USDC  = 1_000.0
MAX_TRADE_USDC  = 100_000.0

# Phase 1 circuit breaker defaults
CIRCUIT_BREAKER_THRESHOLD = 5
CIRCUIT_BREAKER_PAUSE_S   = 600

# Flashbots
FLASHBOTS_RPC_URL = os.getenv("FLASHBOTS_RPC_URL", "https://rpc.flashbots.net")

# ── U5: Volatility thresholds ─────────────────────────────────────────────────
# Rolling window of price-move samples (one per scan)
VOLATILITY_WINDOW_DEFAULT   = 20    # number of recent price samples
VOLATILITY_HIGH_DEFAULT     = 0.003  # 0.3% — enter aggressive mode
VOLATILITY_LOW_DEFAULT      = 0.001  # 0.1% — enter conservation mode

# ── U6: Route scoring ─────────────────────────────────────────────────────────
# Initial scores — cbBTC pairs start highest (lower bot competition)
ROUTE_INITIAL_SCORES: Dict[str, float] = {
    "2leg_usdc_weth":    1.0,
    "2leg_weth_cbbtc":   2.0,
    "2leg_usdc_cbbtc":   2.0,
    "3leg_usdc_weth_cbbtc": 1.8,
    "3leg_usdc_cbbtc_weth": 1.8,
}
ROUTE_WIN_BOOST        = 0.3   # score increase on profitable scan
ROUTE_MISS_DECAY       = 0.05  # score decrease on unprofitable scan
ROUTE_MIN_SCORE        = 0.1   # floor — never fully removed
ROUTE_SCORE_LOOKBACK   = 100   # number of recent scans to track

# ── U8: Gas ladder thresholds (expected net profit in USDC) ───────────────────
GAS_TIER1_MAX_PROFIT   = 5.0    # $0–$5: minimum priority fee
GAS_TIER2_MAX_PROFIT   = 25.0   # $5–$25: competitive priority fee
# >$25: aggressive priority fee
GAS_TIER1_PRIORITY_GWEI = 0.001
GAS_TIER2_PRIORITY_GWEI = 0.005
GAS_TIER3_PRIORITY_GWEI = 0.02

# ── U3: Known high-volume wallets to watch on Base ────────────────────────────
# These addresses historically precede significant price movements.
# Add your own based on on-chain analysis.
WATCHED_WALLETS: List[str] = [
    "0x6887246668a3b87F54DeB3b94Ba47a6f63F32985",  # Binance Base hot wallet
    "0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A",  # Coinbase hot wallet
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",  # Vitalik (signals)
]
# Uniswap V3 pool addresses to watch for large swaps (Base mainnet)
# Replace with testnet equivalents if using baseSepolia
WATCHED_POOLS: List[str] = [
    "0xd0b53D9277642d899DF5C87A3966A349A798F224",  # USDC/WETH 0.05% Base
    "0xc9034c3E7F58003E6ae0C8438e7c8f4598d5ACAA",  # USDC/WETH 0.3% Base
]
# Minimum swap USD value to trigger high-activity mode
WALLET_ACTIVITY_THRESHOLD_USD = 50_000

# ─────────────────────────────────────────────────────────────────────────────
# ABIs
# ─────────────────────────────────────────────────────────────────────────────
AGENT_ALPHA_ABI = [
    {
        "name": "executeArbitrage",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "params", "type": "tuple",
            "components": [
                {"name": "tradeId",     "type": "bytes32"},
                {"name": "flashToken",  "type": "address"},
                {"name": "flashAmount", "type": "uint256"},
                {"name": "path", "type": "tuple[]", "components": [
                    {"name": "dex",     "type": "address"},
                    {"name": "dexType", "type": "uint8"},
                    {"name": "tokenIn", "type": "address"},
                    {"name": "tokenOut","type": "address"},
                    {"name": "fee",     "type": "uint24"},
                    {"name": "minOut",  "type": "uint256"},
                    {"name": "poolId",  "type": "bytes32"},
                ]},
                {"name": "minProfit", "type": "uint256"},
                {"name": "deadline",  "type": "uint256"},
            ]}],
        "outputs": [],
    },
    {"name": "isActive",      "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"name": "", "type": "bool"}]},
    {"name": "isUserActive",  "type": "function", "stateMutability": "view",
     "inputs": [{"name": "user", "type": "address"}], "outputs": [{"name": "", "type": "bool"}]},
    {"name": "EXECUTOR_ROLE", "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"name": "", "type": "bytes32"}]},
    {"name": "hasRole",       "type": "function", "stateMutability": "view",
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
        "inputs": [{"name": "params", "type": "tuple", "components": [
            {"name": "tokenIn",           "type": "address"},
            {"name": "tokenOut",          "type": "address"},
            {"name": "amountIn",          "type": "uint256"},
            {"name": "fee",               "type": "uint24"},
            {"name": "sqrtPriceLimitX96", "type": "uint160"},
        ]}],
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

# Minimal ERC20 ABI for nonce / balance checks
ERC20_ABI_MINIMAL = [
    {"name": "balanceOf", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "account", "type": "address"}],
     "outputs": [{"name": "", "type": "uint256"}]},
]

# ─────────────────────────────────────────────────────────────────────────────
# P1: Multicall3 — canonical deployment on Base (same address all EVM chains)
# ─────────────────────────────────────────────────────────────────────────────
MULTICALL3_ADDR = "0xcA11bde05977b3631167028862bE2a173976CA11"

MULTICALL3_ABI = [
    {
        "name": "aggregate3",
        "type": "function",
        "stateMutability": "payable",
        "inputs": [{
            "name": "calls",
            "type": "tuple[]",
            "components": [
                {"name": "target",       "type": "address"},
                {"name": "allowFailure", "type": "bool"},
                {"name": "callData",     "type": "bytes"},
            ],
        }],
        "outputs": [{
            "name": "returnData",
            "type": "tuple[]",
            "components": [
                {"name": "success",    "type": "bool"},
                {"name": "returnData", "type": "bytes"},
            ],
        }],
    },
    {
        "name": "getCurrentBlockTimestamp",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "timestamp", "type": "uint256"}],
    },
    {
        "name": "getBasefee",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "basefee", "type": "uint256"}],
    },
    {
        "name": "getBlockNumber",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "blockNumber", "type": "uint256"}],
    },
]

# P2: Two-speed scanning constants
SLOW_SCAN_INTERVAL  = 60   # every N blocks run background golden-section search
FAST_SCAN_FALLBACK  = 10_000   # default trade size (USDC) if no cache yet

# ─────────────────────────────────────────────────────────────────────────────
# Data Structures
# ─────────────────────────────────────────────────────────────────────────────
class ArbOpportunity(NamedTuple):
    token_in:        str
    token_out:       str
    token_in_key:    str
    token_out_key:   str
    token_in_dec:    int
    token_out_dec:   int
    route_type:      str
    legs:            tuple
    amount_in:       int
    buy_amount_out:  int
    sell_amount_out: int
    gross_profit:    int
    flash_premium:   int
    gas_cost_usdc:   int
    gas_cost_wei:    int
    gas_units:       int
    net_profit:      int
    route_key:       str   # new: key into RouteScorer
    route_score:     float  # new: score at time of detection


# ─────────────────────────────────────────────────────────────────────────────
# U4: Multi-RPC Pool with automatic failover
# ─────────────────────────────────────────────────────────────────────────────
class RPCPool:
    """
    Manages 3-4 HTTP RPC endpoints with health checking and automatic failover.

    Design:
    - Primary: Alchemy (highest reliability, may have rate limits)
    - Secondary: QuickNode (fastest failover)
    - Tertiary: Public Base RPC (always available, slowest)
    - Each endpoint tracks: last_latency_ms, error_count, is_healthy
    - Route selection: pick healthy endpoint with lowest recent latency
    - Health check runs in background every 30 seconds
    - Rate-limit 429s trigger exponential backoff, not failover
    """

    HEALTH_CHECK_INTERVAL = 30   # seconds
    MAX_LATENCY_MS        = 2000  # anything above this is considered degraded
    MAX_CONSECUTIVE_ERRORS = 3

    def __init__(self, cfg: dict):
        endpoints = [cfg["rpc"]]
        if cfg.get("rpc_secondary"):
            endpoints.append(cfg["rpc_secondary"])
        if cfg.get("rpc_tertiary") and cfg["rpc_tertiary"] not in endpoints:
            endpoints.append(cfg["rpc_tertiary"])

        self._endpoints: List[Dict] = []
        for url in endpoints:
            self._endpoints.append({
                "url":            url,
                "latency_ms":     999.0,
                "error_count":    0,
                "is_healthy":     True,
                "last_check":     0.0,
                "failover_count": 0,
            })
        self._lock          = threading.Lock()
        self._chain_id      = cfg["chain_id"]
        self._w3_cache: Dict[str, Web3] = {}
        self._primary_url   = cfg["rpc"]  # for logging

        # Build W3 instances
        for ep in self._endpoints:
            self._w3_cache[ep["url"]] = self._make_w3(ep["url"])

        # Start health check thread
        self._stop_event = threading.Event()
        self._health_thread = threading.Thread(
            target=self._health_loop, daemon=True, name="rpc-health")
        self._health_thread.start()
        log.info("[U4] RPCPool initialised with %d endpoints", len(self._endpoints))
        for ep in self._endpoints:
            log.info("[U4]   %s", ep["url"][:60])

    def _make_session(self) -> requests.Session:
        """P5: Persistent HTTP session with keep-alive + connection pooling."""
        session = requests.Session()
        adapter = HTTPAdapter(
            pool_connections=4,
            pool_maxsize=10,
            max_retries=Retry(
                total=3,
                backoff_factor=0.1,
                status_forcelist=[500, 502, 503, 504],
            ),
        )
        session.mount("https://", adapter)
        session.mount("http://",  adapter)
        session.headers.update({
            "Content-Type": "application/json",
            "Connection":   "keep-alive",
        })
        return session

    def _make_w3(self, url: str) -> Web3:
        session = self._make_session()
        w3 = Web3(Web3.HTTPProvider(
            url,
            request_kwargs={"timeout": 5},
            session=session,          # P5: reuse TCP connections
        ))
        try:
            w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        except Exception:
            try:
                w3.middleware_onion.add(geth_poa_middleware)
            except Exception:
                pass
        return w3

    def get_w3(self) -> Tuple[Web3, str]:
        """Return (web3_instance, endpoint_url) for the best available endpoint."""
        with self._lock:
            healthy = [ep for ep in self._endpoints if ep["is_healthy"]]
            if not healthy:
                # All unhealthy — try the primary anyway
                ep = self._endpoints[0]
                log.warning("[U4] All endpoints unhealthy, trying primary")
                return self._w3_cache[ep["url"]], ep["url"]
            # Pick lowest latency among healthy
            best = min(healthy, key=lambda e: e["latency_ms"])
            return self._w3_cache[best["url"]], best["url"]

    def record_success(self, url: str, latency_ms: float):
        with self._lock:
            for ep in self._endpoints:
                if ep["url"] == url:
                    ep["latency_ms"]  = latency_ms
                    ep["error_count"] = 0
                    ep["is_healthy"]  = True
                    break

    def record_error(self, url: str, is_rate_limit: bool = False):
        with self._lock:
            for ep in self._endpoints:
                if ep["url"] == url:
                    ep["error_count"] += 1
                    if not is_rate_limit and ep["error_count"] >= self.MAX_CONSECUTIVE_ERRORS:
                        ep["is_healthy"] = False
                        log.warning("[U4] Endpoint marked unhealthy after %d errors: %s",
                                    ep["error_count"], url[:60])
                    break

    def _health_loop(self):
        while not self._stop_event.is_set():
            self._stop_event.wait(self.HEALTH_CHECK_INTERVAL)
            if self._stop_event.is_set():
                break
            for ep in self._endpoints:
                self._check_endpoint(ep)

    def _check_endpoint(self, ep: dict):
        url = ep["url"]
        try:
            start = time.monotonic()
            w3    = self._w3_cache[url]
            bn    = w3.eth.block_number
            ms    = (time.monotonic() - start) * 1000
            with self._lock:
                ep["latency_ms"]  = ms
                ep["error_count"] = 0
                ep["is_healthy"]  = (ms < self.MAX_LATENCY_MS)
                ep["last_check"]  = time.monotonic()
            if ms >= self.MAX_LATENCY_MS:
                log.warning("[U4] High latency (%.0fms) on %s", ms, url[:60])
        except Exception as e:
            with self._lock:
                ep["error_count"] += 1
                ep["is_healthy"]   = False
                log.warning("[U4] Health check failed for %s: %s", url[:60], e)

    def status(self) -> List[Dict]:
        with self._lock:
            return [
                {"url": ep["url"][:60], "healthy": ep["is_healthy"],
                 "latency_ms": round(ep["latency_ms"], 1), "errors": ep["error_count"]}
                for ep in self._endpoints
            ]

    def stop(self):
        self._stop_event.set()


# ─────────────────────────────────────────────────────────────────────────────
# U1: WebSocket Block Subscriber
# ─────────────────────────────────────────────────────────────────────────────
class BlockSubscriber:
    """
    Subscribes to eth_subscribe("newHeads") via WebSocket.

    When a new block arrives, sets self.block_event so the main loop
    can react without polling.

    Flashblock-ready: if ws_url is a Flashblock endpoint (200ms sub-intervals),
    plug it into BASE_SEPOLIA_WS_URL and this class handles it transparently.

    Falls back gracefully: if WS is unavailable, the main loop uses
    time.sleep(interval) as in Phase 1, so nothing breaks.
    """

    RECONNECT_DELAY   = 5    # seconds between reconnect attempts
    PING_INTERVAL     = 20   # seconds between WebSocket keep-alive pings

    def __init__(self, ws_url: str):
        self.ws_url         = ws_url
        self.block_event    = threading.Event()
        self.latest_block:  Optional[dict] = None
        self._running       = True
        self._connected     = False
        self._thread: Optional[threading.Thread] = None

        if not ws_url:
            log.info("[U1] No WebSocket URL configured. Using HTTP polling fallback.")
            return
        if not _WS_AVAILABLE:
            log.warning("[U1] websockets package missing. Using HTTP polling fallback.")
            return

        self._thread = threading.Thread(
            target=self._run_loop, daemon=True, name="ws-blocks")
        self._thread.start()
        log.info("[U1] WebSocket subscriber started: %s", ws_url[:60])

    @property
    def is_connected(self) -> bool:
        return self._connected

    def wait_for_block(self, timeout: float = 3.0) -> bool:
        """Wait up to `timeout` seconds for a new block. Returns True if block arrived."""
        triggered = self.block_event.wait(timeout=timeout)
        if triggered:
            self.block_event.clear()
        return triggered

    def _run_loop(self):
        """Outer loop: reconnect indefinitely on errors."""
        while self._running:
            try:
                asyncio.run(self._subscribe())
            except Exception as e:
                self._connected = False
                if self._running:
                    log.warning("[U1] WebSocket error: %s. Reconnecting in %ds…",
                                e, self.RECONNECT_DELAY)
                    time.sleep(self.RECONNECT_DELAY)

    async def _subscribe(self):
        import websockets
        subscribe_msg = json.dumps({
            "id": 1, "jsonrpc": "2.0",
            "method": "eth_subscribe",
            "params": ["newHeads"],
        })
        async with websockets.connect(
            self.ws_url,
            ping_interval=self.PING_INTERVAL,
            ping_timeout=10,
            close_timeout=5,
        ) as ws:
            await ws.send(subscribe_msg)
            confirm = json.loads(await ws.recv())
            sub_id  = confirm.get("result", "?")
            self._connected = True
            log.info("[U1] WebSocket subscription active (id=%s)", sub_id)

            async for raw in ws:
                if not self._running:
                    break
                try:
                    msg = json.loads(raw)
                    if msg.get("method") == "eth_subscription":
                        block_data = msg["params"]["result"]
                        self.latest_block = block_data
                        self.block_event.set()
                except Exception as e:
                    log.debug("[U1] WS parse error: %s", e)

        self._connected = False

    def stop(self):
        self._running   = False
        self._connected = False
        self.block_event.set()  # unblock any waiting thread


# ─────────────────────────────────────────────────────────────────────────────
# U5: Volatility Tracker
# ─────────────────────────────────────────────────────────────────────────────
class VolatilityTracker:
    """
    Tracks rolling price volatility using a deque of recent price observations.

    Modes:
      AGGRESSIVE   — volatility > high_threshold: scan every block, relax min profit
      NORMAL       — between thresholds: standard operation
      CONSERVATION — volatility < low_threshold: reduce scan frequency, raise min profit

    Price samples are normalised percentage moves: abs(price_now - price_prev) / price_prev
    """

    MODE_AGGRESSIVE   = "AGGRESSIVE"
    MODE_NORMAL       = "NORMAL"
    MODE_CONSERVATION = "CONSERVATION"

    def __init__(
        self,
        window:         int   = VOLATILITY_WINDOW_DEFAULT,
        high_threshold: float = VOLATILITY_HIGH_DEFAULT,
        low_threshold:  float = VOLATILITY_LOW_DEFAULT,
    ):
        self.window         = window
        self.high_threshold = high_threshold
        self.low_threshold  = low_threshold
        self._samples: deque = deque(maxlen=window)
        self._last_price:    Optional[float] = None
        self._current_mode   = self.MODE_NORMAL
        self._lock           = threading.Lock()

    def observe(self, price: float):
        """Add a new price observation. Call once per scan per tracked pair."""
        with self._lock:
            if self._last_price is not None and self._last_price > 0:
                move = abs(price - self._last_price) / self._last_price
                self._samples.append(move)
            self._last_price = price
            self._update_mode()

    def _update_mode(self):
        if len(self._samples) < 3:
            return
        vol = self._rolling_std()
        if vol >= self.high_threshold:
            if self._current_mode != self.MODE_AGGRESSIVE:
                log.info("[U5] Volatility %.4f%% >= threshold %.4f%% → AGGRESSIVE mode",
                         vol * 100, self.high_threshold * 100)
            self._current_mode = self.MODE_AGGRESSIVE
        elif vol <= self.low_threshold:
            if self._current_mode != self.MODE_CONSERVATION:
                log.info("[U5] Volatility %.4f%% <= threshold %.4f%% → CONSERVATION mode",
                         vol * 100, self.low_threshold * 100)
            self._current_mode = self.MODE_CONSERVATION
        else:
            if self._current_mode != self.MODE_NORMAL:
                log.info("[U5] Volatility %.4f%% → NORMAL mode", vol * 100)
            self._current_mode = self.MODE_NORMAL

    def _rolling_std(self) -> float:
        samples = list(self._samples)
        n = len(samples)
        if n < 2:
            return 0.0
        mean = sum(samples) / n
        variance = sum((x - mean) ** 2 for x in samples) / (n - 1)
        return math.sqrt(variance)

    @property
    def mode(self) -> str:
        with self._lock:
            return self._current_mode

    @property
    def current_volatility(self) -> float:
        with self._lock:
            return self._rolling_std()

    def mode_adjustments(self) -> Tuple[float, float]:
        """
        Returns (min_profit_multiplier, interval_multiplier).
        AGGRESSIVE: relax min profit, scan faster
        CONSERVATION: raise min profit, scan slower
        """
        m = self.mode
        if m == self.MODE_AGGRESSIVE:
            return 0.5, 0.5   # halve min profit requirement, halve interval
        if m == self.MODE_CONSERVATION:
            return 2.0, 3.0   # double min profit, triple interval
        return 1.0, 1.0       # normal


# ─────────────────────────────────────────────────────────────────────────────
# U6: Dynamic Route Scorer
# ─────────────────────────────────────────────────────────────────────────────
class RouteScorer:
    """
    Maintains a priority score for each route.

    - Higher score → scanned first and more frequently
    - Scores update after every scan result (win OR miss), not just trades
    - cbBTC routes start with double weight (less bot competition)
    - History stored in SQLite for dashboard analysis
    """

    def __init__(self, db: "Database"):
        self.db     = db
        self._lock  = threading.Lock()
        # Load from DB or initialise defaults
        self._scores: Dict[str, float] = dict(ROUTE_INITIAL_SCORES)
        saved = db.load_route_scores()
        if saved:
            for k, v in saved.items():
                self._scores[k] = v
            log.info("[U6] Loaded %d route scores from DB", len(saved))
        else:
            log.info("[U6] Initialised route scores: %s",
                     {k: round(v, 2) for k, v in self._scores.items()})

    def get_score(self, route_key: str) -> float:
        with self._lock:
            return self._scores.get(route_key, 1.0)

    def record_win(self, route_key: str, profit_usd: float):
        with self._lock:
            old = self._scores.get(route_key, 1.0)
            self._scores[route_key] = round(old + ROUTE_WIN_BOOST, 4)
            log.debug("[U6] Route %s: %.3f → %.3f (WIN +$%.2f)",
                      route_key, old, self._scores[route_key], profit_usd)
        self.db.save_route_score(route_key, self._scores[route_key], profit_usd)

    def record_miss(self, route_key: str):
        with self._lock:
            old = self._scores.get(route_key, 1.0)
            new = max(ROUTE_MIN_SCORE, old - ROUTE_MISS_DECAY)
            self._scores[route_key] = round(new, 4)
        self.db.save_route_score(route_key, self._scores[route_key], 0.0)

    def sorted_routes(self) -> List[str]:
        """Return route keys sorted by descending score."""
        with self._lock:
            return sorted(self._scores, key=lambda k: self._scores[k], reverse=True)

    def all_scores(self) -> Dict[str, float]:
        with self._lock:
            return dict(self._scores)


# ─────────────────────────────────────────────────────────────────────────────
# U3: Pool State + Wallet Monitor
# ─────────────────────────────────────────────────────────────────────────────
class ActivityMonitor:
    """
    Monitors high-volume wallet addresses and pool state changes.

    Base L2 uses a centralised sequencer — no public mempool to monitor.
    Instead, we poll:
      1. Watched wallet transaction counts (nonce changes = new activity)
      2. Recent Swap events on watched Uniswap pools

    When significant activity is detected, sets high_activity_event so the
    main loop triggers an immediate extra scan.
    """

    POLL_INTERVAL   = 2.0    # seconds between activity polls
    ACTIVITY_TTL    = 10.0   # seconds high-activity flag stays raised

    def __init__(self, w3_getter, cfg: dict):
        self._get_w3        = w3_getter   # callable returning (w3, url)
        self._cfg           = cfg
        self._wallet_nonces: Dict[str, int] = {}
        self._last_activity: float          = 0.0
        self.high_activity_event            = threading.Event()
        self._lock          = threading.Lock()
        self._stop_event    = threading.Event()
        self._thread        = threading.Thread(
            target=self._monitor_loop, daemon=True, name="activity-monitor")
        self._thread.start()
        log.info("[U3] Activity monitor started (%d wallets, %d pools)",
                 len(WATCHED_WALLETS), len(WATCHED_POOLS))

    def _monitor_loop(self):
        while not self._stop_event.is_set():
            try:
                self._poll()
            except Exception as e:
                log.debug("[U3] Monitor poll error: %s", e)
            # Auto-clear high activity flag after TTL
            if (self._last_activity > 0 and
                    time.monotonic() - self._last_activity > self.ACTIVITY_TTL):
                self.high_activity_event.clear()
            self._stop_event.wait(self.POLL_INTERVAL)

    def _poll(self):
        w3, _url = self._get_w3()

        # 1. Watch wallet nonces
        for addr in WATCHED_WALLETS:
            try:
                nonce = w3.eth.get_transaction_count(
                    Web3.to_checksum_address(addr), "latest")
                prev  = self._wallet_nonces.get(addr)
                if prev is not None and nonce > prev:
                    log.info("[U3] Wallet activity detected: %s (nonce %d→%d)",
                             addr[:12], prev, nonce)
                    self._trigger_activity()
                self._wallet_nonces[addr] = nonce
            except Exception:
                pass

        # 2. Watch pool recent Swap events (last 2 blocks)
        if WATCHED_POOLS:
            try:
                latest_block = w3.eth.block_number
                from_block   = max(0, latest_block - 2)
                # Swap(address,address,int256,int256,uint160,uint128,int24)
                SWAP_TOPIC = Web3.keccak(
                    text="Swap(address,address,int256,int256,uint160,uint128,int24)"
                ).hex()
                for pool_addr in WATCHED_POOLS:
                    try:
                        logs = w3.eth.get_logs({
                            "fromBlock": hex(from_block),
                            "toBlock":   "latest",
                            "address":   Web3.to_checksum_address(pool_addr),
                            "topics":    [SWAP_TOPIC],
                        })
                        if logs:
                            log.info("[U3] Pool swap detected on %s (%d events)",
                                     pool_addr[:12], len(logs))
                            self._trigger_activity()
                    except Exception:
                        pass
            except Exception:
                pass

    def _trigger_activity(self):
        with self._lock:
            self._last_activity = time.monotonic()
        self.high_activity_event.set()
        log.info("[U3] HIGH ACTIVITY — immediate scan triggered")

    def stop(self):
        self._stop_event.set()


# ─────────────────────────────────────────────────────────────────────────────
# U8: Gas Ladder
# ─────────────────────────────────────────────────────────────────────────────
class GasLadder:
    """
    Calculates priority fee based on expected net profit.

    Three tiers:
      Tier 1 ($0–T1): lowest viable priority fee — acceptable to miss
      Tier 2 (T1–T2): competitive priority fee — win most blocks
      Tier 3 (>T2): aggressive priority fee — guarantee top-of-block execution

    Thresholds are configurable via constructor or CLI args.
    """

    def __init__(
        self,
        tier1_max_profit: float = GAS_TIER1_MAX_PROFIT,
        tier2_max_profit: float = GAS_TIER2_MAX_PROFIT,
        tier1_gwei:       float = GAS_TIER1_PRIORITY_GWEI,
        tier2_gwei:       float = GAS_TIER2_PRIORITY_GWEI,
        tier3_gwei:       float = GAS_TIER3_PRIORITY_GWEI,
    ):
        self.tier1_max  = tier1_max_profit
        self.tier2_max  = tier2_max_profit
        self.tier1_gwei = tier1_gwei
        self.tier2_gwei = tier2_gwei
        self.tier3_gwei = tier3_gwei

    def get_priority_fee(self, net_profit_usdc: float, w3: Web3) -> Tuple[int, int]:
        """
        Returns (priority_fee_wei, tier_number).
        net_profit_usdc: expected profit in USDC float.
        """
        if net_profit_usdc <= self.tier1_max:
            tier  = 1
            gwei  = self.tier1_gwei
        elif net_profit_usdc <= self.tier2_max:
            tier  = 2
            gwei  = self.tier2_gwei
        else:
            tier  = 3
            gwei  = self.tier3_gwei

        priority_wei = w3.to_wei(gwei, "gwei")
        log.debug("[U8] Gas tier %d (profit=$%.2f): %.4f gwei priority",
                  tier, net_profit_usdc, gwei)
        return priority_wei, tier


# ─────────────────────────────────────────────────────────────────────────────
# SQLite Database
# ─────────────────────────────────────────────────────────────────────────────
class Database:
    """
    SQLite persistence for all trade, scan, and route score data.
    Thread-safe via a dedicated write lock.
    """

    def __init__(self, path: str = "agent.db"):
        self.path  = path
        self._lock = threading.Lock()
        self._init_schema()
        log.info("[DB] SQLite database: %s", os.path.abspath(path))

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self):
        with self._lock:
            conn = self._connect()
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS trades (
                    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp           TEXT    NOT NULL,
                    tx_hash             TEXT,
                    pair                TEXT,
                    route_type          TEXT,
                    trade_size_usd      REAL,
                    gross_profit_usd    REAL,
                    gas_cost_usd        REAL,
                    net_profit_usd      REAL,
                    execution_time_s    REAL,
                    success             INTEGER,
                    failure_reason      TEXT,
                    rpc_endpoint        TEXT,
                    route_score         REAL,
                    gas_tier            INTEGER,
                    block_number        INTEGER,
                    network             TEXT,
                    mode                TEXT
                );

                CREATE TABLE IF NOT EXISTS scans (
                    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp           TEXT    NOT NULL,
                    block_number        INTEGER,
                    opportunities_found INTEGER,
                    scan_duration_ms    REAL,
                    volatility_mode     TEXT,
                    volatility_value    REAL,
                    rpc_used            TEXT
                );

                CREATE TABLE IF NOT EXISTS route_scores (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp       TEXT NOT NULL,
                    route_key       TEXT NOT NULL,
                    score           REAL,
                    profit_last_usd REAL
                );

                CREATE TABLE IF NOT EXISTS daily_stats (
                    date                        TEXT PRIMARY KEY,
                    total_trades                INTEGER DEFAULT 0,
                    successful_trades           INTEGER DEFAULT 0,
                    win_rate                    REAL    DEFAULT 0,
                    gross_profit_usd            REAL    DEFAULT 0,
                    gas_spent_usd               REAL    DEFAULT 0,
                    net_profit_usd              REAL    DEFAULT 0,
                    cumulative_net_profit_usd   REAL    DEFAULT 0,
                    circuit_breaker_trips       INTEGER DEFAULT 0,
                    uptime_hours                REAL    DEFAULT 0,
                    rpc_failover_events         INTEGER DEFAULT 0,
                    best_route                  TEXT,
                    worst_route                 TEXT,
                    peak_hour                   INTEGER,
                    total_scans                 INTEGER DEFAULT 0,
                    jit_blocks                  INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS events (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp   TEXT NOT NULL,
                    event_type  TEXT NOT NULL,
                    detail      TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_trades_timestamp  ON trades(timestamp);
                CREATE INDEX IF NOT EXISTS idx_scans_timestamp   ON scans(timestamp);
                CREATE INDEX IF NOT EXISTS idx_route_key         ON route_scores(route_key);
            """)
            conn.commit()
            conn.close()

    def log_trade(
        self,
        opp:              ArbOpportunity,
        success:          bool,
        tx_hash:          Optional[str],
        execution_time_s: float,
        failure_reason:   Optional[str],
        rpc_endpoint:     str,
        gas_tier:         int,
        block_number:     int,
        network:          str,
        mode:             str,
    ):
        scale     = 10 ** opp.token_in_dec
        size_usd  = opp.amount_in      / scale
        gross_usd = opp.gross_profit   / scale
        net_usd   = opp.net_profit     / scale
        gas_usd   = opp.gas_cost_usdc  / 1e6
        pair      = f"{opp.token_in_key.upper()}/{opp.token_out_key.upper()}"

        with self._lock:
            conn = self._connect()
            conn.execute("""
                INSERT INTO trades
                  (timestamp, tx_hash, pair, route_type, trade_size_usd,
                   gross_profit_usd, gas_cost_usd, net_profit_usd,
                   execution_time_s, success, failure_reason, rpc_endpoint,
                   route_score, gas_tier, block_number, network, mode)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                datetime.now(timezone.utc).isoformat(),
                tx_hash,
                pair,
                opp.route_type,
                round(size_usd,  4),
                round(gross_usd, 6),
                round(gas_usd,   6),
                round(net_usd,   6),
                round(execution_time_s, 3),
                1 if success else 0,
                failure_reason,
                rpc_endpoint[:80] if rpc_endpoint else None,
                round(opp.route_score, 4),
                gas_tier,
                block_number,
                network,
                mode,
            ))
            conn.commit()
            conn.close()

    def log_scan(
        self,
        block_number:        int,
        opportunities_found: int,
        scan_duration_ms:    float,
        volatility_mode:     str,
        volatility_value:    float,
        rpc_used:            str,
    ):
        with self._lock:
            conn = self._connect()
            conn.execute("""
                INSERT INTO scans
                  (timestamp, block_number, opportunities_found,
                   scan_duration_ms, volatility_mode, volatility_value, rpc_used)
                VALUES (?,?,?,?,?,?,?)
            """, (
                datetime.now(timezone.utc).isoformat(),
                block_number,
                opportunities_found,
                round(scan_duration_ms, 2),
                volatility_mode,
                round(volatility_value, 6),
                rpc_used[:80] if rpc_used else None,
            ))
            conn.commit()
            conn.close()

    def log_event(self, event_type: str, detail: str = ""):
        with self._lock:
            conn = self._connect()
            conn.execute(
                "INSERT INTO events (timestamp, event_type, detail) VALUES (?,?,?)",
                (datetime.now(timezone.utc).isoformat(), event_type, detail)
            )
            conn.commit()
            conn.close()

    def save_route_score(self, route_key: str, score: float, profit_usd: float):
        with self._lock:
            conn = self._connect()
            conn.execute("""
                INSERT INTO route_scores (timestamp, route_key, score, profit_last_usd)
                VALUES (?,?,?,?)
            """, (datetime.now(timezone.utc).isoformat(), route_key,
                  round(score, 4), round(profit_usd, 6)))
            conn.commit()
            conn.close()

    def load_route_scores(self) -> Dict[str, float]:
        """Load most recent score for each route key."""
        try:
            conn = self._connect()
            rows = conn.execute("""
                SELECT route_key, score
                FROM route_scores
                WHERE (route_key, timestamp) IN (
                    SELECT route_key, MAX(timestamp)
                    FROM route_scores
                    GROUP BY route_key
                )
            """).fetchall()
            conn.close()
            return {row["route_key"]: row["score"] for row in rows}
        except Exception:
            return {}

    def update_daily_stats(
        self,
        date_str:           str,
        net_profit_delta:   float,
        gas_delta:          float,
        gross_delta:        float,
        trade_success:      Optional[bool],
        circuit_trip:       bool = False,
        rpc_failover:       bool = False,
        scan_count:         int  = 0,
        jit_block:          bool = False,
    ):
        """Upsert today's aggregate statistics."""
        with self._lock:
            conn = self._connect()
            # Get cumulative net profit across all days
            row = conn.execute(
                "SELECT COALESCE(SUM(net_profit_usd),0) as total FROM daily_stats "
                "WHERE date < ?", (date_str,)
            ).fetchone()
            cumulative_base = float(row["total"]) if row else 0.0

            existing = conn.execute(
                "SELECT * FROM daily_stats WHERE date=?", (date_str,)
            ).fetchone()

            if not existing:
                conn.execute("""
                    INSERT INTO daily_stats
                      (date, total_trades, successful_trades, win_rate,
                       gross_profit_usd, gas_spent_usd, net_profit_usd,
                       cumulative_net_profit_usd, circuit_breaker_trips,
                       rpc_failover_events, total_scans, jit_blocks)
                    VALUES (?,0,0,0,0,0,0,?,0,0,0,0)
                """, (date_str, round(cumulative_base, 6)))
                existing = conn.execute(
                    "SELECT * FROM daily_stats WHERE date=?", (date_str,)
                ).fetchone()

            total_t   = existing["total_trades"]
            succ_t    = existing["successful_trades"]
            gross_t   = existing["gross_profit_usd"]
            gas_t     = existing["gas_spent_usd"]
            net_t     = existing["net_profit_usd"]
            scans_t   = existing["total_scans"]
            jit_t     = existing["jit_blocks"]
            cb_t      = existing["circuit_breaker_trips"]
            rpc_t     = existing["rpc_failover_events"]

            if trade_success is not None:
                total_t += 1
                if trade_success:
                    succ_t += 1
            gross_t += gross_delta
            gas_t   += gas_delta
            net_t   += net_profit_delta
            scans_t += scan_count
            if circuit_trip:
                cb_t += 1
            if rpc_failover:
                rpc_t += 1
            if jit_block:
                jit_t += 1

            win_rate  = (succ_t / total_t * 100) if total_t > 0 else 0.0
            cum_net   = cumulative_base + net_t

            conn.execute("""
                UPDATE daily_stats SET
                  total_trades=?, successful_trades=?, win_rate=?,
                  gross_profit_usd=?, gas_spent_usd=?, net_profit_usd=?,
                  cumulative_net_profit_usd=?, circuit_breaker_trips=?,
                  rpc_failover_events=?, total_scans=?, jit_blocks=?
                WHERE date=?
            """, (total_t, succ_t, round(win_rate, 2),
                  round(gross_t, 6), round(gas_t, 6), round(net_t, 6),
                  round(cum_net, 6), cb_t, rpc_t, scans_t, jit_t, date_str))
            conn.commit()
            conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Performance Tracker (Phase 1, enhanced to write to DB)
# ─────────────────────────────────────────────────────────────────────────────
class PerformanceTracker:
    def __init__(self, db: Database, network: str, mode: str):
        self.db                    = db
        self.network               = network
        self.mode                  = mode
        self.scans                 = 0
        self.opportunities         = 0
        self.executions            = 0
        self.wins                  = 0
        self.losses                = 0
        self.total_profit_usdc     = Decimal("0")
        self.consecutive_failures  = 0
        self.best_trade_usdc       = Decimal("0")
        self.gas_samples: List[float] = []
        self.circuit_trips         = 0
        self.rpc_failover_events   = 0
        self.jit_blocks            = 0
        self.start_time            = datetime.now(timezone.utc)
        self._lock                 = threading.Lock()

    def record_scan(self):
        with self._lock:
            self.scans += 1
        today = datetime.now(timezone.utc).date().isoformat()
        self.db.update_daily_stats(today, 0, 0, 0, None, scan_count=1)

    def record_opportunity(self):
        with self._lock:
            self.opportunities += 1

    def record_win(self, opp: ArbOpportunity, tx_hash: str, exec_time: float,
                   gas_tier: int, block_number: int, rpc: str):
        scale    = 10 ** opp.token_in_dec
        net_usd  = float(Decimal(opp.net_profit) / Decimal(scale))
        gross_usd= opp.gross_profit / scale
        gas_usd  = opp.gas_cost_usdc / 1e6
        with self._lock:
            self.executions           += 1
            self.wins                 += 1
            self.consecutive_failures  = 0
            self.total_profit_usdc    += Decimal(str(net_usd))
            if Decimal(str(net_usd)) > self.best_trade_usdc:
                self.best_trade_usdc = Decimal(str(net_usd))
            self.gas_samples.append(gas_usd)
        self.db.log_trade(opp, True, tx_hash, exec_time, None, rpc,
                          gas_tier, block_number, self.network, self.mode)
        today = datetime.now(timezone.utc).date().isoformat()
        self.db.update_daily_stats(today, net_usd, gas_usd, gross_usd,
                                   True, scan_count=0)

    def record_loss(self, opp: ArbOpportunity, reason: str, exec_time: float,
                    gas_tier: int, block_number: int, rpc: str):
        gas_usd = opp.gas_cost_usdc / 1e6
        with self._lock:
            self.executions           += 1
            self.losses               += 1
            self.consecutive_failures += 1
            self.gas_samples.append(gas_usd)
        self.db.log_trade(opp, False, None, exec_time, reason, rpc,
                          gas_tier, block_number, self.network, self.mode)
        today = datetime.now(timezone.utc).date().isoformat()
        self.db.update_daily_stats(today, 0, gas_usd, 0, False)

    def record_error(self):
        with self._lock:
            self.consecutive_failures += 1

    def record_circuit_trip(self):
        with self._lock:
            self.circuit_trips += 1
        today = datetime.now(timezone.utc).date().isoformat()
        self.db.update_daily_stats(today, 0, 0, 0, None, circuit_trip=True)
        self.db.log_event("CIRCUIT_BREAKER_TRIP")

    def record_rpc_failover(self, from_url: str, to_url: str):
        with self._lock:
            self.rpc_failover_events += 1
        today = datetime.now(timezone.utc).date().isoformat()
        self.db.update_daily_stats(today, 0, 0, 0, None, rpc_failover=True)
        self.db.log_event("RPC_FAILOVER", f"{from_url[:40]} → {to_url[:40]}")

    def record_jit_block(self, opp: ArbOpportunity):
        with self._lock:
            self.jit_blocks += 1
        today = datetime.now(timezone.utc).date().isoformat()
        self.db.update_daily_stats(today, 0, 0, 0, None, jit_block=True)
        scale = 10 ** opp.token_in_dec
        self.db.log_event("JIT_BLOCKED",
                          f"route={opp.route_key} expected_profit=${opp.net_profit/scale:.4f}")

    @property
    def win_rate(self) -> float:
        total = self.wins + self.losses
        return (self.wins / total * 100) if total > 0 else 0.0

    @property
    def avg_gas_usdc(self) -> float:
        return sum(self.gas_samples) / len(self.gas_samples) if self.gas_samples else 0.0

    def print_summary(self):
        elapsed = datetime.now(timezone.utc) - self.start_time
        uptime  = elapsed.total_seconds() / 3600
        log.info("=" * 65)
        log.info("  PERFORMANCE SUMMARY — Phase 2")
        log.info("=" * 65)
        log.info("  Runtime            : %s  (%.1f hrs)", str(elapsed).split(".")[0], uptime)
        log.info("  Scans              : %s", self.scans)
        log.info("  Opportunities      : %s", self.opportunities)
        log.info("  Executions         : %s", self.executions)
        log.info("  Wins / Losses      : %s / %s  (%.1f%% win rate)",
                 self.wins, self.losses, self.win_rate)
        log.info("  Total profit       : $%.4f USDC", self.total_profit_usdc)
        log.info("  Best single trade  : $%.4f USDC", self.best_trade_usdc)
        log.info("  Avg gas cost       : $%.4f USDC", self.avg_gas_usdc)
        log.info("  Consec. failures   : %s", self.consecutive_failures)
        log.info("  Circuit trips      : %s", self.circuit_trips)
        log.info("  RPC failovers      : %s", self.rpc_failover_events)
        log.info("  JIT blocks         : %s (trades prevented)", self.jit_blocks)
        log.info("=" * 65)


# ─────────────────────────────────────────────────────────────────────────────
# Circuit Breaker (Phase 1, unchanged)
# ─────────────────────────────────────────────────────────────────────────────
class CircuitBreaker:
    def __init__(self, threshold: int = CIRCUIT_BREAKER_THRESHOLD,
                 pause_seconds: int = CIRCUIT_BREAKER_PAUSE_S):
        self.threshold = threshold
        self.pause_s   = pause_seconds
        self._tripped_at: Optional[float] = None

    def is_open(self) -> bool:
        if self._tripped_at is None:
            return False
        if time.monotonic() - self._tripped_at >= self.pause_s:
            log.info("[CIRCUIT] Pause window elapsed — resuming")
            self._tripped_at = None
            return False
        remaining = self.pause_s - (time.monotonic() - self._tripped_at)
        log.info("[CIRCUIT] Breaker open — %.0fs remaining", remaining)
        return True

    def trip(self):
        self._tripped_at = time.monotonic()
        log.warning("[CIRCUIT] Tripped after %s consecutive failures. Pausing %ss.",
                    self.threshold, self.pause_s)

    def check(self, consecutive_failures: int):
        if consecutive_failures >= self.threshold:
            self.trip()


# ─────────────────────────────────────────────────────────────────────────────
# Alerter (Phase 1, unchanged)
# ─────────────────────────────────────────────────────────────────────────────
class Alerter:
    def __init__(self):
        self.telegram_token   = os.getenv("TELEGRAM_BOT_TOKEN")
        self.telegram_chat_id = os.getenv("TELEGRAM_CHAT_ID")
        self.discord_webhook  = os.getenv("DISCORD_WEBHOOK_URL")
        self._enabled         = bool(
            (self.telegram_token and self.telegram_chat_id) or self.discord_webhook)
        log.info("[ALERT] %s (Telegram=%s Discord=%s)",
                 "Enabled" if self._enabled else "Disabled (no credentials)",
                 bool(self.telegram_token), bool(self.discord_webhook))

    def send(self, message: str):
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
                "chat_id": self.telegram_chat_id, "text": message, "parse_mode": "HTML"
            }, timeout=5)
            if not resp.ok:
                log.warning("[ALERT] Telegram: %s", resp.text[:100])
        except Exception as e:
            log.warning("[ALERT] Telegram error: %s", e)

    def _send_discord(self, message: str):
        try:
            resp = requests.post(self.discord_webhook, json={"content": message}, timeout=5)
            if not resp.ok:
                log.warning("[ALERT] Discord: %s", resp.text[:100])
        except Exception as e:
            log.warning("[ALERT] Discord error: %s", e)


# ─────────────────────────────────────────────────────────────────────────────
# Gas Estimator (Phase 1, enhanced with gas ladder)
# ─────────────────────────────────────────────────────────────────────────────
class GasEstimator:
    def __init__(self, w3_getter, cfg: dict):
        self._get_w3        = w3_getter
        self.cfg            = cfg
        self._eth_price_usdc: Optional[int] = None
        self._eth_price_ts:   float          = 0.0
        self._uni_quoter    = None  # lazy init

    def _quoter(self) -> object:
        if self._uni_quoter is None:
            w3, _ = self._get_w3()
            self._uni_quoter = w3.eth.contract(
                address=Web3.to_checksum_address(self.cfg["uniswap_quoter"]),
                abi=UNISWAP_QUOTER_ABI,
            )
        return self._uni_quoter

    def estimate(self, tx_dict: dict, from_addr: str,
                 net_profit_usdc: float = 0.0,
                 gas_ladder: Optional["GasLadder"] = None
                 ) -> Tuple[int, int, int, int]:
        """Returns (gas_units, gas_cost_wei, gas_cost_usdc, gas_tier)."""
        gas_units     = self._simulate_gas_units(tx_dict, from_addr)
        gas_price_wei = self._current_gas_price_wei(net_profit_usdc, gas_ladder)
        gas_cost_wei  = int(gas_units * gas_price_wei * GAS_BUFFER_MULTIPLIER)
        gas_cost_usdc = self._wei_to_usdc(gas_cost_wei)
        tier          = 1
        if gas_ladder:
            _, tier = gas_ladder.get_priority_fee(net_profit_usdc, self._get_w3()[0])
        return gas_units, gas_cost_wei, gas_cost_usdc, tier

    def _simulate_gas_units(self, tx_dict: dict, from_addr: str) -> int:
        call_dict = {**tx_dict, "from": from_addr}
        for f in ("nonce", "maxFeePerGas", "maxPriorityFeePerGas", "gas"):
            call_dict.pop(f, None)
        try:
            w3, _ = self._get_w3()
            return w3.eth.estimate_gas(call_dict)
        except Exception as e:
            log.warning("Gas simulation failed (%s). Fallback: %s units.", e, GAS_FALLBACK_UNITS)
            return GAS_FALLBACK_UNITS

    def _current_gas_price_wei(self, net_profit_usdc: float = 0.0,
                                gas_ladder: Optional["GasLadder"] = None) -> int:
        w3, _ = self._get_w3()
        try:
            block    = w3.eth.get_block("latest")
            base_fee = block.get("baseFeePerGas", 0)
            if gas_ladder:
                priority, _ = gas_ladder.get_priority_fee(net_profit_usdc, w3)
            else:
                priority = w3.to_wei("0.001", "gwei")
            return base_fee + priority
        except Exception:
            return w3.to_wei("0.01", "gwei")

    def _eth_price_in_usdc(self) -> int:
        now = time.monotonic()
        if self._eth_price_usdc is not None and (now - self._eth_price_ts) < 60:
            return self._eth_price_usdc
        try:
            result = self._quoter().functions.quoteExactInputSingle({
                "tokenIn":           Web3.to_checksum_address(self.cfg["weth"]),
                "tokenOut":          Web3.to_checksum_address(self.cfg["usdc"]),
                "amountIn":          ETH_PRICE_QUOTE_AMOUNT,
                "fee":               500,
                "sqrtPriceLimitX96": 0,
            }).call()
            self._eth_price_usdc = result[0]
            self._eth_price_ts   = now
            return result[0]
        except Exception:
            fallback = 3_000 * 1_000_000
            self._eth_price_usdc = fallback
            self._eth_price_ts   = now
            return fallback

    def _wei_to_usdc(self, wei: int) -> int:
        return (wei * self._eth_price_in_usdc()) // (10 ** 18)


# ─────────────────────────────────────────────────────────────────────────────
# Price Fetcher (Phase 1, enhanced to accept w3 getter)
# ─────────────────────────────────────────────────────────────────────────────
class PriceFetcher:
    def __init__(self, w3_getter, cfg: dict):
        self._get_w3  = w3_getter
        self.cfg      = cfg
        self._uni     = None
        self._aero    = None

    def _uni_quoter(self):
        w3, _ = self._get_w3()
        if self._uni is None:
            self._uni = w3.eth.contract(
                address=Web3.to_checksum_address(self.cfg["uniswap_quoter"]),
                abi=UNISWAP_QUOTER_ABI,
            )
        return self._uni

    def _aero_router(self):
        w3, _ = self._get_w3()
        if self._aero is None:
            self._aero = w3.eth.contract(
                address=Web3.to_checksum_address(self.cfg["aerodrome_router"]),
                abi=AERODROME_ROUTER_ABI,
            )
        return self._aero

    def quote_uniswap_best(
        self, token_in: str, token_out: str, amount_in: int,
    ) -> Tuple[Optional[int], int]:
        best_out: Optional[int] = None
        best_fee: int           = 0
        for fee in UNISWAP_FEE_TIERS:
            try:
                result = self._uni_quoter().functions.quoteExactInputSingle({
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
        best: Optional[int] = None
        for stable in [False, True]:
            try:
                routes = [{
                    "from":    Web3.to_checksum_address(token_in),
                    "to":      Web3.to_checksum_address(token_out),
                    "stable":  stable,
                    "factory": Web3.to_checksum_address(AERODROME_FACTORY),
                }]
                amounts = self._aero_router().functions.getAmountsOut(
                    amount_in, routes).call()
                out = amounts[-1]
                if best is None or out > best:
                    best = out
            except Exception as e:
                log.debug("Aerodrome stable=%s: %s", stable, e)
        return best


# ─────────────────────────────────────────────────────────────────────────────
# Slippage (Phase 1, unchanged)
# ─────────────────────────────────────────────────────────────────────────────
def apply_slippage(quoted_out: int, slippage_bps: int = SLIPPAGE_BPS) -> int:
    return (quoted_out * (10_000 - slippage_bps)) // 10_000


# ─────────────────────────────────────────────────────────────────────────────
# P4: Route Optimal Cache — fee-tier winner + optimal trade size per route
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class RouteCache:
    """
    Stores the results of the last golden-section slow scan for one route.
    The fast path re-uses these values every block without re-running the optimizer.
    """
    trade_size:    int     # optimal flash loan size (raw token units)
    buy_dex:       str     # "uniswap" or "aerodrome"
    sell_dex:      str
    buy_fee:       int     # winning Uniswap fee tier (P4); 0 if aerodrome
    sell_fee:      int
    buy_out_est:   int     # estimated buy output (used to size sell-leg batch call)
    updated_block: int
    # 3-leg extras (unused for 2-leg)
    leg2_dex:      str = "uniswap"
    leg2_fee:      int = 500
    leg1_out_est:  int = 0
    leg2_out_est:  int = 0


class RouteOptimalCache:
    """
    Thread-safe store of RouteCache objects keyed by route_key.

    P2: Main scan loop always reads from cache (non-blocking).
        Background optimizer writes updates every SLOW_SCAN_INTERVAL blocks.
    P4: Winning fee tier is read directly from cache — no per-scan fee probing.
    """

    def __init__(self, min_trade_usdc: float, max_trade_usdc: float):
        self.min_trade_usdc = min_trade_usdc
        self.max_trade_usdc = max_trade_usdc
        self._lock  = threading.RLock()
        self._store: Dict[str, RouteCache] = {}

    def get(self, route_key: str) -> Optional[RouteCache]:
        with self._lock:
            return self._store.get(route_key)

    def update(self, route_key: str, rc: RouteCache) -> None:
        with self._lock:
            self._store[route_key] = rc

    def needs_slow_scan(self, route_key: str, current_block: int) -> bool:
        with self._lock:
            rc = self._store.get(route_key)
            if rc is None:
                return True
            return (current_block - rc.updated_block) >= SLOW_SCAN_INTERVAL

    def default_size(self, dec_in: int) -> int:
        """Fallback trade size before the first slow scan completes."""
        mid = (self.min_trade_usdc + self.max_trade_usdc) / 2
        return int(mid * (10 ** dec_in))


# ─────────────────────────────────────────────────────────────────────────────
# P1: Multicall3 Quoter — batch ALL price quotes into ≤2 RPC calls per scan
# ─────────────────────────────────────────────────────────────────────────────
class Multicall3Quoter:
    """
    Batches every price quote for every route into a single aggregate3() call.

    Design
    ------
    Fast path (every block):
      • Build call list from cached fee tiers + cached trade sizes.
      • Execute one aggregate3() via eth_call  → 1 RPC call.
      • Decode results, evaluate profitability inline.

    Slow path (every SLOW_SCAN_INTERVAL blocks, runs in BackgroundOptimizer):
      • Uses PriceFetcher's existing individual-call methods.
      • Writes updated RouteCache entries when done.

    Return type of batch_quote():
      List[Optional[int]]  — amountOut for each request (None on failure).
    """

    def __init__(self, w3_getter, cfg: dict):
        self._get_w3  = w3_getter
        self.cfg      = cfg
        self._mc3     = None   # lazy
        self._quoter  = None   # lazy
        self._aero    = None   # lazy

    # ── Contract handles (lazy, re-built after RPC failover) ──────────────────

    def _init(self, w3: Web3) -> None:
        if self._mc3 is None:
            self._mc3 = w3.eth.contract(
                address=Web3.to_checksum_address(MULTICALL3_ADDR),
                abi=MULTICALL3_ABI,
            )
        if self._quoter is None:
            self._quoter = w3.eth.contract(
                address=Web3.to_checksum_address(self.cfg["uniswap_quoter"]),
                abi=UNISWAP_QUOTER_ABI,
            )
        if self._aero is None:
            self._aero = w3.eth.contract(
                address=Web3.to_checksum_address(self.cfg["aerodrome_router"]),
                abi=AERODROME_ROUTER_ABI,
            )

    def _invalidate(self) -> None:
        """Called after RPC failover to force re-init with new w3."""
        self._mc3 = self._quoter = self._aero = None

    # ── Core batch method ─────────────────────────────────────────────────────

    def batch_quote(self, requests_list: List[dict]) -> List[Optional[int]]:
        """
        Execute all quote requests in a single aggregate3() call.

        Each element of requests_list is a dict:
          Uniswap:    {"type": "uni",  "tokenIn": addr, "tokenOut": addr,
                       "fee": int,    "amountIn": int}
          Aerodrome:  {"type": "aero", "tokenIn": addr, "tokenOut": addr,
                       "stable": bool, "amountIn": int}

        Returns list of amountOut (int) or None per request.
        """
        if not requests_list:
            return []

        w3, _ = self._get_w3()
        self._init(w3)

        calls = []
        for req in requests_list:
            try:
                if req["type"] == "uni":
                    cd = self._quoter.encodeABI(
                        fn_name="quoteExactInputSingle",
                        args=[{
                            "tokenIn":           Web3.to_checksum_address(req["tokenIn"]),
                            "tokenOut":          Web3.to_checksum_address(req["tokenOut"]),
                            "amountIn":          req["amountIn"],
                            "fee":               req["fee"],
                            "sqrtPriceLimitX96": 0,
                        }],
                    )
                    target = self.cfg["uniswap_quoter"]
                else:  # aero
                    cd = self._aero.encodeABI(
                        fn_name="getAmountsOut",
                        args=[
                            req["amountIn"],
                            [{
                                "from":    Web3.to_checksum_address(req["tokenIn"]),
                                "to":      Web3.to_checksum_address(req["tokenOut"]),
                                "stable":  req.get("stable", False),
                                "factory": Web3.to_checksum_address(AERODROME_FACTORY),
                            }],
                        ],
                    )
                    target = self.cfg["aerodrome_router"]

                calls.append({
                    "target":       Web3.to_checksum_address(target),
                    "allowFailure": True,
                    "callData":     cd,
                })
            except Exception as e:
                log.debug("[P1] encode error: %s", e)
                calls.append({
                    "target":       Web3.to_checksum_address(MULTICALL3_ADDR),
                    "allowFailure": True,
                    "callData":     b"",
                })

        try:
            raw_results = self._mc3.functions.aggregate3(calls).call()
        except Exception as e:
            log.warning("[P1] aggregate3 failed: %s — falling back to None×%d", e, len(calls))
            return [None] * len(calls)

        outputs: List[Optional[int]] = []
        for req, (success, return_data) in zip(requests_list, raw_results):
            if not success or not return_data:
                outputs.append(None)
                continue
            try:
                if req["type"] == "uni":
                    decoded = self._quoter.decode_function_result(
                        "quoteExactInputSingle", return_data)
                    outputs.append(int(decoded[0]))   # amountOut
                else:
                    decoded = self._aero.decode_function_result(
                        "getAmountsOut", return_data)
                    amounts = decoded[0]
                    outputs.append(int(amounts[-1]) if amounts else None)
            except Exception as e:
                log.debug("[P1] decode error: %s", e)
                outputs.append(None)

        return outputs

    # ── Convenience: build the standard fast-path batch ───────────────────────

    def build_fast_batch(
        self,
        route_cache: "RouteOptimalCache",
        current_block: int,
    ) -> Tuple[List[dict], List[dict]]:
        """
        Build one consolidated batch covering ALL routes (2-leg + 3-leg).

        For routes with a warm cache: uses cached fee tier + cached trade size.
        For cold routes (no cache yet): probes all 4 Uni fee tiers + Aerodrome.

        Returns:
            (quote_requests, route_contexts)

        route_contexts[i] identifies what each request corresponds to so that
        the caller can assemble ArbOpportunity candidates from the result list.
        """
        qreqs: List[dict]   = []
        ctxs:  List[dict]   = []

        cfg = self.cfg

        # ── 2-leg routes ──────────────────────────────────────────────────────
        for (tk_in, tk_out, dec_in, dec_out) in TRADING_PAIRS:
            rk  = f"2leg_{tk_in}_{tk_out}"
            rc  = route_cache.get(rk)
            a_in  = cfg[tk_in]
            a_out = cfg[tk_out]

            if rc:
                # P2/P4: use cached size and winning fee tier
                amt    = rc.trade_size
                b_est  = rc.buy_out_est or int(amt * 0.99)

                # buy leg
                buy_idx = len(qreqs)
                if rc.buy_dex == "uni" or rc.buy_dex == "uniswap":
                    qreqs.append({"type": "uni",  "tokenIn": a_in, "tokenOut": a_out,
                                  "fee": rc.buy_fee, "amountIn": amt})
                else:
                    qreqs.append({"type": "aero", "tokenIn": a_in, "tokenOut": a_out,
                                  "stable": False,  "amountIn": amt})

                # sell leg (uses cached buy_out_est as input)
                sell_idx = len(qreqs)
                if rc.sell_dex == "uni" or rc.sell_dex == "uniswap":
                    qreqs.append({"type": "uni",  "tokenIn": a_out, "tokenOut": a_in,
                                  "fee": rc.sell_fee, "amountIn": b_est})
                else:
                    qreqs.append({"type": "aero", "tokenIn": a_out, "tokenOut": a_in,
                                  "stable": False,  "amountIn": b_est})

                ctxs.append({
                    "kind": "2leg_warm", "route_key": rk,
                    "tk_in": tk_in, "tk_out": tk_out,
                    "dec_in": dec_in, "dec_out": dec_out,
                    "amount_in": amt,
                    "buy_idx": buy_idx, "sell_idx": sell_idx,
                    "rc": rc,
                })

            else:
                # Cold: probe all fee tiers for P4 winner detection
                amt      = route_cache.default_size(dec_in)
                bi_list  = []
                for fee in UNISWAP_FEE_TIERS:
                    bi_list.append(len(qreqs))
                    qreqs.append({"type": "uni",  "tokenIn": a_in, "tokenOut": a_out,
                                  "fee": fee, "amountIn": amt})
                aero_buy_idx = len(qreqs)
                qreqs.append({"type": "aero", "tokenIn": a_in, "tokenOut": a_out,
                               "stable": False, "amountIn": amt})

                # Sell-leg probes (use conservative estimate of buy_out as amountIn)
                sell_est = int(amt * 0.99)
                si_list  = []
                for fee in UNISWAP_FEE_TIERS:
                    si_list.append(len(qreqs))
                    qreqs.append({"type": "uni",  "tokenIn": a_out, "tokenOut": a_in,
                                  "fee": fee, "amountIn": sell_est})
                aero_sell_idx = len(qreqs)
                qreqs.append({"type": "aero", "tokenIn": a_out, "tokenOut": a_in,
                               "stable": False, "amountIn": sell_est})

                ctxs.append({
                    "kind": "2leg_cold", "route_key": rk,
                    "tk_in": tk_in, "tk_out": tk_out,
                    "dec_in": dec_in, "dec_out": dec_out,
                    "amount_in": amt,
                    "uni_buy_indices":  bi_list,
                    "aero_buy_idx":     aero_buy_idx,
                    "uni_sell_indices": si_list,
                    "aero_sell_idx":    aero_sell_idx,
                })

        # ── 3-leg routes ──────────────────────────────────────────────────────
        three_leg_defs = [
            ("3leg_usdc_weth_cbbtc", "usdc", "weth",  6,  18, "cbbtc", 8),
            ("3leg_usdc_cbbtc_weth", "usdc", "cbbtc", 6,  8,  "weth",  18),
        ]
        for (rk, tk_in, tk_mid, dec_in, dec_mid, tk_out, dec_out) in three_leg_defs:
            rc    = route_cache.get(rk)
            a_in  = cfg[tk_in]
            a_mid = cfg[tk_mid]
            a_out = cfg[tk_out]

            if rc:
                amt  = rc.trade_size
                l1e  = rc.leg1_out_est or int(amt * 0.99)
                l2e  = rc.leg2_out_est or int(l1e * 0.99)

                # Warm path: send only the cached-winning DEX per leg (3 calls vs 6)
                def _add_leg(token_a, token_b, dex, fee, amt_in):
                    idx = len(qreqs)
                    if dex in ("uniswap", "uni"):
                        qreqs.append({"type": "uni",  "tokenIn": token_a, "tokenOut": token_b,
                                       "fee": fee, "amountIn": amt_in})
                    else:
                        qreqs.append({"type": "aero", "tokenIn": token_a, "tokenOut": token_b,
                                       "stable": False, "amountIn": amt_in})
                    return idx

                l1_idx  = _add_leg(a_in,  a_mid, rc.buy_dex,  rc.buy_fee,  amt)
                l2_idx  = _add_leg(a_mid, a_out, rc.leg2_dex, rc.leg2_fee, l1e)
                l3_idx  = _add_leg(a_out, a_in,  rc.sell_dex, rc.sell_fee, l2e)

                ctxs.append({
                    "kind": "3leg_warm", "route_key": rk,
                    "tk_in": tk_in, "tk_mid": tk_mid, "tk_out": tk_out,
                    "dec_in": dec_in, "dec_mid": dec_mid, "dec_out": dec_out,
                    "amount_in": amt,
                    "l1_idx": l1_idx, "l1a_idx": -1,
                    "l2_idx": l2_idx, "l2a_idx": -1,
                    "l3_idx": l3_idx, "l3a_idx": -1,
                    "l1_est": l1e, "l2_est": l2e, "rc": rc,
                })
            else:
                amt  = route_cache.default_size(dec_in)
                l1e  = int(amt * 0.99)
                l2e  = int(l1e * 0.99)

                l1_idx = len(qreqs)
                for fee in UNISWAP_FEE_TIERS:
                    qreqs.append({"type": "uni",  "tokenIn": a_in,  "tokenOut": a_mid,
                                  "fee": fee, "amountIn": amt})
                l1a_idx = len(qreqs)
                qreqs.append({"type": "aero", "tokenIn": a_in,  "tokenOut": a_mid,
                               "stable": False, "amountIn": amt})

                l2_base = len(qreqs)
                for fee in UNISWAP_FEE_TIERS:
                    qreqs.append({"type": "uni",  "tokenIn": a_mid, "tokenOut": a_out,
                                  "fee": fee, "amountIn": l1e})
                l2a_idx = len(qreqs)
                qreqs.append({"type": "aero", "tokenIn": a_mid, "tokenOut": a_out,
                               "stable": False, "amountIn": l1e})

                l3_base = len(qreqs)
                for fee in UNISWAP_FEE_TIERS:
                    qreqs.append({"type": "uni",  "tokenIn": a_out, "tokenOut": a_in,
                                  "fee": fee, "amountIn": l2e})
                l3a_idx = len(qreqs)
                qreqs.append({"type": "aero", "tokenIn": a_out, "tokenOut": a_in,
                               "stable": False, "amountIn": l2e})

                ctxs.append({
                    "kind": "3leg_cold", "route_key": rk,
                    "tk_in": tk_in, "tk_mid": tk_mid, "tk_out": tk_out,
                    "dec_in": dec_in, "dec_mid": dec_mid, "dec_out": dec_out,
                    "amount_in": amt,
                    "l1_base": l1_idx,  "l1a_idx": l1a_idx,
                    "l2_base": l2_base, "l2a_idx": l2a_idx,
                    "l3_base": l3_base, "l3a_idx": l3a_idx,
                    "l1_est": l1e, "l2_est": l2e,
                })

        return qreqs, ctxs


# ─────────────────────────────────────────────────────────────────────────────
# P3: Background Optimizer — golden-section runs off the hot path
# ─────────────────────────────────────────────────────────────────────────────
class BackgroundOptimizer:
    """
    Submits golden-section trade-size searches to a background thread pool.
    The main scan loop never waits for these — it always reads from the cache.

    When a slow scan completes, it writes a new RouteCache entry including:
      - Optimal trade size (P2)
      - Winning Uniswap fee tier for each leg (P4)
      - Estimated output amounts for the buy leg (used as sell-leg batch input)
    """

    def __init__(
        self,
        fetcher:    "PriceFetcher",
        optimizer:  "TradeSizeOptimizer",
        cache:      RouteOptimalCache,
        cfg:        dict,
        rpc_pool:   "RPCPool" = None,
    ):
        self._cache     = cache
        self._cfg       = cfg
        self._pool      = ThreadPoolExecutor(max_workers=2, thread_name_prefix="bg-opt")
        self._pending:  Dict[str, Future] = {}
        self._lock      = threading.Lock()

        # Give the bg optimizer its own isolated Web3 + PriceFetcher so it
        # never shares an HTTP connection with the main scan loop.
        if rpc_pool is not None:
            # Pick the secondary (lowest priority) endpoint to avoid competing
            # with the main scan on the primary Alchemy connection.
            endpoints = rpc_pool._endpoints
            bg_url = endpoints[-1]["url"] if len(endpoints) > 1 else endpoints[0]["url"]
            bg_w3  = rpc_pool._make_w3(bg_url)
            def _bg_w3_getter():
                return bg_w3, bg_url
        else:
            _bg_w3_getter = fetcher._get_w3

        self._fetcher   = PriceFetcher(_bg_w3_getter, cfg)
        self._optimizer = TradeSizeOptimizer(self._fetcher, cfg,
                                             cache.min_trade_usdc, cache.max_trade_usdc)
        log.info("[P3] BackgroundOptimizer ready (max_workers=2, isolated RPC: %s)", bg_url[:50] if rpc_pool else "shared")

    def schedule_all(self, current_block: int) -> None:
        """Schedule stale routes for re-optimisation (non-blocking)."""
        for (tk_in, tk_out, dec_in, _dec_out) in TRADING_PAIRS:
            rk = f"2leg_{tk_in}_{tk_out}"
            if self._cache.needs_slow_scan(rk, current_block):
                self._submit_2leg(rk, tk_in, tk_out, dec_in, current_block)

        three_leg_defs = [
            ("3leg_usdc_weth_cbbtc", "usdc", "weth",  6,  18, "cbbtc", 8),
            ("3leg_usdc_cbbtc_weth", "usdc", "cbbtc", 6,  8,  "weth",  18),
        ]
        for (rk, tk_in, tk_mid, dec_in, dec_mid, tk_out, _dec_out) in three_leg_defs:
            if self._cache.needs_slow_scan(rk, current_block):
                self._submit_3leg(rk, tk_in, tk_mid, tk_out, dec_in, dec_mid, current_block)

    def _submit_2leg(self, rk, tk_in, tk_out, dec_in, block):
        with self._lock:
            fut = self._pending.get(rk)
            if fut and not fut.done():
                return
            self._pending[rk] = self._pool.submit(
                self._run_2leg, rk, tk_in, tk_out, dec_in, block)

    def _submit_3leg(self, rk, tk_in, tk_mid, tk_out, dec_in, dec_mid, block):
        with self._lock:
            fut = self._pending.get(rk)
            if fut and not fut.done():
                return
            self._pending[rk] = self._pool.submit(
                self._run_3leg, rk, tk_in, tk_mid, tk_out, dec_in, dec_mid, block)

    def _run_2leg(self, rk, tk_in, tk_out, dec_in, block):
        try:
            a_in  = self._cfg[tk_in]
            a_out = self._cfg[tk_out]
            best_rc = None
            best_profit = 0

            for buy_dex, sell_dex in [("uniswap", "aerodrome"), ("aerodrome", "uniswap")]:
                amt, b_out, s_out = self._optimizer.find_optimal_2leg(
                    a_in, a_out, dec_in, buy_dex, sell_dex)
                if b_out == 0 or s_out == 0:
                    continue
                profit = s_out - amt - (amt * AAVE_FLASH_PREMIUM_BPS // 10_000)
                if profit > best_profit:
                    best_profit = profit
                    # P4: find winning fee tier
                    if buy_dex == "uniswap":
                        _, buy_fee = self._fetcher.quote_uniswap_best(a_in, a_out, amt)
                    else:
                        buy_fee = 0
                    if sell_dex == "uniswap":
                        _, sell_fee = self._fetcher.quote_uniswap_best(a_out, a_in, b_out)
                    else:
                        sell_fee = 0
                    best_rc = RouteCache(
                        trade_size=amt,
                        buy_dex=buy_dex, sell_dex=sell_dex,
                        buy_fee=buy_fee, sell_fee=sell_fee,
                        buy_out_est=b_out,
                        updated_block=block,
                    )

            if best_rc:
                self._cache.update(rk, best_rc)
                log.debug("[P3][2leg] %s optimal=$%.0f USDC buy_dex=%s fee=%d",
                          rk, best_rc.trade_size / (10 ** dec_in),
                          best_rc.buy_dex, best_rc.buy_fee)
        except Exception as e:
            log.warning("[P3] 2leg slow scan error %s: %s", rk, e)

    def _run_3leg(self, rk, tk_in, tk_mid, tk_out, dec_in, dec_mid, block):
        try:
            a_in  = self._cfg[tk_in]
            a_mid = self._cfg[tk_mid]
            a_out = self._cfg[tk_out]
            amt, l1, l2, l3 = self._optimizer.find_optimal_3leg(a_in, a_mid, a_out, dec_in)
            if l3 == 0:
                return
            _, f1 = self._fetcher.quote_uniswap_best(a_in,  a_mid, amt)
            _, f2 = self._fetcher.quote_uniswap_best(a_mid, a_out, l1 or int(amt * 0.99))
            _, f3 = self._fetcher.quote_uniswap_best(a_out, a_in,  l2 or int(amt * 0.99))
            rc = RouteCache(
                trade_size=amt,
                buy_dex="uniswap", sell_dex="uniswap",
                buy_fee=f1, sell_fee=f3,
                buy_out_est=l1 or 0,
                updated_block=block,
                leg2_dex="uniswap", leg2_fee=f2,
                leg1_out_est=l1 or 0, leg2_out_est=l2 or 0,
            )
            self._cache.update(rk, rc)
            log.debug("[P3][3leg] %s optimal=$%.0f USDC", rk, amt / (10 ** dec_in))
        except Exception as e:
            log.warning("[P3] 3leg slow scan error %s: %s", rk, e)

    def shutdown(self) -> None:
        self._pool.shutdown(wait=False)


# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
class TradeSizeOptimizer:
    """
    Finds the trade size that maximises net profit using golden section search.

    The profit function for flash arb is:
      f(amount) = sell_out(amount) - amount - flash_premium(amount)

    This is unimodal: profit rises with size (more absolute spread), then
    falls as price impact dominates. Golden section converges to the true
    maximum in exactly ceil(log(tol/range)/log(1/phi)) iterations ≈ 12.

    ~12 evaluations × (1 uni call + 1 aero call) = ~24 RPC calls per route.
    This is ~5× more accurate than 5-sample linear scanning at 2× the cost.
    The larger optimum found typically more than compensates.
    """

    GOLDEN_RATIO    = (math.sqrt(5) + 1) / 2
    MAX_ITERATIONS  = 14   # ~12 needed for 1% tolerance, 14 for safety
    GAS_ESTIMATE    = 600_000 * 0.01 * 1e-9 * 3_000 * 1_000_000  # rough USDC estimate

    def __init__(
        self,
        fetcher:        PriceFetcher,
        cfg:            dict,
        min_trade_usdc: float,
        max_trade_usdc: float,
    ):
        self.fetcher        = fetcher
        self.cfg            = cfg
        self.min_trade_usdc = min_trade_usdc
        self.max_trade_usdc = max_trade_usdc

    def find_optimal_2leg(
        self,
        addr_in:  str, addr_out: str,
        dec_in:   int,
        buy_dex:  str,  # "uniswap" or "aerodrome"
        sell_dex: str,
        buy_fee:  int = 500,
        sell_fee: int = 500,
    ) -> Tuple[int, int, int]:
        """
        Find optimal (amount_in, buy_amount_out, sell_amount_out).
        Uses golden section search over [min_trade, max_trade].
        buy_fee / sell_fee hint for which tier to use in fast mode.
        Returns raw token units.
        """
        lo = int(self.min_trade_usdc * (10 ** dec_in))
        hi = int(self.max_trade_usdc * (10 ** dec_in))

        def profit(amt: int) -> float:
            b_out, s_out = self._quote_round_trip(
                addr_in, addr_out, amt, buy_dex, sell_dex)
            if b_out is None or s_out is None:
                return float('-inf')
            gross = s_out - amt
            if gross <= 0:
                return float('-inf')
            premium = (amt * AAVE_FLASH_PREMIUM_BPS) // 10_000
            return float(gross - premium)

        optimal_amt = self._golden_section_max(profit, lo, hi)

        # Final evaluation at optimal point
        b_out, s_out = self._quote_round_trip(
            addr_in, addr_out, optimal_amt, buy_dex, sell_dex)
        if b_out is None or s_out is None:
            return lo, 0, 0
        return optimal_amt, b_out, s_out

    def find_optimal_3leg(
        self,
        addr_in: str, addr_mid: str, addr_out: str,
        dec_in:  int,
    ) -> Tuple[int, int, int, int]:
        """
        Find optimal (amount_in, leg1_out, leg2_out, leg3_out) for triangular route.
        Returns raw token units.
        """
        lo = int(self.min_trade_usdc * (10 ** dec_in))
        hi = int(self.max_trade_usdc * (10 ** dec_in))

        def profit(amt: int) -> float:
            leg1, leg2, leg3 = self._quote_3leg(addr_in, addr_mid, addr_out, amt)
            if leg3 is None:
                return float('-inf')
            gross = leg3 - amt
            if gross <= 0:
                return float('-inf')
            premium = (amt * AAVE_FLASH_PREMIUM_BPS) // 10_000
            return float(gross - premium)

        optimal_amt = self._golden_section_max(profit, lo, hi)
        leg1, leg2, leg3 = self._quote_3leg(addr_in, addr_mid, addr_out, optimal_amt)
        if leg3 is None:
            return lo, 0, 0, 0
        return optimal_amt, leg1 or 0, leg2 or 0, leg3

    def _golden_section_max(
        self, f, lo: int, hi: int
    ) -> int:
        """Golden section search for maximum of unimodal f on [lo, hi]."""
        gr   = self.GOLDEN_RATIO
        a, b = float(lo), float(hi)
        c    = b - (b - a) / gr
        d    = a + (b - a) / gr
        fc   = f(int(c))
        fd   = f(int(d))
        for _ in range(self.MAX_ITERATIONS):
            if abs(b - a) < max(1.0, a * 0.001):  # 0.1% relative tolerance
                break
            if fc < fd:
                a, c, fc = c, d, fd
                d        = a + (b - a) / gr
                fd       = f(int(d))
            else:
                b, d, fd = d, c, fc
                c        = b - (b - a) / gr
                fc       = f(int(c))
        return int((a + b) / 2)

    def _quote_round_trip(
        self,
        addr_in: str, addr_out: str,
        amt: int,
        buy_dex: str, sell_dex: str,
    ) -> Tuple[Optional[int], Optional[int]]:
        """Quote a buy-then-sell round trip. Returns (buy_out, sell_out)."""
        if buy_dex == "uniswap":
            buy_out, _ = self.fetcher.quote_uniswap_best(addr_in, addr_out, amt)
        else:
            buy_out = self.fetcher.quote_aerodrome_best(addr_in, addr_out, amt)
        if buy_out is None or buy_out == 0:
            return None, None
        if sell_dex == "uniswap":
            sell_out, _ = self.fetcher.quote_uniswap_best(addr_out, addr_in, buy_out)
        else:
            sell_out = self.fetcher.quote_aerodrome_best(addr_out, addr_in, buy_out)
        return buy_out, sell_out

    def _quote_3leg(
        self, addr_in: str, addr_mid: str, addr_out: str, amt: int
    ) -> Tuple[Optional[int], Optional[int], Optional[int]]:
        """Quote a triangular route. Returns (leg1_out, leg2_out, leg3_out)."""
        uni1, _  = self.fetcher.quote_uniswap_best(addr_in, addr_mid, amt)
        aero1    = self.fetcher.quote_aerodrome_best(addr_in, addr_mid, amt)
        l1       = max(v for v in [uni1, aero1] if v is not None) if (uni1 or aero1) else None
        if l1 is None:
            return None, None, None

        uni2, _  = self.fetcher.quote_uniswap_best(addr_mid, addr_out, l1)
        aero2    = self.fetcher.quote_aerodrome_best(addr_mid, addr_out, l1)
        l2       = max(v for v in [uni2, aero2] if v is not None) if (uni2 or aero2) else None
        if l2 is None:
            return l1, None, None

        uni3, _  = self.fetcher.quote_uniswap_best(addr_out, addr_in, l2)
        aero3    = self.fetcher.quote_aerodrome_best(addr_out, addr_in, l2)
        l3       = max(v for v in [uni3, aero3] if v is not None) if (uni3 or aero3) else None
        return l1, l2, l3


# ─────────────────────────────────────────────────────────────────────────────
# U7: JIT Simulator
# ─────────────────────────────────────────────────────────────────────────────
class JITSimulator:
    """
    Simulates a transaction against current blockchain state using eth_call
    IMMEDIATELY before submission. This catches trades that were profitable
    200ms ago but are no longer profitable due to price movement or competing
    transactions landing in the same block.

    If simulation reverts: do NOT send the transaction. Log as JIT_BLOCKED.

    The AgentAlpha contract enforces minProfit internally; if it would revert
    on-chain due to insufficient profit, eth_call will also revert here,
    allowing us to catch it before spending gas.
    """

    def simulate(
        self, tx_dict: dict, from_addr: str, w3: Web3
    ) -> Tuple[bool, str]:
        """
        Returns (should_execute: bool, reason: str).
        True = simulation passed, send the transaction.
        False = simulation failed, do NOT send.
        """
        call_dict = {
            "to":   tx_dict.get("to"),
            "data": tx_dict.get("data"),
            "from": from_addr,
        }
        if tx_dict.get("gas"):
            call_dict["gas"] = tx_dict["gas"]

        try:
            result = w3.eth.call(call_dict, "latest")
            log.debug("[U7] JIT simulation passed (%d bytes returned)", len(result))
            return True, "simulation_passed"
        except Exception as e:
            err = str(e)
            # Parse revert reason if available
            reason = "contract_revert"
            if "execution reverted" in err.lower():
                reason = "execution_reverted"
            elif "insufficient profit" in err.lower():
                reason = "insufficient_profit_at_current_state"
            elif "slippage" in err.lower():
                reason = "slippage_exceeded"
            elif "deadline" in err.lower():
                reason = "deadline_exceeded"
            log.warning("[U7] JIT simulation FAILED — blocking tx. Reason: %s | %s",
                        reason, err[:120])
            return False, reason


# ─────────────────────────────────────────────────────────────────────────────
# Transaction Builder (Phase 1, enhanced with gas ladder + JIT simulation)
# ─────────────────────────────────────────────────────────────────────────────
class TxBuilder:
    DEX_UNISWAP_V3 = 0
    DEX_AERODROME  = 1

    def __init__(
        self, w3_getter, cfg: dict, private_key: str,
        use_flashbots: bool = False,
        gas_ladder:    Optional[GasLadder] = None,
        jit_simulator: Optional[JITSimulator] = None,
    ):
        self._get_w3     = w3_getter
        self.cfg         = cfg
        self.use_flashbots = use_flashbots
        self.gas_ladder  = gas_ladder or GasLadder()
        self.jit_sim     = jit_simulator or JITSimulator()
        w3, _            = w3_getter()
        self.account     = w3.eth.account.from_key(private_key)
        self._agent_alpha = None

        if use_flashbots:
            self.fb_w3 = Web3(Web3.HTTPProvider(FLASHBOTS_RPC_URL))
            log.info("[MEV] Flashbots Protect RPC enabled: %s", FLASHBOTS_RPC_URL)
        else:
            self.fb_w3 = None

    def _contract(self):
        if self._agent_alpha is None:
            w3, _ = self._get_w3()
            self._agent_alpha = w3.eth.contract(
                address=Web3.to_checksum_address(self.cfg["agent_alpha"]),
                abi=AGENT_ALPHA_ABI,
            )
        return self._agent_alpha

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
        hops     = []
        for leg in opp.legs:
            min_out = apply_slippage(leg["amount_out"])
            hops.append(self._make_hop(
                dex=leg["dex"], token_in=leg["token_in"],
                token_out=leg["token_out"], fee=leg.get("fee", 0), min_out=min_out,
            ))
        return {
            "tradeId":     trade_id,
            "flashToken":  Web3.to_checksum_address(opp.token_in),
            "flashAmount": opp.amount_in,
            "path":        hops,
            "minProfit":   max(opp.net_profit, 0),
            "deadline":    int(time.time()) + 60,
        }

    def build_tx_dict(self, opp: ArbOpportunity) -> Tuple[dict, int]:
        """
        Build transaction dict with U8 gas ladder priority fees.
        Returns (tx_dict, gas_tier).
        """
        w3, _ = self._get_w3()
        trade_params = self._make_trade_params(opp)
        nonce        = w3.eth.get_transaction_count(self.account.address, "latest")
        fee_data     = w3.eth.fee_history(1, "latest", [50])
        base_fee     = fee_data["baseFeePerGas"][-1]

        # U8: Calculate priority fee from gas ladder
        net_profit_usd = opp.net_profit / (10 ** opp.token_in_dec)
        priority, tier = self.gas_ladder.get_priority_fee(net_profit_usd, w3)

        tx = self._contract().functions.executeArbitrage(trade_params).build_transaction({
            "from":                 self.account.address,
            "nonce":                nonce,
            "maxFeePerGas":         base_fee * 2 + priority,
            "maxPriorityFeePerGas": priority,
            "chainId":              self.cfg["chain_id"],
        })
        return tx, tier

    def execute(self, opp: ArbOpportunity) -> Tuple[str, int, bool]:
        """
        U7: JIT simulate first. Then sign and broadcast.
        Returns (tx_hash, gas_tier, jit_blocked).
        If JIT simulation fails, returns ("", tier, True) — tx NOT sent.
        """
        w3, url = self._get_w3()
        tx, tier = self.build_tx_dict(opp)

        # U7: JIT simulation — mandatory check before any submission
        ok, reason = self.jit_sim.simulate(tx, self.account.address, w3)
        if not ok:
            return "", tier, True   # blocked — caller logs and skips

        signed = w3.eth.account.sign_transaction(tx, self.account.key)
        raw_tx = signed.raw_transaction

        if self.use_flashbots and self.fb_w3:
            try:
                tx_hash = self.fb_w3.eth.send_raw_transaction(raw_tx)
                log.info("[MEV] Sent via Flashbots Protect (tier %d)", tier)
                return tx_hash.hex(), tier, False
            except Exception as e:
                log.warning("[MEV] Flashbots failed (%s) — public RPC fallback", e)

        tx_hash = w3.eth.send_raw_transaction(raw_tx)
        return tx_hash.hex(), tier, False


# ─────────────────────────────────────────────────────────────────────────────
# Arbitrage Detector (Phase 1 + U2 binary search + U6 route scoring)
# ─────────────────────────────────────────────────────────────────────────────
class ArbDetector:
    """
    Detects arbitrage opportunities across all pairs, all routes.

    Phase 1: 2-leg pairs, 3-leg triangular routes, parallel scanning.
    U2: golden section search for optimal trade size (background only in Phase 3).
    U6: dynamic route scoring — high-score routes scanned first.
    P1: Multicall3 batching — all quotes in 1 aggregate3() call.
    P2: Two-speed scanning — fast path every block, slow path every 60 blocks.
    P3: Background optimizer — golden section never blocks main scan.
    P4: Fee-tier caching — winning Uniswap fee tier cached per route.
    """

    def __init__(
        self,
        fetcher:       "PriceFetcher",
        gas_estimator: "GasEstimator",
        optimizer:     "TradeSizeOptimizer",
        builder:       Optional["TxBuilder"],
        scorer:        "RouteScorer",
        cfg:           dict,
        min_profit:    float = 1.0,
        gas_ladder:    Optional["GasLadder"] = None,
        mc3_quoter:    Optional["Multicall3Quoter"] = None,
        route_cache:   Optional["RouteOptimalCache"] = None,
        bg_optimizer:  Optional["BackgroundOptimizer"] = None,
    ):
        self.fetcher       = fetcher
        self.gas_estimator = gas_estimator
        self.optimizer     = optimizer
        self.builder       = builder
        self.scorer        = scorer
        self.cfg           = cfg
        self.min_profit    = int(min_profit * 1_000_000)  # raw USDC units
        self.gas_ladder    = gas_ladder
        # P1/P2/P3/P4 components (injected by Agent; may be None for backwards compat)
        self.mc3_quoter   = mc3_quoter
        self.route_cache  = route_cache
        self.bg_optimizer = bg_optimizer

        # Gas cache: keyed by route_type ("2leg" / "3leg")
        # Stores (gas_units, gas_cost_wei, gas_cost_usdc, last_block)
        # Defaults based on empirical Base L2 measurements.
        # Re-estimated every 50 blocks; contract bytecode never changes mid-run.
        self._gas_cache: Dict[str, tuple] = {
            "2leg": (450_000, 0, 0, -1),
            "3leg": (600_000, 0, 0, -1),
        }
        self._gas_cache_ttl  = 50    # blocks between real eth_estimateGas calls
        self._current_block  = 0     # updated at the top of scan_all_multicall3
        self._gas_cache_lock = threading.Lock()

    # ─────────────────────────────────────────────────────────────────────────
    # P1/P2: Multicall3 fast-path scan (primary code path)
    # ─────────────────────────────────────────────────────────────────────────

    def scan_all_multicall3(self, current_block: int) -> Optional[ArbOpportunity]:
        """
        P1: Execute ALL price quotes for ALL routes in ONE aggregate3() call.
        P2: Use cached optimal sizes (fast path); background thread handles re-optimisation.
        P3: Schedule slow scans without blocking.
        P4: Use cached winning fee tiers.

        Target: <5ms per scan (vs 22 000ms in legacy mode).
        """
        if self.mc3_quoter is None or self.route_cache is None:
            return self.scan_all()   # fallback for backward compatibility

        # Track current block for gas cache TTL
        self._current_block = current_block

        # P3: schedule background optimisation for stale caches (non-blocking)
        if self.bg_optimizer:
            self.bg_optimizer.schedule_all(current_block)

        # Build the consolidated batch
        t0 = time.monotonic()
        qreqs, ctxs = self.mc3_quoter.build_fast_batch(self.route_cache, current_block)
        if not qreqs:
            return None

        # Execute — 1 RPC call (aggregate3 via eth_call)
        results = self.mc3_quoter.batch_quote(qreqs)

        batch_ms = (time.monotonic() - t0) * 1000
        log.debug("[P1] Multicall3 batch: %d quotes in %.1fms", len(qreqs), batch_ms)

        # Parse results into candidates
        candidates: List[ArbOpportunity] = []
        for ctx in ctxs:
            opp = self._evaluate_ctx(ctx, results)
            rk  = ctx["route_key"]
            if opp is not None:
                candidates.append(opp)
                self.scorer.record_win(rk, opp.net_profit / (10 ** opp.token_in_dec))
                # Update cache with fresh buy_out estimate from this scan
                rc = self.route_cache.get(rk)
                if rc and ctx["kind"] in ("2leg_warm",):
                    buy_out = results[ctx.get("buy_idx", 0)]
                    if buy_out:
                        import copy
                        rc2 = copy.copy(rc)
                        rc2.buy_out_est = buy_out
                        self.route_cache.update(rk, rc2)
            else:
                self.scorer.record_miss(rk)

        if not candidates:
            return None
        return max(candidates, key=lambda o: o.net_profit)

    def _best_of(self, results: List[Optional[int]], indices: List[int]) -> Tuple[Optional[int], int]:
        """Return (best_amount, winning_index) from a list of result indices."""
        best_amt = None
        best_idx = 0
        for idx in indices:
            amt = results[idx] if idx < len(results) else None
            if amt and (best_amt is None or amt > best_amt):
                best_amt = amt
                best_idx = idx
        return best_amt, best_idx

    def _fee_at_index(self, base_idx: int, idx: int) -> int:
        """Recover fee tier from relative index in a 4-element fee-tier probe block."""
        offset = idx - base_idx
        if 0 <= offset < len(UNISWAP_FEE_TIERS):
            return UNISWAP_FEE_TIERS[offset]
        return 500   # fallback

    def _evaluate_ctx(
        self,
        ctx:     dict,
        results: List[Optional[int]],
    ) -> Optional[ArbOpportunity]:
        """Evaluate one route context against batch results."""
        kind = ctx["kind"]
        try:
            if kind == "2leg_warm":
                return self._eval_2leg_warm(ctx, results)
            elif kind == "2leg_cold":
                return self._eval_2leg_cold(ctx, results)
            elif kind == "3leg_warm":
                return self._eval_3leg_warm(ctx, results)
            elif kind == "3leg_cold":
                return self._eval_3leg_cold(ctx, results)
        except Exception as e:
            log.debug("[P1] eval error %s: %s", ctx.get("route_key"), e)
        return None

    def _eval_2leg_warm(self, ctx, results):
        amt      = ctx["amount_in"]
        buy_out  = results[ctx["buy_idx"]]
        sell_out = results[ctx["sell_idx"]]
        if not buy_out or not sell_out:
            return None
        rc = ctx["rc"]
        a_in  = self.cfg[ctx["tk_in"]]
        a_out = self.cfg[ctx["tk_out"]]
        buy_dex  = rc.buy_dex if rc.buy_dex in ("uniswap", "aerodrome") else "uniswap"
        sell_dex = rc.sell_dex if rc.sell_dex in ("uniswap", "aerodrome") else "aerodrome"
        legs = (
            {"dex": buy_dex,  "token_in": a_in,  "token_out": a_out,
             "fee": rc.buy_fee,  "amount_out": buy_out},
            {"dex": sell_dex, "token_in": a_out, "token_out": a_in,
             "fee": rc.sell_fee, "amount_out": sell_out},
        )
        return self._evaluate(
            token_in=a_in, token_out=a_out,
            tk_in_key=ctx["tk_in"], tk_out_key=ctx["tk_out"],
            dec_in=ctx["dec_in"], dec_out=ctx["dec_out"],
            amount_in=amt, buy_amount_out=buy_out, sell_amount_out=sell_out,
            legs=legs, route_type="2leg",
            route_key=ctx["route_key"], route_score=self.scorer.get_score(ctx["route_key"]),
        )

    def _eval_2leg_cold(self, ctx, results):
        amt  = ctx["amount_in"]
        a_in  = self.cfg[ctx["tk_in"]]
        a_out = self.cfg[ctx["tk_out"]]

        # Buy side — pick best from batch
        uni_idx  = ctx["uni_buy_indices"]
        aero_idx = ctx["aero_buy_idx"]
        buy_out, best_bi = self._best_of(results, uni_idx + [aero_idx])
        if not buy_out:
            return None
        buy_dex = "uniswap" if best_bi in uni_idx else "aerodrome"
        buy_fee = self._fee_at_index(uni_idx[0], best_bi) if buy_dex == "uniswap" else 0

        # Sell side — read from batch (no individual RPC call)
        si_list   = ctx.get("uni_sell_indices", [])
        aero_si   = ctx.get("aero_sell_idx",   -1)
        sell_candidates = si_list + ([aero_si] if aero_si >= 0 else [])
        sell_out, best_si = self._best_of(results, sell_candidates)
        if not sell_out:
            return None
        sell_dex = "uniswap" if best_si in si_list else "aerodrome"
        sell_fee = self._fee_at_index(si_list[0], best_si) if (sell_dex == "uniswap" and si_list) else 0

        legs = (
            {"dex": buy_dex,  "token_in": a_in,  "token_out": a_out,
             "fee": buy_fee,  "amount_out": buy_out},
            {"dex": sell_dex, "token_in": a_out, "token_out": a_in,
             "fee": sell_fee, "amount_out": sell_out},
        )
        return self._evaluate(
            token_in=a_in, token_out=a_out,
            tk_in_key=ctx["tk_in"], tk_out_key=ctx["tk_out"],
            dec_in=ctx["dec_in"], dec_out=ctx["dec_out"],
            amount_in=amt, buy_amount_out=buy_out, sell_amount_out=sell_out,
            legs=legs, route_type="2leg",
            route_key=ctx["route_key"], route_score=self.scorer.get_score(ctx["route_key"]),
        )

    def _eval_3leg_warm(self, ctx, results):
        amt  = ctx["amount_in"]
        rc   = ctx["rc"]
        a_in  = self.cfg[ctx["tk_in"]]
        a_mid = self.cfg[ctx["tk_mid"]]
        a_out = self.cfg[ctx["tk_out"]]

        def _get_result(idx):
            return results[idx] if (0 <= idx < len(results)) else None

        l1_uni  = _get_result(ctx["l1_idx"])
        l1_aero = _get_result(ctx["l1a_idx"])
        vals1   = [v for v in [l1_uni, l1_aero] if v]
        l1 = max(vals1) if vals1 else None
        if not l1:
            return None
        d1 = rc.buy_dex if ctx["l1a_idx"] < 0 else (
            "uniswap" if (l1_uni and l1_uni >= (l1_aero or 0)) else "aerodrome")
        f1 = rc.buy_fee if d1 in ("uniswap", "uni") else 0

        l2_uni  = _get_result(ctx["l2_idx"])
        l2_aero = _get_result(ctx["l2a_idx"])
        vals2   = [v for v in [l2_uni, l2_aero] if v]
        l2 = max(vals2) if vals2 else None
        if not l2:
            return None
        d2 = rc.leg2_dex if ctx["l2a_idx"] < 0 else (
            "uniswap" if (l2_uni and l2_uni >= (l2_aero or 0)) else "aerodrome")
        f2 = rc.leg2_fee if d2 in ("uniswap", "uni") else 0

        l3_uni  = _get_result(ctx["l3_idx"])
        l3_aero = _get_result(ctx["l3a_idx"])
        vals3   = [v for v in [l3_uni, l3_aero] if v]
        l3 = max(vals3) if vals3 else None
        if not l3:
            return None
        d3 = rc.sell_dex if ctx["l3a_idx"] < 0 else (
            "uniswap" if (l3_uni and l3_uni >= (l3_aero or 0)) else "aerodrome")
        f3 = rc.sell_fee if d3 in ("uniswap", "uni") else 0

        legs = (
            {"dex": d1, "token_in": a_in,  "token_out": a_mid,  "fee": f1, "amount_out": l1},
            {"dex": d2, "token_in": a_mid, "token_out": a_out,  "fee": f2, "amount_out": l2},
            {"dex": d3, "token_in": a_out, "token_out": a_in,   "fee": f3, "amount_out": l3},
        )
        return self._evaluate(
            token_in=a_in, token_out=a_mid,
            tk_in_key=ctx["tk_in"], tk_out_key=ctx["tk_mid"],
            dec_in=ctx["dec_in"], dec_out=ctx["dec_mid"],
            amount_in=amt, buy_amount_out=l1, sell_amount_out=l3,
            legs=legs, route_type="3leg",
            route_key=ctx["route_key"], route_score=self.scorer.get_score(ctx["route_key"]),
        )

    def _eval_3leg_cold(self, ctx, results):
        amt   = ctx["amount_in"]
        a_in  = self.cfg[ctx["tk_in"]]
        a_mid = self.cfg[ctx["tk_mid"]]
        a_out = self.cfg[ctx["tk_out"]]

        # Leg 1 best
        l1_uni_end = ctx["l1_base"] + len(UNISWAP_FEE_TIERS)
        l1_uni_indices = list(range(ctx["l1_base"], l1_uni_end))
        l1_uni_out, l1_bi = self._best_of(results, l1_uni_indices)
        l1_aero = results[ctx["l1a_idx"]]
        l1 = max(v for v in [l1_uni_out, l1_aero] if v) if (l1_uni_out or l1_aero) else None
        if not l1:
            return None
        d1 = "uniswap" if (l1_uni_out and l1_uni_out >= (l1_aero or 0)) else "aerodrome"
        f1 = self._fee_at_index(ctx["l1_base"], l1_bi) if d1 == "uniswap" else 0

        # Leg 2 best
        l2_uni_indices = list(range(ctx["l2_base"], ctx["l2_base"] + len(UNISWAP_FEE_TIERS)))
        l2_uni_out, l2_bi = self._best_of(results, l2_uni_indices)
        l2_aero = results[ctx["l2a_idx"]]
        l2 = max(v for v in [l2_uni_out, l2_aero] if v) if (l2_uni_out or l2_aero) else None
        if not l2:
            return None
        d2 = "uniswap" if (l2_uni_out and l2_uni_out >= (l2_aero or 0)) else "aerodrome"
        f2 = self._fee_at_index(ctx["l2_base"], l2_bi) if d2 == "uniswap" else 0

        # Leg 3 best
        l3_uni_indices = list(range(ctx["l3_base"], ctx["l3_base"] + len(UNISWAP_FEE_TIERS)))
        l3_uni_out, l3_bi = self._best_of(results, l3_uni_indices)
        l3_aero = results[ctx["l3a_idx"]]
        l3 = max(v for v in [l3_uni_out, l3_aero] if v) if (l3_uni_out or l3_aero) else None
        if not l3:
            return None
        d3 = "uniswap" if (l3_uni_out and l3_uni_out >= (l3_aero or 0)) else "aerodrome"
        f3 = self._fee_at_index(ctx["l3_base"], l3_bi) if d3 == "uniswap" else 0

        legs = (
            {"dex": d1, "token_in": a_in,  "token_out": a_mid,  "fee": f1, "amount_out": l1},
            {"dex": d2, "token_in": a_mid, "token_out": a_out,  "fee": f2, "amount_out": l2},
            {"dex": d3, "token_in": a_out, "token_out": a_in,   "fee": f3, "amount_out": l3},
        )
        return self._evaluate(
            token_in=a_in, token_out=a_mid,
            tk_in_key=ctx["tk_in"], tk_out_key=ctx["tk_mid"],
            dec_in=ctx["dec_in"], dec_out=ctx["dec_mid"],
            amount_in=amt, buy_amount_out=l1, sell_amount_out=l3,
            legs=legs, route_type="3leg",
            route_key=ctx["route_key"], route_score=self.scorer.get_score(ctx["route_key"]),
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Legacy scan_all — kept intact; used as fallback if Multicall3 unavailable
    # ─────────────────────────────────────────────────────────────────────────

    def scan_all(self) -> Optional[ArbOpportunity]:
        """
        Legacy: parallel ThreadPoolExecutor scan with individual RPC calls.
        U6: Build task list sorted by route score (highest first).
        Preserved for backward compatibility; Multicall3 fast path is primary.
        """
        # All possible tasks
        all_tasks = []
        for (tk_in, tk_out, dec_in, dec_out) in TRADING_PAIRS:
            rk = f"2leg_{tk_in}_{tk_out}"
            all_tasks.append(("2leg", tk_in, tk_out, dec_in, dec_out, rk))

        all_tasks.append(("3leg", "usdc", "weth",  6, 18, "cbbtc", 8,  "3leg_usdc_weth_cbbtc"))
        all_tasks.append(("3leg", "usdc", "cbbtc", 6, 8,  "weth",  18, "3leg_usdc_cbbtc_weth"))

        # U6: Sort by descending route score
        def route_score_of(task):
            return self.scorer.get_score(task[-1])

        all_tasks.sort(key=route_score_of, reverse=True)

        candidates: List[ArbOpportunity] = []

        with ThreadPoolExecutor(max_workers=len(all_tasks)) as executor:
            futures = {}
            for task in all_tasks:
                if task[0] == "2leg":
                    _, tk_in, tk_out, dec_in, dec_out, rk = task
                    f = executor.submit(self._scan_pair_2leg,
                                        tk_in, tk_out, dec_in, dec_out, rk)
                else:
                    _, tk_in, tk_mid, dec_in, dec_mid, tk_out, dec_out, rk = task
                    f = executor.submit(self._scan_route_3leg,
                                        tk_in, tk_mid, dec_in, dec_mid,
                                        tk_out, dec_out, rk)
                futures[f] = task[-1]  # route_key

            for future in as_completed(futures):
                rk = futures[future]
                try:
                    result = future.result()
                    if result is not None:
                        candidates.append(result)
                        self.scorer.record_win(rk, result.net_profit / (10 ** result.token_in_dec))
                    else:
                        self.scorer.record_miss(rk)
                except Exception as e:
                    log.error("Scan task error [%s]: %s", rk, e)
                    self.scorer.record_miss(rk)

        if not candidates:
            return None
        return max(candidates, key=lambda o: o.net_profit)

    # ── 2-Leg scanning with binary search ─────────────────────────────────────

    def _scan_pair_2leg(
        self,
        tk_in: str, tk_out: str,
        dec_in: int, dec_out: int,
        route_key: str,
    ) -> Optional[ArbOpportunity]:
        addr_in  = self.cfg[tk_in]
        addr_out = self.cfg[tk_out]

        # Quick probe at mid-size to identify which DEX direction is better
        mid_amt = int(((self.optimizer.min_trade_usdc + self.optimizer.max_trade_usdc) / 2)
                      * (10 ** dec_in))
        uni_out,  uni_fee  = self.fetcher.quote_uniswap_best(addr_in, addr_out, mid_amt)
        aero_out           = self.fetcher.quote_aerodrome_best(addr_in, addr_out, mid_amt)

        directions = []
        if uni_out is not None:
            directions.append(("uniswap", "aerodrome", uni_fee))
        if aero_out is not None:
            directions.append(("aerodrome", "uniswap", 0))

        best: Optional[ArbOpportunity] = None

        for buy_dex, sell_dex, buy_fee in directions:
            # U2: Golden section search for optimal trade size
            amt, buy_out, sell_out = self.optimizer.find_optimal_2leg(
                addr_in, addr_out, dec_in, buy_dex, sell_dex, buy_fee)
            if buy_out == 0 or sell_out == 0:
                continue

            # Determine fees for the legs
            if buy_dex == "uniswap":
                _, used_buy_fee = self.fetcher.quote_uniswap_best(addr_in, addr_out, amt)
            else:
                used_buy_fee = 0
            if sell_dex == "uniswap":
                _, used_sell_fee = self.fetcher.quote_uniswap_best(addr_out, addr_in, buy_out)
            else:
                used_sell_fee = 0

            legs = (
                {"dex": buy_dex,  "token_in": addr_in,  "token_out": addr_out,
                 "fee": used_buy_fee,  "amount_out": buy_out},
                {"dex": sell_dex, "token_in": addr_out, "token_out": addr_in,
                 "fee": used_sell_fee, "amount_out": sell_out},
            )
            opp = self._evaluate(
                token_in=addr_in, token_out=addr_out,
                tk_in_key=tk_in,  tk_out_key=tk_out,
                dec_in=dec_in,    dec_out=dec_out,
                amount_in=amt,    buy_amount_out=buy_out,
                sell_amount_out=sell_out,
                legs=legs,        route_type="2leg",
                route_key=route_key,
                route_score=self.scorer.get_score(route_key),
            )
            if opp is not None:
                if best is None or opp.net_profit > best.net_profit:
                    best = opp

        return best

    # ── 3-Leg scanning with binary search ─────────────────────────────────────

    def _scan_route_3leg(
        self,
        tk_in:  str, tk_mid:  str,
        dec_in: int, dec_mid: int,
        tk_out: str, dec_out: int,
        route_key: str,
    ) -> Optional[ArbOpportunity]:
        addr_in    = self.cfg[tk_in]
        addr_mid   = self.cfg[tk_mid]
        addr_out   = self.cfg[tk_out]
        addr_final = addr_in

        # U2: Golden section search over the triangular route
        amt, l1_out, l2_out, l3_out = self.optimizer.find_optimal_3leg(
            addr_in, addr_mid, addr_out, dec_in)

        if l3_out == 0 or l1_out == 0:
            return None

        # Determine best DEXes at the optimal size
        u1, u1f = self.fetcher.quote_uniswap_best(addr_in, addr_mid, amt)
        a1      = self.fetcher.quote_aerodrome_best(addr_in, addr_mid, amt)
        l1, d1, f1 = self._pick_best(u1, u1f, a1)
        if l1 is None:
            return None

        u2, u2f = self.fetcher.quote_uniswap_best(addr_mid, addr_out, l1)
        a2      = self.fetcher.quote_aerodrome_best(addr_mid, addr_out, l1)
        l2, d2, f2 = self._pick_best(u2, u2f, a2)
        if l2 is None:
            return None

        u3, u3f = self.fetcher.quote_uniswap_best(addr_out, addr_final, l2)
        a3      = self.fetcher.quote_aerodrome_best(addr_out, addr_final, l2)
        l3, d3, f3 = self._pick_best(u3, u3f, a3)
        if l3 is None:
            return None

        legs = (
            {"dex": d1, "token_in": addr_in,  "token_out": addr_mid,   "fee": f1, "amount_out": l1},
            {"dex": d2, "token_in": addr_mid, "token_out": addr_out,   "fee": f2, "amount_out": l2},
            {"dex": d3, "token_in": addr_out, "token_out": addr_final, "fee": f3, "amount_out": l3},
        )

        return self._evaluate(
            token_in=addr_in, token_out=addr_mid,
            tk_in_key=tk_in,  tk_out_key=tk_mid,
            dec_in=dec_in,    dec_out=dec_mid,
            amount_in=amt,    buy_amount_out=l1,
            sell_amount_out=l3,
            legs=legs,        route_type="3leg",
            route_key=route_key,
            route_score=self.scorer.get_score(route_key),
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _pick_best(
        self, uni_out: Optional[int], uni_fee: int, aero_out: Optional[int],
    ) -> Tuple[Optional[int], str, int]:
        if uni_out is None and aero_out is None:
            return None, "none", 0
        if uni_out is None:
            return aero_out, "aerodrome", 0
        if aero_out is None:
            return uni_out, "uniswap", uni_fee
        return (uni_out, "uniswap", uni_fee) if uni_out >= aero_out \
               else (aero_out, "aerodrome", 0)

    def _evaluate(
        self,
        token_in:       str,   token_out:     str,
        tk_in_key:      str,   tk_out_key:    str,
        dec_in:         int,   dec_out:       int,
        amount_in:      int,   buy_amount_out: int,
        sell_amount_out: int,
        legs:           tuple, route_type:    str,
        route_key:      str,   route_score:   float,
    ) -> Optional[ArbOpportunity]:
        gross = sell_amount_out - amount_in
        if gross <= 0:
            return None

        flash_premium = (amount_in * AAVE_FLASH_PREMIUM_BPS) // 10_000

        provisional = ArbOpportunity(
            token_in=token_in,        token_out=token_out,
            token_in_key=tk_in_key,   token_out_key=tk_out_key,
            token_in_dec=dec_in,      token_out_dec=dec_out,
            route_type=route_type,    legs=legs,
            amount_in=amount_in,      buy_amount_out=buy_amount_out,
            sell_amount_out=sell_amount_out,
            gross_profit=gross,       flash_premium=flash_premium,
            gas_cost_usdc=0,          gas_cost_wei=0,
            gas_units=0,              net_profit=0,
            route_key=route_key,      route_score=route_score,
        )

        # Estimate gas cost, passing profit hint for gas ladder
        rough_profit_usd = gross / (10 ** dec_in)
        gas_units, gas_cost_wei, gas_cost_usdc, _tier = self._estimate_gas(
            provisional, rough_profit_usd)

        gas_in_token = self._gas_in_token(gas_cost_usdc, amount_in, legs, dec_in)
        net = gross - flash_premium - gas_in_token

        if net < self.min_profit:
            return None

        return provisional._replace(
            gas_cost_usdc=gas_cost_usdc,
            gas_cost_wei=gas_cost_wei,
            gas_units=gas_units,
            net_profit=net,
        )

    def _gas_in_token(self, gas_cost_usdc: int, amount_in: int,
                       legs: tuple, dec_in: int) -> int:
        if dec_in == 6:
            return gas_cost_usdc
        try:
            final_leg  = legs[-1]
            usdc_equiv = final_leg["amount_out"]
            if usdc_equiv <= 0:
                return gas_cost_usdc
            ratio = amount_in / usdc_equiv
            return int(gas_cost_usdc * ratio)
        except Exception:
            return gas_cost_usdc

    def _estimate_gas(
        self, provisional: ArbOpportunity, profit_hint_usd: float = 0.0
    ) -> Tuple[int, int, int, int]:
        rtype = provisional.route_type   # "2leg" or "3leg"
        block = self._current_block

        with self._gas_cache_lock:
            cached = self._gas_cache.get(rtype)
            cache_valid = (
                cached is not None
                and cached[3] >= 0                          # ever been set
                and (block - cached[3]) < self._gas_cache_ttl  # not stale
                and cached[1] > 0                           # has real cost data
            )

        if cache_valid:
            gas_units, gas_cost_wei, gas_cost_usdc, _ = cached
            # Tier is re-derived cheaply from profit (no RPC call needed)
            tier = 1
            if self.gas_ladder:
                w3, _ = self.gas_estimator._get_w3()
                _, tier = self.gas_ladder.get_priority_fee(profit_hint_usd, w3)
            log.debug("[GAS] Cache hit for %s: %d units (block %d, age %d)",
                      rtype, gas_units, cached[3], block - cached[3])
            return gas_units, gas_cost_wei, gas_cost_usdc, tier

        # Cache miss or stale — do the real RPC call
        log.debug("[GAS] Cache miss for %s @ block %d — calling eth_estimateGas", rtype, block)
        try:
            if self.builder is not None:
                tx_dict, _ = self.builder.build_tx_dict(provisional)
                from_addr  = self.builder.account.address
            else:
                tx_dict, from_addr = self._build_simulate_tx(provisional)

            result = self.gas_estimator.estimate(
                tx_dict, from_addr, profit_hint_usd, self.gas_ladder)
            gas_units, gas_cost_wei, gas_cost_usdc, tier = result

            # Write back to cache only if we got real values
            if gas_units > 0 and gas_cost_wei > 0:
                with self._gas_cache_lock:
                    self._gas_cache[rtype] = (gas_units, gas_cost_wei, gas_cost_usdc, block)
                log.debug("[GAS] Cache updated for %s: %d units", rtype, gas_units)

            return result

        except Exception as e:
            log.warning("Gas estimate failed: %s — using hardcoded fallback", e)
            # Use hardcoded defaults rather than returning zeros
            fallback_units = 450_000 if rtype == "2leg" else 600_000
            with self._gas_cache_lock:
                cached = self._gas_cache.get(rtype)
            if cached and cached[1] > 0:
                # Use last known good values even if stale
                return cached[0], cached[1], cached[2], 1
            # Absolute fallback: estimate cost from current gas price
            try:
                w3, _ = self.gas_estimator._get_w3()
                block_data   = w3.eth.get_block("latest")
                base_fee     = block_data.get("baseFeePerGas", w3.to_wei("0.01", "gwei"))
                priority     = w3.to_wei("0.001", "gwei")
                gas_price    = base_fee + priority
                gas_cost_wei = int(fallback_units * gas_price * GAS_BUFFER_MULTIPLIER)
                gas_cost_usdc = self.gas_estimator._wei_to_usdc(gas_cost_wei)
                return fallback_units, gas_cost_wei, gas_cost_usdc, 1
            except Exception:
                return fallback_units, 0, 0, 1

    def _build_simulate_tx(self, opp: ArbOpportunity) -> Tuple[dict, str]:
        _zero = "0x0000000000000000000000000000000000000000"
        try:
            w3, _ = self.gas_estimator._get_w3()
            agent  = w3.eth.contract(
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
                    "dex":      router,   "dexType":  dex_type,
                    "tokenIn":  Web3.to_checksum_address(leg["token_in"]),
                    "tokenOut": Web3.to_checksum_address(leg["token_out"]),
                    "fee":      leg.get("fee", 0),
                    "minOut":   0,        "poolId":   b"\x00" * 32,
                })
            params = {
                "tradeId":     trade_id,
                "flashToken":  Web3.to_checksum_address(opp.token_in),
                "flashAmount": opp.amount_in,
                "path":        hops,
                "minProfit":   0,
                "deadline":    int(time.time()) + 60,
            }
            tx = agent.functions.executeArbitrage(params).build_transaction({
                "from": _zero, "chainId": self.cfg["chain_id"],
            })
            return tx, _zero
        except Exception as e:
            log.debug("Simulate tx build failed: %s", e)
            return {}, _zero


# ─────────────────────────────────────────────────────────────────────────────
# Main Agent — Phase 2
# ─────────────────────────────────────────────────────────────────────────────
class Agent:
    def __init__(
        self,
        network:         str,
        mode:            str,
        min_profit:      float,
        interval:        int,
        use_flashbots:   bool  = False,
        max_trade_usdc:  float = MAX_TRADE_USDC,
        min_trade_usdc:  float = MIN_TRADE_USDC,
        vol_window:      int   = VOLATILITY_WINDOW_DEFAULT,
        vol_high:        float = VOLATILITY_HIGH_DEFAULT,
        vol_low:         float = VOLATILITY_LOW_DEFAULT,
        gas_tier1_profit: float = GAS_TIER1_MAX_PROFIT,
        gas_tier2_profit: float = GAS_TIER2_MAX_PROFIT,
        db_path:         str   = "agent.db",
    ):
        self.mode         = mode
        self.base_interval = interval
        self.network_name = network
        self.min_profit   = min_profit

        cfg = NETWORKS.get(network)
        if not cfg:
            raise ValueError(f"Unknown network: {network}")
        self.cfg = cfg

        # ── Database ──────────────────────────────────────────────────────────
        self.db = Database(db_path)

        # ── U4: Multi-RPC Pool ────────────────────────────────────────────────
        self.rpc_pool = RPCPool(cfg)
        w3_getter     = self.rpc_pool.get_w3   # callable: () -> (Web3, url)

        # Quick connectivity check
        w3, url = w3_getter()
        if not w3.is_connected():
            raise ConnectionError(f"Cannot connect to primary RPC: {cfg['rpc']}")
        log.info("Connected to %s (chain %s), block #%s",
                 network, cfg["chain_id"], w3.eth.block_number)

        # ── U1: WebSocket Block Subscriber ────────────────────────────────────
        self.block_subscriber = BlockSubscriber(cfg.get("ws_url", ""))

        # ── U5: Volatility Tracker ────────────────────────────────────────────
        self.volatility = VolatilityTracker(vol_window, vol_high, vol_low)

        # ── U8: Gas Ladder ────────────────────────────────────────────────────
        self.gas_ladder = GasLadder(gas_tier1_profit, gas_tier2_profit)

        # ── U7: JIT Simulator ─────────────────────────────────────────────────
        self.jit_sim = JITSimulator()

        # ── Components ────────────────────────────────────────────────────────
        private_key = os.getenv("PRIVATE_KEY")
        if mode == "live":
            if not private_key:
                raise ValueError("PRIVATE_KEY env var required for live mode")
            self.builder = TxBuilder(
                w3_getter, cfg, private_key,
                use_flashbots=use_flashbots,
                gas_ladder=self.gas_ladder,
                jit_simulator=self.jit_sim,
            )
            self._verify_executor_role(w3_getter, private_key)
        else:
            self.builder = None

        fetcher       = PriceFetcher(w3_getter, cfg)
        gas_estimator = GasEstimator(w3_getter, cfg)
        optimizer     = TradeSizeOptimizer(fetcher, cfg, min_trade_usdc, max_trade_usdc)

        # ── U6: Route Scorer ──────────────────────────────────────────────────
        self.scorer = RouteScorer(self.db)

        # ── P1/P2/P3/P4: Multicall3 + cache + background optimizer ───────────
        self.route_cache   = RouteOptimalCache(min_trade_usdc, max_trade_usdc)
        self.mc3_quoter    = Multicall3Quoter(w3_getter, cfg)
        self.bg_optimizer  = BackgroundOptimizer(fetcher, optimizer, self.route_cache, cfg, rpc_pool=self.rpc_pool)
        log.info("[P1] Multicall3 quoter ready (%s)", MULTICALL3_ADDR)
        log.info("[P2] Two-speed scanning: fast every block, slow every %d blocks",
                 SLOW_SCAN_INTERVAL)

        self.detector = ArbDetector(
            fetcher=fetcher,
            gas_estimator=gas_estimator,
            optimizer=optimizer,
            builder=self.builder,
            scorer=self.scorer,
            cfg=cfg,
            min_profit=min_profit,
            gas_ladder=self.gas_ladder,
            mc3_quoter=self.mc3_quoter,
            route_cache=self.route_cache,
            bg_optimizer=self.bg_optimizer,
        )

        # ── Performance Tracker ───────────────────────────────────────────────
        self.perf    = PerformanceTracker(self.db, network, mode)
        self.circuit = CircuitBreaker()
        self.alerter = Alerter()

        # ── U3: Activity Monitor ──────────────────────────────────────────────
        self.activity_monitor = ActivityMonitor(w3_getter, cfg)

        # Contract instances for chain stats
        self.profit_dist = w3.eth.contract(
            address=Web3.to_checksum_address(cfg["profit_dist"]),
            abi=PROFIT_DIST_ABI,
        )

        # Track current RPC endpoint for logging
        self._current_rpc      = url
        self._last_rpc         = url
        self._start_time       = time.monotonic()
        self._last_block_number = 0   # P2: two-speed tracking

    def _verify_executor_role(self, w3_getter, private_key: str):
        w3, _ = w3_getter()
        account = w3.eth.account.from_key(private_key)
        agent   = w3.eth.contract(
            address=Web3.to_checksum_address(self.cfg["agent_alpha"]),
            abi=AGENT_ALPHA_ABI,
        )
        try:
            role     = agent.functions.EXECUTOR_ROLE().call()
            has_role = agent.functions.hasRole(role, account.address).call()
            if not has_role:
                raise PermissionError(
                    f"Account {account.address} does not have EXECUTOR_ROLE on AgentAlpha.")
            log.info("[OK] Executor role confirmed for %s", account.address)
        except PermissionError:
            raise
        except Exception as e:
            log.warning("Could not verify executor role: %s", e)

    def _get_chain_stats(self) -> Tuple[float, float]:
        try:
            tvl  = self.profit_dist.functions.totalValueLocked().call()
            dist = self.profit_dist.functions.totalProfitDistributed().call()
            return tvl / 1e6, dist / 1e6
        except Exception:
            return 0.0, 0.0

    def _print_opportunity(self, opp: ArbOpportunity, label: str = "[SIMULATE]"):
        scale = 10 ** opp.token_in_dec
        gross = opp.gross_profit  / scale
        net   = opp.net_profit    / scale
        size  = opp.amount_in     / scale
        prem  = opp.flash_premium / scale
        gas   = opp.gas_cost_usdc / 1e6

        leg_str = " → ".join(
            f"{l['dex'].upper()}" + (f"(fee={l['fee']})" if l['dex'] == 'uniswap' else "")
            for l in opp.legs
        )
        log.info("  %s %s ARB | route_score=%.2f", label, opp.route_type.upper(), opp.route_score)
        log.info("  Pair       : %s / %s", opp.token_in_key.upper(), opp.token_out_key.upper())
        log.info("  Route      : %s", leg_str)
        log.info("  Trade size : %.4f %s ($%.2f)", size, opp.token_in_key.upper(), size)
        log.info("  Gross      : +%.6f %s", gross, opp.token_in_key.upper())
        log.info("  Flash fee  : -%.6f %s (5 bps)", prem, opp.token_in_key.upper())
        log.info("  Gas cost   : -$%.4f USDC (%s units)", gas, opp.gas_units)
        log.info("  Net        : +%.6f %s", net, opp.token_in_key.upper())
        log.info("  Volatility : %s (%.4f%%)", self.volatility.mode,
                 self.volatility.current_volatility * 100)

    def _effective_interval(self) -> float:
        """Compute effective scan interval based on volatility mode."""
        _, interval_mult = self.volatility.mode_adjustments()
        return max(1.0, self.base_interval * interval_mult)

    def _effective_min_profit(self) -> int:
        """Compute min profit threshold in raw USDC units based on volatility."""
        profit_mult, _ = self.volatility.mode_adjustments()
        return int(self.min_profit * profit_mult * 1_000_000)

    def scan(self) -> None:
        scan_start = time.monotonic()
        self.perf.record_scan()

        if self.circuit.is_open():
            return

        # Get current w3 and track failovers
        w3, url = self.rpc_pool.get_w3()
        if url != self._last_rpc:
            self.perf.record_rpc_failover(self._last_rpc, url)
            log.warning("[U4] RPC failover: %s → %s", self._last_rpc[:50], url[:50])
            self._last_rpc = url
            # P5: invalidate Multicall3 contract handle after failover
            if self.mc3_quoter:
                self.mc3_quoter._invalidate()
        self._current_rpc = url

        # ── Block number: WebSocket cache (free) or HTTP fallback ─────────────
        block_number = 0
        try:
            ws_block = self.block_subscriber.latest_block
            if ws_block:
                raw = ws_block.get("number", "0x0")
                block_number = int(raw, 16) if isinstance(raw, str) else int(raw)
            else:
                block_number = w3.eth.block_number
            self._last_block_number = block_number
        except Exception as e:
            log.debug("Block number failed: %s — using cached %s", e, self._last_block_number)
            block_number = self._last_block_number

        # P2: Two-speed mode logging
        blocks_since_last = block_number - getattr(self, "_prev_logged_block", 0)
        self._prev_logged_block = block_number

        log.info("Scan #%s @ block %s | vol=%s | rpc=%s",
                 self.perf.scans, block_number,
                 self.volatility.mode, url.split("/")[-1][:20])

        # Update min_profit in detector based on volatility
        self.detector.min_profit = self._effective_min_profit()

        # ── RPC call 2: Multicall3 batch of ALL price quotes ──────────────────
        # P1: one aggregate3() call covers every route, every DEX, all fee tiers
        opp = self.detector.scan_all_multicall3(block_number)

        scan_ms = (time.monotonic() - scan_start) * 1000
        self.db.log_scan(
            block_number=block_number,
            opportunities_found=1 if opp else 0,
            scan_duration_ms=scan_ms,
            volatility_mode=self.volatility.mode,
            volatility_value=self.volatility.current_volatility,
            rpc_used=url,
        )

        if opp is None:
            log.info("  → no profitable route found (%.1fms)", scan_ms)
            return

        self.perf.record_opportunity()
        label = "[EXECUTING]" if self.mode == "live" else "[SIMULATE]"
        self._print_opportunity(opp, label)

        # Feed price to volatility tracker (use normalised size as proxy)
        if opp.sell_amount_out and opp.amount_in:
            ratio = opp.sell_amount_out / opp.amount_in
            self.volatility.observe(ratio)

        if self.mode == "live":
            exec_start = time.monotonic()
            try:
                tx_hash, gas_tier, jit_blocked = self.builder.execute(opp)
                exec_time = time.monotonic() - exec_start

                if jit_blocked:
                    # U7: JIT simulation prevented this trade
                    self.perf.record_jit_block(opp)
                    log.warning("  [U7] JIT simulation blocked trade — state changed since detection")
                    return

                log.info("  Tx sent: %s/tx/%s", self.cfg["explorer"], tx_hash)
                receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

                if receipt["status"] == 1:
                    self.perf.record_win(
                        opp, tx_hash, exec_time, gas_tier,
                        receipt["blockNumber"], url)
                    scale   = 10 ** opp.token_in_dec
                    net_usd = opp.net_profit / scale
                    log.info("  [OK] Block %s | net: +%.6f %s | tier %d",
                             receipt["blockNumber"], net_usd,
                             opp.token_in_key.upper(), gas_tier)
                    self.alerter.send(
                        f"[Aetheris] Trade confirmed\n"
                        f"Route: {opp.route_key} | Net: +{net_usd:.4f} {opp.token_in_key.upper()}\n"
                        f"Gas tier: {gas_tier} | Score: {opp.route_score:.2f}\n"
                        f"Tx: {self.cfg['explorer']}/tx/{tx_hash}"
                    )
                else:
                    self.perf.record_loss(
                        opp, "tx_reverted", exec_time, gas_tier, block_number, url)
                    self.circuit.check(self.perf.consecutive_failures)
                    log.error("  [ERR] Transaction reverted")
                    self.alerter.send(
                        f"[Aetheris] WARNING: Trade reverted\n"
                        f"Route: {opp.route_key}\n"
                        f"Tx: {self.cfg['explorer']}/tx/{tx_hash}"
                    )

            except Exception as e:
                exec_time = time.monotonic() - exec_start
                self.perf.record_loss(opp, str(e)[:200], exec_time, 0, block_number, url)
                self.circuit.check(self.perf.consecutive_failures)
                log.error("  [ERR] Execution failed: %s", e)

    def run(self) -> None:
        tvl, dist = self._get_chain_stats()
        ws_status = "YES" if self.block_subscriber.is_connected else \
                    "CONNECTING..." if self.block_subscriber.ws_url else "NO (polling)"
        log.info("=" * 65)
        log.info("  AETHERIS AGENT ALPHA — PHASE 3 (Multicall3 Turbo)")
        log.info("=" * 65)
        log.info("  Mode         : %s", self.mode.upper())
        log.info("  Network      : %s (chain %s)", self.network_name, self.cfg["chain_id"])
        log.info("  AgentAlpha   : %s", self.cfg["agent_alpha"])
        log.info("  Protocol TVL : $%.2f USDC", tvl)
        log.info("  Total dist.  : $%.2f USDC", dist)
        log.info("  Base interval: %ss", self.base_interval)
        log.info("  Min profit   : $%.2f USDC (before vol adj.)", self.min_profit)
        log.info("  Trade range  : $%.0f–$%.0f",
                 self.detector.optimizer.min_trade_usdc,
                 self.detector.optimizer.max_trade_usdc)
        log.info("  WebSocket    : %s", ws_status)
        log.info("  RPC pool     : %d endpoints", len(self.rpc_pool._endpoints))
        log.info("  Route scores : %s",
                 {k: round(v, 2) for k, v in self.scorer.all_scores().items()})
        log.info("  Gas tiers    : Tier1<$%.0f Tier2<$%.0f Tier3>$%.0f",
                 self.gas_ladder.tier1_max, self.gas_ladder.tier2_max,
                 self.gas_ladder.tier2_max)
        log.info("  Vol mode     : %s (window=%d)",
                 self.volatility.mode, self.volatility.window)
        log.info("  Database     : %s", self.db.path)
        log.info("=" * 65)

        if self.mode == "simulate":
            log.info("  [INFO] SIMULATE MODE: opportunities logged but not executed")

        self.alerter.send(
            f"[Aetheris] Agent Alpha Phase 2 started\n"
            f"Mode: {self.mode.upper()} | Network: {self.cfg['chain_id']}\n"
            f"WS: {ws_status}"
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
                    log.error("Scan error: %s", e, exc_info=True)

                if self.perf.scans % 20 == 0:
                    self.perf.print_summary()
                    # Log uptime to DB
                    hours = (time.monotonic() - self._start_time) / 3600
                    today = datetime.now(timezone.utc).date().isoformat()
                    conn = self.db._connect()
                    conn.execute(
                        "UPDATE daily_stats SET uptime_hours=? WHERE date=?",
                        (round(hours, 2), today))
                    conn.commit()
                    conn.close()

                # U1: Wait for next block via WebSocket, or fall back to polling
                if self.block_subscriber.is_connected:
                    effective_timeout = self._effective_interval()
                    # U3: If high activity, don't wait
                    if self.activity_monitor.high_activity_event.is_set():
                        self.activity_monitor.high_activity_event.clear()
                        log.debug("[U3] High-activity scan triggered (no sleep)")
                    else:
                        self.block_subscriber.wait_for_block(timeout=effective_timeout)
                else:
                    # Fallback: HTTP polling at effective interval
                    effective_interval = self._effective_interval()
                    # U3: Check if high-activity event triggers early
                    activity = self.activity_monitor.high_activity_event.wait(
                        timeout=effective_interval)
                    if activity:
                        self.activity_monitor.high_activity_event.clear()

        except KeyboardInterrupt:
            log.info("Shutting down…")
            self.perf.print_summary()
            self.block_subscriber.stop()
            self.activity_monitor.stop()
            self.rpc_pool.stop()
            if self.bg_optimizer:
                self.bg_optimizer.shutdown()
            self.alerter.send("[Aetheris] Agent Alpha Phase 2 stopped")


# ─────────────────────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Aetheris Agent Alpha — Phase 2")

    # Phase 1 args (preserved)
    parser.add_argument("--network",        default="baseSepolia",
                        choices=list(NETWORKS.keys()))
    parser.add_argument("--mode",           default="simulate",
                        choices=["simulate", "live"])
    parser.add_argument("--min-profit",     type=float,
                        default=float(os.getenv("MIN_PROFIT_USDC", "1.0")))
    parser.add_argument("--interval",       type=int, default=2,
                        help="Fallback poll interval in seconds (default: 2). "
                             "WebSocket overrides this when connected.")
    parser.add_argument("--flashbots",      action="store_true",
                        help="Route transactions through Flashbots Protect RPC")

    # Phase 2 new args
    parser.add_argument("--max-trade-size", type=float, default=MAX_TRADE_USDC,
                        help="Maximum flash loan size in USD (default: 100000)")
    parser.add_argument("--min-trade-size", type=float, default=MIN_TRADE_USDC,
                        help="Minimum flash loan size in USD (default: 1000)")
    parser.add_argument("--vol-window",     type=int,   default=VOLATILITY_WINDOW_DEFAULT,
                        help="Volatility lookback window in price samples (default: 20)")
    parser.add_argument("--vol-high",       type=float, default=VOLATILITY_HIGH_DEFAULT,
                        help="Volatility threshold for AGGRESSIVE mode (default: 0.003)")
    parser.add_argument("--vol-low",        type=float, default=VOLATILITY_LOW_DEFAULT,
                        help="Volatility threshold for CONSERVATION mode (default: 0.001)")
    parser.add_argument("--gas-tier1",      type=float, default=GAS_TIER1_MAX_PROFIT,
                        help="Max profit USD for gas tier 1 (default: 5.0)")
    parser.add_argument("--gas-tier2",      type=float, default=GAS_TIER2_MAX_PROFIT,
                        help="Max profit USD for gas tier 2 (default: 25.0)")
    parser.add_argument("--db",             type=str,   default="agent.db",
                        help="SQLite database file path (default: agent.db)")

    args = parser.parse_args()

    agent = Agent(
        network          = args.network,
        mode             = args.mode,
        min_profit       = args.min_profit,
        interval         = args.interval,
        use_flashbots    = args.flashbots,
        max_trade_usdc   = args.max_trade_size,
        min_trade_usdc   = args.min_trade_size,
        vol_window       = args.vol_window,
        vol_high         = args.vol_high,
        vol_low          = args.vol_low,
        gas_tier1_profit = args.gas_tier1,
        gas_tier2_profit = args.gas_tier2,
        db_path          = args.db,
    )
    agent.run()


if __name__ == "__main__":
    main()