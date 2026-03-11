# Aetheris\agent-beta\agent_beta.py

"""
Aetheris Protocol — Agent Beta Phase 1
=======================================
Strategy: Delta-neutral funding rate capture on ETH-PERP perpetual futures.

Beta simultaneously holds:
  1. Long spot position in WETH → wrapped as wstETH (earns Lido staking yield ~3-4% APY)
  2. Short ETH-PERP perpetual on Synthetix v3 (collects funding rate payments every 8h)

Net directional exposure = zero. ETH can move in either direction — the long spot
and short perp cancel economically. Income = funding rate payments + staking yield.

PM2 Ecosystem Config:
---------------------
module.exports = { apps: [{
  name: 'aetheris-agent-beta',
  script: 'agent_beta.py',
  interpreter: 'python3',
  args: '--mode live --network baseSepolia',
  cwd: '/home/ubuntu/aetheris-agent-alpha/agent-beta',
  env: { PYTHONIOENCODING: 'utf-8' },
  restart_delay: 5000,
  max_restarts: 10,
  watch: false,
}]};

Pre-Production Checklist:
--------------------------
[ ] Confirm SNX PerpsMarket address from synthetix-deployments repo (Base Andromeda)
[ ] Confirm wstETH address on Base (bridged Lido token)
[ ] Confirm ETH market_id = 100 on Base Andromeda deployment
[ ] Run simulate mode 7 days — review agent_beta.db
[ ] Confirm >= 10 qualifying opportunities logged
[ ] Executor wallet holds enough USDC for 2.5x initial margin
[ ] Set --position-size 1000 for first live week
[ ] Monitor margin ratio daily
[ ] After 14 days stable, gradually increase position size

Usage:
------
  python agent_beta.py --mode simulate --network baseSepolia
  python agent_beta.py --mode live     --network baseSepolia
  python agent_beta.py --mode live     --network base --position-size 5000 --min-daily-profit 2.0

Environment Variables:
----------------------
  PRIVATE_KEY                  # executor wallet (live mode only)
  BASE_SEPOLIA_RPC_URL         # Alchemy HTTP RPC Base Sepolia
  BASE_MAINNET_RPC_URL         # Alchemy HTTP RPC Base Mainnet
  BASE_SEPOLIA_WS_URL          # Alchemy WebSocket Base Sepolia
  BASE_MAINNET_WS_URL          # Alchemy WebSocket Base Mainnet
  QUICKNODE_SEPOLIA_RPC_URL    # QuickNode failover Sepolia
  QUICKNODE_MAINNET_RPC_URL    # QuickNode failover Mainnet
  TELEGRAM_BOT_TOKEN           # optional
  TELEGRAM_CHAT_ID             # optional
  DISCORD_WEBHOOK_URL          # optional
  POSITION_SIZE_USDC           # default 5000

Requirements:
-------------
  pip install web3 python-dotenv requests websockets
"""

# =============================================================================
# SECTION 1 — Unicode-safe stdout, logging setup
# =============================================================================
import sys
import io
import logging
import os

# Force UTF-8 on Windows / environments with non-Unicode stdout
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("agent_beta")

# =============================================================================
# SECTION 2 — Imports
# =============================================================================
import argparse
import asyncio
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from web3.middleware import geth_poa_middleware
except ImportError:
    from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware

try:
    from web3 import Web3
    from eth_account import Account
    from eth_account.signers.local import LocalAccount
except ImportError:
    from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware

try:
    import websockets as _websockets_lib
    _WS_AVAILABLE = True
except ImportError:
    _WS_AVAILABLE = False
    log.warning("websockets not installed — BlockSubscriber will be disabled")

# =============================================================================
# SECTION 3 — Network config + constants
# =============================================================================

NETWORKS: Dict[str, dict] = {
    "baseSepolia": {
        "rpc":            os.getenv("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org"),
        "ws_url":         os.getenv("BASE_SEPOLIA_WS_URL", ""),
        "rpc_secondary":  os.getenv("QUICKNODE_SEPOLIA_RPC_URL", ""),
        "rpc_tertiary":   "https://sepolia.base.org",
        "chain_id":       84532,
        "snx_perps_market": "0x0aacb1DDCF65d8347e3a2585cD78b423987cA04d",
        "usdc":     "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "weth":     "0x4200000000000000000000000000000000000006",
        "wsteth":   "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
        "uniswap_router": "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
        "uniswap_quoter": "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
        "profit_dist":    "0xC38A776b958c83482914BdE299c9a6bC846CCb95",
        "testnet": True,
    },
    "base": {
        "rpc":            os.getenv("BASE_MAINNET_RPC_URL", "https://mainnet.base.org"),
        "ws_url":         os.getenv("BASE_MAINNET_WS_URL", ""),
        "rpc_secondary":  os.getenv("QUICKNODE_MAINNET_RPC_URL", ""),
        "rpc_tertiary":   "https://mainnet.base.org",
        "chain_id":       8453,
        "snx_perps_market": "0x0A2AF931eFFd34b81ebcc57E3d3c9B1E1dE1C9Ce",  # ⚠ VERIFY
        "usdc":     "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "weth":     "0x4200000000000000000000000000000000000006",
        "wsteth":   "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",  # ⚠ VERIFY
        "uniswap_router": "0x2626664c2603336E57B271c5C0b26F421741e481",
        "uniswap_quoter": "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
        "profit_dist":    "MAINNET_PROFIT_DIST_ADDRESS",
        "testnet": False,
    },
}

# Synthetix
SNX_ETH_MARKET_ID          = 100
SNX_USDC_SYNTH_ID          = 0
SNX_SETTLEMENT_STRATEGY_ID = 0
SNX_SETTLEMENT_DELAY_S     = 2.5
SNX_PRICE_PRECISION        = 10 ** 18
SNX_SIZE_PRECISION         = 10 ** 18
SNX_RATE_PRECISION         = 10 ** 18

# Uniswap
UNI_USDC_WETH_FEE  = 500
UNI_WETH_USDC_FEE  = 500

# Position sizing
DEFAULT_POSITION_SIZE_USDC = float(os.getenv("POSITION_SIZE_USDC", "5000"))
MAX_POSITION_SIZE_USDC     = 50_000.0
MIN_POSITION_SIZE_USDC     = 500.0

# Timing
SCAN_INTERVAL_S    = 60
MONITOR_INTERVAL_S = 30

# Fee estimates for dynamic threshold calculation
SNX_PERP_OPEN_FEE_ESTIMATE_BPS  = 5
SNX_PERP_CLOSE_FEE_ESTIMATE_BPS = 5
UNI_SPOT_FEE_BPS                = 5
EXPECTED_MIN_HOLD_HOURS         = 8.0

# Margin tiers
MARGIN_BUFFER_NORMAL_PCT      = 0.40
MARGIN_BUFFER_ALERT_PCT       = 0.30
MARGIN_BUFFER_REDUCE_PCT      = 0.15
MARGIN_BUFFER_EMERGENCY_PCT   = 0.10
INITIAL_COLLATERAL_MULTIPLIER = 1.40

# Delta rebalancing
DELTA_REBALANCE_THRESHOLD = 0.03
ABORT_ON_GAP_THRESHOLD    = 0.01

# Max hold
MAX_HOLD_HOURS = 72.0

# Circuit breaker
CIRCUIT_BREAKER_THRESHOLD = 3
CIRCUIT_BREAKER_PAUSE_S   = 900

# Aetheris tracking code for SNX (bytes32)
_TRACKING_CODE = b"AETHERIS-BETA-V1".ljust(32, b"\x00")[:32]

# Misc
SECONDS_PER_YEAR = 365 * 24 * 3600
USDC_DECIMALS    = 6
WETH_DECIMALS    = 18

# =============================================================================
# SECTION 4 — ABI definitions
# =============================================================================

SNX_PERPS_MARKET_ABI = [
    {
        "name": "currentFundingRate",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "marketId", "type": "uint128"}],
        "outputs": [{"name": "", "type": "int256"}],
    },
    {
        "name": "currentFundingVelocity",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "marketId", "type": "uint128"}],
        "outputs": [{"name": "", "type": "int256"}],
    },
    {
        "name": "indexPrice",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "marketId", "type": "uint128"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "getMarketSummary",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "marketId", "type": "uint128"}],
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "components": [
                    {"name": "skew",                  "type": "int256"},
                    {"name": "size",                  "type": "uint256"},
                    {"name": "maxOpenInterest",       "type": "uint256"},
                    {"name": "currentFundingRate",    "type": "int256"},
                    {"name": "currentFundingVelocity","type": "int256"},
                    {"name": "indexPrice",            "type": "uint256"},
                ],
            }
        ],
    },
    {
        "name": "getAvailableMargin",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "accountId", "type": "uint128"}],
        "outputs": [{"name": "", "type": "int256"}],
    },
    {
        "name": "getOpenPosition",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "accountId", "type": "uint128"},
            {"name": "marketId",  "type": "uint128"},
        ],
        "outputs": [
            {"name": "totalPnl",       "type": "int256"},
            {"name": "accruedFunding", "type": "int256"},
            {"name": "positionSize",   "type": "int128"},
        ],
    },
    {
        "name": "getRequiredMargins",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "accountId", "type": "uint128"},
            {"name": "marketId",  "type": "uint128"},
            {"name": "sizeDelta", "type": "int128"},
        ],
        "outputs": [
            {"name": "requiredInitialMargin",      "type": "uint256"},
            {"name": "requiredMaintenanceMargin",  "type": "uint256"},
            {"name": "maxLiquidationReward",       "type": "uint256"},
        ],
    },
    {
        "name": "modifyCollateral",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "accountId",     "type": "uint128"},
            {"name": "synthMarketId", "type": "uint128"},
            {"name": "amountDelta",   "type": "int256"},
        ],
        "outputs": [],
    },
    {
        "name": "commitOrder",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {
                "name": "commitment",
                "type": "tuple",
                "components": [
                    {"name": "marketId",              "type": "uint128"},
                    {"name": "accountId",             "type": "uint128"},
                    {"name": "sizeDelta",             "type": "int128"},
                    {"name": "settlementStrategyId",  "type": "uint256"},
                    {"name": "acceptablePrice",       "type": "uint256"},
                    {"name": "trackingCode",          "type": "bytes32"},
                    {"name": "referrer",              "type": "address"},
                ],
            }
        ],
        "outputs": [
            {
                "name": "retOrder",
                "type": "tuple",
                "components": [
                    {"name": "commitmentTime",        "type": "uint256"},
                    {"name": "marketId",              "type": "uint128"},
                    {"name": "accountId",             "type": "uint128"},
                    {"name": "sizeDelta",             "type": "int128"},
                    {"name": "settlementStrategyId",  "type": "uint256"},
                    {"name": "acceptablePrice",       "type": "uint256"},
                    {"name": "trackingCode",          "type": "bytes32"},
                    {"name": "referrer",              "type": "address"},
                ],
            },
            {"name": "fees", "type": "uint256"},
        ],
    },
    {
        "name": "getOpenOrder",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "accountId", "type": "uint128"},
            {"name": "marketId",  "type": "uint128"},
        ],
        "outputs": [
            {
                "name": "order",
                "type": "tuple",
                "components": [
                    {"name": "commitmentTime",       "type": "uint256"},
                    {"name": "marketId",             "type": "uint128"},
                    {"name": "accountId",            "type": "uint128"},
                    {"name": "sizeDelta",            "type": "int128"},
                    {"name": "settlementStrategyId", "type": "uint256"},
                    {"name": "acceptablePrice",      "type": "uint256"},
                    {"name": "trackingCode",         "type": "bytes32"},
                    {"name": "referrer",             "type": "address"},
                ],
            }
        ],
    },
    {
        "name": "settleOrder",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "accountId", "type": "uint128"},
            {"name": "marketId",  "type": "uint128"},
        ],
        "outputs": [],
    },
    {
        "name": "createAccount",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [],
        "outputs": [{"name": "accountId", "type": "uint128"}],
    },
    {
        "name": "AccountCreated",
        "type": "event",
        "inputs": [
            {"name": "accountId", "type": "uint128", "indexed": True},
            {"name": "owner",     "type": "address",  "indexed": True},
        ],
    },
]

ERC20_ABI = [
    {
        "name": "approve",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount",  "type": "uint256"},
        ],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "name": "balanceOf",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "allowance",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "owner",   "type": "address"},
            {"name": "spender", "type": "address"},
        ],
        "outputs": [{"name": "", "type": "uint256"}],
    },
]

WSTETH_ABI = [
    {
        "name": "wrap",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "_stETHAmount", "type": "uint256"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "unwrap",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "_wstETHAmount", "type": "uint256"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "getStETHByWstETH",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "_wstETHAmount", "type": "uint256"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "getWstETHByStETH",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "_stETHAmount", "type": "uint256"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "approve",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount",  "type": "uint256"},
        ],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "name": "balanceOf",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
]

UNI_QUOTER_V2_ABI = [
    {
        "name": "quoteExactInputSingle",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {
                "name": "params",
                "type": "tuple",
                "components": [
                    {"name": "tokenIn",            "type": "address"},
                    {"name": "tokenOut",           "type": "address"},
                    {"name": "amountIn",           "type": "uint256"},
                    {"name": "fee",                "type": "uint24"},
                    {"name": "sqrtPriceLimitX96",  "type": "uint160"},
                ],
            }
        ],
        "outputs": [
            {"name": "amountOut",                 "type": "uint256"},
            {"name": "sqrtPriceX96After",         "type": "uint160"},
            {"name": "initializedTicksCrossed",   "type": "uint32"},
            {"name": "gasEstimate",               "type": "uint256"},
        ],
    }
]

UNI_ROUTER_ABI = [
    {
        "name": "exactInputSingle",
        "type": "function",
        "stateMutability": "payable",
        "inputs": [
            {
                "name": "params",
                "type": "tuple",
                "components": [
                    {"name": "tokenIn",           "type": "address"},
                    {"name": "tokenOut",          "type": "address"},
                    {"name": "fee",               "type": "uint24"},
                    {"name": "recipient",         "type": "address"},
                    {"name": "deadline",          "type": "uint256"},
                    {"name": "amountIn",          "type": "uint256"},
                    {"name": "amountOutMinimum",  "type": "uint256"},
                    {"name": "sqrtPriceLimitX96", "type": "uint160"},
                ],
            }
        ],
        "outputs": [{"name": "amountOut", "type": "uint256"}],
    }
]

# =============================================================================
# SECTION 5 — Data structures
# =============================================================================

class PositionStatus(Enum):
    PENDING  = "PENDING"
    OPEN     = "OPEN"
    CLOSING  = "CLOSING"
    CLOSED   = "CLOSED"
    FAILED   = "FAILED"


@dataclass
class FundingSnapshot:
    market_id:           int
    funding_rate_raw:    int       # signed int256, 1e18/second
    funding_rate_per_s:  float
    funding_rate_8h_pct: float     # % per 8h (standard convention)
    funding_rate_annual: float     # annualised %
    funding_velocity:    float     # %/day rate of change
    index_price_usd:     float
    skew_fraction:       float     # skew/oi, signed -1 to +1
    oi_usd:              float     # current open interest in USD (from size field)
    max_oi_usd:          float     # maximum OI cap in USD (from maxOpenInterest field)
    timestamp:           float
    block:               int


@dataclass
class DynamicThreshold:
    entry_annual_pct:  float
    exit_8h_pct:       float
    emergency_exit:    bool
    fee_total_usdc:    float
    gas_total_usdc:    float
    min_hold_hours:    float
    calculated_at:     float


@dataclass
class SpotLeg:
    use_wsteth:        bool
    weth_amount:       int
    wsteth_amount:     int
    usdc_spent:        int
    entry_price_usd:   float
    tx_hash_buy:       str
    tx_hash_wrap:      str
    opened_at:         float
    staking_yield_usd: float = 0.0


@dataclass
class PerpLeg:
    account_id:          int
    market_id:           int
    size_tokens:         float
    size_raw:            int
    collateral_usdc:     int
    entry_price_usd:     float
    entry_rate_8h_pct:   float
    commit_tx:           str
    settle_tx:           str
    opened_at:           float
    last_monitored:      float
    accrued_funding_usd: float = 0.0
    unrealised_pnl_usd:  float = 0.0


@dataclass
class HedgePosition:
    position_id:            str
    status:                 PositionStatus
    opened_at:              float
    closed_at:              Optional[float]
    close_reason:           Optional[str]
    spot:                   Optional[SpotLeg]
    perp:                   Optional[PerpLeg]
    funding_collected_usd:  float
    fees_paid_usd:          float
    net_profit_usd:         float
    rebalance_count:        int
    total_rebalance_cost:   float
    spot_tx1_price:         float

# =============================================================================
# SECTION 6 — RPCPool
# =============================================================================

class RPCPool:
    """3-tier HTTP failover with background health-check thread."""

    _HEALTH_CHECK_INTERVAL = 30
    _MAX_CONSECUTIVE_ERRORS = 3

    def __init__(self, cfg: dict):
        self._cfg = cfg
        self._urls: List[str] = [
            u for u in [
                cfg.get("rpc", ""),
                cfg.get("rpc_secondary", ""),
                cfg.get("rpc_tertiary", ""),
            ]
            if u
        ]
        if not self._urls:
            raise ValueError("RPCPool: no RPC URLs configured")

        self._errors: Dict[str, int] = {u: 0 for u in self._urls}
        self._healthy: Dict[str, bool] = {u: True for u in self._urls}
        self._latency: Dict[str, float] = {u: 0.0 for u in self._urls}
        self._active_url: str = self._urls[0]
        self._lock = threading.Lock()
        self._stopped = False

        self._sessions: Dict[str, requests.Session] = {}
        for url in self._urls:
            self._sessions[url] = self._make_session()

        self._health_thread = threading.Thread(
            target=self._health_check_loop, daemon=True, name="RPCPool-Health"
        )
        self._health_thread.start()
        log.info("RPCPool initialised with %d endpoint(s): %s", len(self._urls), self._urls)

    def _make_session(self) -> requests.Session:
        sess = requests.Session()
        retry = Retry(total=3, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
        adapter = HTTPAdapter(max_retries=retry)
        sess.mount("http://", adapter)
        sess.mount("https://", adapter)
        return sess

    def _build_w3(self, url: str) -> Web3:
        w3 = Web3(
            Web3.HTTPProvider(
                url,
                session=self._sessions[url],
                request_kwargs={"timeout": 10},
            )
        )
        try:
            w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        except Exception:
            w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        return w3

    def get_w3(self) -> Tuple[Web3, str]:
        with self._lock:
            url = self._active_url
        return self._build_w3(url), url

    def record_success(self, url: str, ms: float) -> None:
        with self._lock:
            self._errors[url] = 0
            self._healthy[url] = True
            self._latency[url] = ms

    def record_error(self, url: str) -> None:
        with self._lock:
            self._errors[url] = self._errors.get(url, 0) + 1
            if self._errors[url] >= self._MAX_CONSECUTIVE_ERRORS:
                if self._healthy.get(url, True):
                    log.warning("RPCPool: marking %s unhealthy after %d errors", url, self._errors[url])
                self._healthy[url] = False
                self._elect_active()

    def _elect_active(self) -> None:
        """Must be called under self._lock."""
        for url in self._urls:
            if self._healthy.get(url, True):
                if url != self._active_url:
                    log.warning("RPCPool: failing over to %s", url)
                self._active_url = url
                return
        # All unhealthy — reset and try primary
        log.error("RPCPool: all endpoints unhealthy, resetting to primary")
        for url in self._urls:
            self._errors[url] = 0
            self._healthy[url] = True
        self._active_url = self._urls[0]

    def _health_check_loop(self) -> None:
        while not self._stopped:
            time.sleep(self._HEALTH_CHECK_INTERVAL)
            for url in self._urls:
                if self._stopped:
                    break
                try:
                    t0 = time.monotonic()
                    w3 = self._build_w3(url)
                    w3.eth.block_number
                    ms = (time.monotonic() - t0) * 1000
                    self.record_success(url, ms)
                    log.debug("RPCPool health: %s OK %.1fms", url, ms)
                except Exception as exc:
                    log.warning("RPCPool health: %s FAIL — %s", url, exc)
                    self.record_error(url)

    def stop(self) -> None:
        self._stopped = True
        log.info("RPCPool stopped")

# =============================================================================
# SECTION 7 — BlockSubscriber
# =============================================================================

class BlockSubscriber:
    """WebSocket eth_subscribe newHeads subscriber with auto-reconnect."""

    def __init__(self, ws_url: str):
        self._ws_url = ws_url
        self._latest_block: int = 0
        self._connected: bool = False
        self._stopped: bool = False
        self._lock = threading.Lock()
        self._new_block_event = threading.Event()

        if not _WS_AVAILABLE:
            log.warning("BlockSubscriber: websockets library not available — polling fallback active")
            return
        if not ws_url:
            log.warning("BlockSubscriber: no WS URL configured — polling fallback active")
            return

        self._thread = threading.Thread(
            target=self._run_loop, daemon=True, name="BlockSubscriber"
        )
        self._thread.start()

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def latest_block(self) -> int:
        with self._lock:
            return self._latest_block

    def wait_for_block(self, timeout: float = 15.0) -> bool:
        """Block until a new block arrives or timeout. Returns True if a block arrived."""
        self._new_block_event.clear()
        return self._new_block_event.wait(timeout=timeout)

    def _run_loop(self) -> None:
        while not self._stopped:
            try:
                asyncio.run(self._subscribe())
            except Exception as exc:
                log.warning("BlockSubscriber: loop error %s — reconnecting in 5s", exc)
            if not self._stopped:
                self._connected = False
                time.sleep(5)

    async def _subscribe(self) -> None:
        import websockets

        log.info("BlockSubscriber: connecting to %s", self._ws_url)
        async with websockets.connect(
            self._ws_url,
            ping_interval=20,
            ping_timeout=20,
        ) as ws:
            self._connected = True
            log.info("BlockSubscriber: connected")
            await ws.send('{"jsonrpc":"2.0","id":1,"method":"eth_subscribe","params":["newHeads"]}')
            sub_resp = await ws.recv()
            log.debug("BlockSubscriber: subscribed — %s", sub_resp)

            while not self._stopped:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=30)
                    import json as _json
                    data = _json.loads(msg)
                    params = data.get("params", {})
                    result = params.get("result", {}) if isinstance(params, dict) else {}
                    number_hex = result.get("number", "0x0") if isinstance(result, dict) else "0x0"
                    block_num = int(number_hex, 16)
                    with self._lock:
                        self._latest_block = block_num
                    self._new_block_event.set()
                    log.debug("BlockSubscriber: block %d", block_num)
                except asyncio.TimeoutError:
                    log.debug("BlockSubscriber: keepalive timeout — pinging")
                    await ws.ping()

    def stop(self) -> None:
        self._stopped = True
        self._connected = False
        log.info("BlockSubscriber stopped")

# =============================================================================
# SECTION 8 — Database
# =============================================================================

class Database:
    """SQLite persistence with thread lock for all shared state."""

    def __init__(self, db_path: str):
        self._path = db_path
        self._lock = threading.Lock()
        self._init_schema()
        log.info("Database initialised: %s", db_path)

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._lock:
            conn = self._conn()
            try:
                conn.executescript("""
                    PRAGMA journal_mode=WAL;

                    CREATE TABLE IF NOT EXISTS positions (
                        position_id            TEXT PRIMARY KEY,
                        status                 TEXT NOT NULL,
                        network                TEXT NOT NULL,
                        mode                   TEXT NOT NULL,
                        opened_at              REAL,
                        closed_at              REAL,
                        close_reason           TEXT,
                        spot_use_wsteth        INTEGER,
                        spot_weth_amount       TEXT,
                        spot_wsteth_amount     TEXT,
                        spot_usdc_spent        TEXT,
                        spot_entry_price_usd   REAL,
                        spot_tx_buy            TEXT,
                        spot_tx_wrap           TEXT,
                        spot_staking_yield_usd REAL,
                        perp_account_id        TEXT,
                        perp_market_id         INTEGER,
                        perp_size_tokens       REAL,
                        perp_collateral_usdc   TEXT,
                        perp_entry_price_usd   REAL,
                        perp_entry_rate_8h     REAL,
                        perp_commit_tx         TEXT,
                        perp_settle_tx         TEXT,
                        perp_accrued_funding   REAL,
                        perp_unrealised_pnl    REAL,
                        funding_collected_usd  REAL,
                        fees_paid_usd          REAL,
                        net_profit_usd         REAL,
                        rebalance_count        INTEGER,
                        total_rebalance_cost   REAL,
                        spot_tx1_price         REAL
                    );

                    CREATE TABLE IF NOT EXISTS funding_epochs (
                        id              INTEGER PRIMARY KEY AUTOINCREMENT,
                        position_id     TEXT NOT NULL,
                        epoch_time      REAL NOT NULL,
                        funding_rate_8h REAL,
                        funding_usd     REAL,
                        index_price_usd REAL,
                        margin_ratio    REAL,
                        delta_drift_pct REAL
                    );

                    CREATE TABLE IF NOT EXISTS daily_stats (
                        date                    TEXT PRIMARY KEY,
                        positions_opened        INTEGER DEFAULT 0,
                        positions_closed        INTEGER DEFAULT 0,
                        win_rate                REAL DEFAULT 0,
                        funding_collected_usd   REAL DEFAULT 0,
                        staking_yield_usd       REAL DEFAULT 0,
                        fees_paid_usd           REAL DEFAULT 0,
                        net_profit_usd          REAL DEFAULT 0,
                        cumulative_net_usd      REAL DEFAULT 0,
                        circuit_breaker_trips   INTEGER DEFAULT 0,
                        emergency_closes        INTEGER DEFAULT 0,
                        margin_alerts           INTEGER DEFAULT 0,
                        rebalances              INTEGER DEFAULT 0,
                        uptime_hours            REAL DEFAULT 0
                    );

                    CREATE TABLE IF NOT EXISTS events (
                        id          INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp   REAL NOT NULL,
                        event_type  TEXT NOT NULL,
                        detail      TEXT
                    );

                    CREATE TABLE IF NOT EXISTS config (
                        key   TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    );
                """)
                conn.commit()
            finally:
                conn.close()

    def upsert_position(self, pos: "HedgePosition", network: str, mode: str) -> None:
        with self._lock:
            conn = self._conn()
            try:
                spot = pos.spot
                perp = pos.perp
                conn.execute("""
                    INSERT OR REPLACE INTO positions VALUES (
                        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
                    )
                """, (
                    pos.position_id,
                    pos.status.value,
                    network,
                    mode,
                    pos.opened_at,
                    pos.closed_at,
                    pos.close_reason,
                    int(spot.use_wsteth) if spot else None,
                    str(spot.weth_amount) if spot else None,
                    str(spot.wsteth_amount) if spot else None,
                    str(spot.usdc_spent) if spot else None,
                    spot.entry_price_usd if spot else None,
                    spot.tx_hash_buy if spot else None,
                    spot.tx_hash_wrap if spot else None,
                    spot.staking_yield_usd if spot else None,
                    str(perp.account_id) if perp else None,
                    perp.market_id if perp else None,
                    perp.size_tokens if perp else None,
                    str(perp.collateral_usdc) if perp else None,
                    perp.entry_price_usd if perp else None,
                    perp.entry_rate_8h_pct if perp else None,
                    perp.commit_tx if perp else None,
                    perp.settle_tx if perp else None,
                    perp.accrued_funding_usd if perp else None,
                    perp.unrealised_pnl_usd if perp else None,
                    pos.funding_collected_usd,
                    pos.fees_paid_usd,
                    pos.net_profit_usd,
                    pos.rebalance_count,
                    pos.total_rebalance_cost,
                    pos.spot_tx1_price,
                ))
                conn.commit()
            finally:
                conn.close()

    def log_funding_epoch(
        self,
        position_id: str,
        epoch_time: float,
        funding_rate_8h: float,
        funding_usd: float,
        index_price_usd: float,
        margin_ratio: float,
        delta_drift_pct: float,
    ) -> None:
        with self._lock:
            conn = self._conn()
            try:
                conn.execute(
                    "INSERT INTO funding_epochs "
                    "(position_id,epoch_time,funding_rate_8h,funding_usd,index_price_usd,margin_ratio,delta_drift_pct) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (position_id, epoch_time, funding_rate_8h, funding_usd, index_price_usd, margin_ratio, delta_drift_pct),
                )
                conn.commit()
            finally:
                conn.close()

    def log_event(self, event_type: str, detail: str = "") -> None:
        with self._lock:
            conn = self._conn()
            try:
                conn.execute(
                    "INSERT INTO events (timestamp,event_type,detail) VALUES (?,?,?)",
                    (time.time(), event_type, detail),
                )
                conn.commit()
            finally:
                conn.close()

    def load_open_positions(self, network: str, mode: str) -> List[dict]:
        """Return all OPEN/PENDING positions for this network+mode — used for crash recovery."""
        with self._lock:
            conn = self._conn()
            try:
                rows = conn.execute(
                    "SELECT * FROM positions WHERE status IN ('OPEN','PENDING') AND network=? AND mode=?",
                    (network, mode),
                ).fetchall()
                return [dict(r) for r in rows]
            finally:
                conn.close()

    def update_daily_stats(self, stats: dict) -> None:
        """Upsert daily stats row. stats must include 'date' key."""
        date = stats.get("date")
        if not date:
            return
        with self._lock:
            conn = self._conn()
            try:
                existing = conn.execute(
                    "SELECT * FROM daily_stats WHERE date=?", (date,)
                ).fetchone()
                if existing is None:
                    conn.execute(
                        "INSERT INTO daily_stats (date) VALUES (?)", (date,)
                    )
                for key, val in stats.items():
                    if key == "date":
                        continue
                    try:
                        conn.execute(
                            f"UPDATE daily_stats SET {key}=? WHERE date=?",
                            (val, date),
                        )
                    except Exception as exc:
                        log.warning("Database.update_daily_stats: bad column %s — %s", key, exc)
                conn.commit()
            finally:
                conn.close()

    def save_snx_account_id(self, account_id: int) -> None:
        with self._lock:
            conn = self._conn()
            try:
                conn.execute(
                    "INSERT OR REPLACE INTO config (key,value) VALUES ('snx_account_id',?)",
                    (str(account_id),),
                )
                conn.commit()
            finally:
                conn.close()

    def load_snx_account_id(self) -> Optional[int]:
        with self._lock:
            conn = self._conn()
            try:
                row = conn.execute(
                    "SELECT value FROM config WHERE key='snx_account_id'"
                ).fetchone()
                return int(row["value"]) if row else None
            finally:
                conn.close()

# =============================================================================
# SECTION 9 — Alerter
# =============================================================================

class Alerter:
    """Async-safe Telegram + Discord alerter."""

    def __init__(self):
        self._tg_token  = os.getenv("TELEGRAM_BOT_TOKEN", "")
        self._tg_chat   = os.getenv("TELEGRAM_CHAT_ID", "")
        self._discord   = os.getenv("DISCORD_WEBHOOK_URL", "")
        self._session   = requests.Session()
        self._queue: List[str] = []
        self._lock = threading.Lock()
        self._thread = threading.Thread(
            target=self._worker, daemon=True, name="Alerter"
        )
        self._thread.start()
        log.info(
            "Alerter ready — Telegram=%s Discord=%s",
            bool(self._tg_token),
            bool(self._discord),
        )

    def send(self, message: str) -> None:
        log.info("[ALERT] %s", message)
        with self._lock:
            self._queue.append(message)

    def _worker(self) -> None:
        while True:
            time.sleep(1)
            with self._lock:
                msgs = self._queue[:]
                self._queue.clear()
            for msg in msgs:
                self._dispatch(msg)

    def _dispatch(self, message: str) -> None:
        if self._tg_token and self._tg_chat:
            try:
                url = f"https://api.telegram.org/bot{self._tg_token}/sendMessage"
                resp = self._session.post(
                    url,
                    json={"chat_id": self._tg_chat, "text": message, "parse_mode": "Markdown"},
                    timeout=10,
                )
                if resp.status_code != 200:
                    log.warning("Alerter: Telegram error %d", resp.status_code)
            except Exception as exc:
                log.warning("Alerter: Telegram send failed — %s", exc)

        if self._discord:
            try:
                resp = self._session.post(
                    self._discord,
                    json={"content": message[:2000]},
                    timeout=10,
                )
                if resp.status_code not in (200, 204):
                    log.warning("Alerter: Discord error %d", resp.status_code)
            except Exception as exc:
                log.warning("Alerter: Discord send failed — %s", exc)

# =============================================================================
# SECTION 10 — CircuitBreaker
# =============================================================================

class CircuitBreaker:
    """Opens after N consecutive failures; auto-resets after pause."""

    def __init__(self):
        self._failures   = 0
        self._tripped    = False
        self._tripped_at = 0.0
        self._trips      = 0
        self._lock = threading.Lock()

    def is_open(self) -> bool:
        with self._lock:
            if not self._tripped:
                return False
            if time.time() - self._tripped_at >= CIRCUIT_BREAKER_PAUSE_S:
                log.info("CircuitBreaker: auto-reset after %.0fs pause", CIRCUIT_BREAKER_PAUSE_S)
                self._tripped  = False
                self._failures = 0
                return False
            remaining = CIRCUIT_BREAKER_PAUSE_S - (time.time() - self._tripped_at)
            log.warning("CircuitBreaker OPEN — %.0fs remaining", remaining)
            return True

    def trip(self) -> None:
        with self._lock:
            self._tripped    = True
            self._tripped_at = time.time()
            self._trips     += 1
            log.error("CircuitBreaker TRIPPED (trip #%d)", self._trips)

    def check(self, consecutive_failures: int) -> None:
        with self._lock:
            self._failures = consecutive_failures
            if consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD and not self._tripped:
                self._tripped    = True
                self._tripped_at = time.time()
                self._trips     += 1
                log.error("CircuitBreaker TRIPPED by %d failures (trip #%d)", consecutive_failures, self._trips)

    def record_success(self) -> None:
        with self._lock:
            self._failures = 0

    @property
    def trips(self) -> int:
        return self._trips

# =============================================================================
# SECTION 11 — GasEstimator
# =============================================================================

class GasEstimator:
    """Reads live baseFeePerGas; caches ETH/USD from Uniswap quoter."""

    _ETH_PRICE_CACHE_S = 60
    _FALLBACK_ETH_USD  = 3000.0
    _FALLBACK_GAS_GWEI = 0.005

    def __init__(self, w3_getter, cfg: dict):
        self._w3_getter     = w3_getter
        self._cfg           = cfg
        self._eth_usd       = self._FALLBACK_ETH_USD
        self._eth_updated   = 0.0
        self._lock          = threading.Lock()
        self._quoter        = None

    def _get_quoter(self, w3: Web3):
        if self._quoter is None:
            self._quoter = w3.eth.contract(
                address=Web3.to_checksum_address(self._cfg["uniswap_quoter"]),
                abi=UNI_QUOTER_V2_ABI,
            )
        return self._quoter

    def _refresh_eth_price(self) -> None:
        """Fetch ETH price in USD from Uniswap quoter (1 ETH → USDC)."""
        try:
            w3, _ = self._w3_getter()
            quoter = self._get_quoter(w3)
            one_eth = 10 ** 18
            result = quoter.functions.quoteExactInputSingle((
                Web3.to_checksum_address(self._cfg["weth"]),
                Web3.to_checksum_address(self._cfg["usdc"]),
                one_eth,
                UNI_WETH_USDC_FEE,
                0,
            )).call()
            usdc_out = result[0]
            eth_price = usdc_out / (10 ** USDC_DECIMALS)
            with self._lock:
                self._eth_usd     = eth_price
                self._eth_updated = time.time()
            log.debug("GasEstimator: ETH/USD = $%.2f", eth_price)
        except Exception as exc:
            log.warning("GasEstimator: ETH price refresh failed — %s — using $%.0f", exc, self._FALLBACK_ETH_USD)

    def _eth_price(self) -> float:
        with self._lock:
            stale = (time.time() - self._eth_updated) > self._ETH_PRICE_CACHE_S
            price = self._eth_usd
        if stale:
            self._refresh_eth_price()
            with self._lock:
                price = self._eth_usd
        return price

    def gas_cost_usdc(self, gas_units: int) -> float:
        """Return USD cost of `gas_units` at current network conditions."""
        try:
            w3, _ = self._w3_getter()
            block = w3.eth.get_block("latest")
            base_fee_wei = block.get("baseFeePerGas", 0)
            # Add 1 gwei priority fee
            priority_fee_wei = Web3.to_wei("0.001", "gwei")
            total_fee_wei = base_fee_wei + priority_fee_wei
            eth_cost = (gas_units * total_fee_wei) / (10 ** 18)
            usd_cost = eth_cost * self._eth_price()
            return usd_cost
        except Exception as exc:
            log.warning("GasEstimator.gas_cost_usdc: fallback — %s", exc)
            eth_cost = (gas_units * Web3.to_wei(self._FALLBACK_GAS_GWEI, "gwei")) / (10 ** 18)
            return eth_cost * self._FALLBACK_ETH_USD

# =============================================================================
# SECTION 12 — FundingRateOracle
# =============================================================================

class FundingRateOracle:
    """Fetches and normalises Synthetix ETH-PERP funding rate."""

    def __init__(self, w3_getter, cfg: dict):
        self._w3_getter = w3_getter
        self._cfg       = cfg
        self._contract  = None
        self._lock      = threading.Lock()

    def _get_contract(self, w3: Web3):
        with self._lock:
            if self._contract is None:
                self._contract = w3.eth.contract(
                    address=Web3.to_checksum_address(self._cfg["snx_perps_market"]),
                    abi=SNX_PERPS_MARKET_ABI,
                )
        return self._contract

    def invalidate(self) -> None:
        """Clear cached contract handle (called on RPC failover)."""
        with self._lock:
            self._contract = None
        log.info("FundingRateOracle: contract handle invalidated")

    def fetch(self, block_number: int) -> Optional[FundingSnapshot]:
        try:
            w3, _ = self._w3_getter()
            contract = self._get_contract(w3)
            return self._fetch_summary(contract, block_number)
        except Exception as exc:
            log.warning("FundingRateOracle.fetch: %s — retrying with individual calls", exc)
            return self._fetch_individual(block_number)

    def _fetch_summary(self, contract, block_number: int) -> FundingSnapshot:
        summary = contract.functions.getMarketSummary(SNX_ETH_MARKET_ID).call()
        skew_raw      = summary[0]
        size_raw      = summary[1]
        oi_raw        = summary[2]
        rate_raw      = summary[3]   # int256 per second × 1e18
        vel_raw       = summary[4]
        price_raw     = summary[5]

        return self._normalise(
            rate_raw=rate_raw,
            vel_raw=vel_raw,
            price_raw=price_raw,
            skew_raw=skew_raw,
            size_raw=size_raw,
            oi_raw=oi_raw,
            block_number=block_number,
        )

    def _fetch_individual(self, block_number: int) -> Optional[FundingSnapshot]:
        try:
            w3, _ = self._w3_getter()
            contract = self._get_contract(w3)
            rate_raw  = contract.functions.currentFundingRate(SNX_ETH_MARKET_ID).call()
            vel_raw   = contract.functions.currentFundingVelocity(SNX_ETH_MARKET_ID).call()
            price_raw = contract.functions.indexPrice(SNX_ETH_MARKET_ID).call()
            return self._normalise(
                rate_raw=rate_raw,
                vel_raw=vel_raw,
                price_raw=price_raw,
                skew_raw=0,
                size_raw=0,
                oi_raw=0,
                block_number=block_number,
            )
        except Exception as exc:
            log.error("FundingRateOracle._fetch_individual: %s", exc)
            return None

    def _normalise(
        self,
        rate_raw: int,
        vel_raw: int,
        price_raw: int,
        skew_raw: int,
        size_raw: int,
        oi_raw: int,
        block_number: int,
    ) -> FundingSnapshot:
        rate_annual = rate_raw / SNX_RATE_PRECISION * 100   # annualised %
        rate_8h_pct = rate_annual / (365 * 3)               # % per 8h period
        rate_per_s  = rate_raw / SNX_RATE_PRECISION         # kept for FundingSnapshot compat

        vel_day_pct = vel_raw / SNX_RATE_PRECISION * 100    # annualised %/day velocity

        price_usd   = price_raw / SNX_PRICE_PRECISION

        if size_raw > 0:
            skew_frac = (skew_raw / SNX_SIZE_PRECISION) / (size_raw / SNX_SIZE_PRECISION)
        else:
            skew_frac = 0.0

        # size_raw = current open interest (token units × 1e18)
        # oi_raw   = maxOpenInterest cap   (token units × 1e18)
        current_oi_usd = (size_raw / SNX_SIZE_PRECISION) * price_usd
        max_oi_usd     = (oi_raw   / SNX_SIZE_PRECISION) * price_usd

        return FundingSnapshot(
            market_id=SNX_ETH_MARKET_ID,
            funding_rate_raw=rate_raw,
            funding_rate_per_s=rate_per_s,
            funding_rate_8h_pct=rate_8h_pct,
            funding_rate_annual=rate_annual,
            funding_velocity=vel_day_pct,
            index_price_usd=price_usd,
            skew_fraction=skew_frac,
            oi_usd=current_oi_usd,
            max_oi_usd=max_oi_usd,
            timestamp=time.time(),
            block=block_number,
        )

# =============================================================================
# SECTION 13 — ThresholdCalculator
# =============================================================================

class ThresholdCalculator:
    """Calculates dynamic entry/exit thresholds from live fee environment."""

    def __init__(self, gas_estimator: GasEstimator, position_size_usdc: float):
        self._gas     = gas_estimator
        self._pos_sz  = position_size_usdc

    def _estimate_hold_hours(self, snap: FundingSnapshot, exit_annual_pct: float) -> float:
        rate_annual = snap.funding_rate_annual
        velocity    = snap.funding_velocity
        headroom    = rate_annual - exit_annual_pct

        if headroom <= 0:
            return EXPECTED_MIN_HOLD_HOURS

        if velocity >= 0:
            estimated = MAX_HOLD_HOURS
        else:
            days_to_exit = headroom / abs(velocity)
            estimated    = days_to_exit * 24

        return max(EXPECTED_MIN_HOLD_HOURS, min(estimated, MAX_HOLD_HOURS))
    
    def calculate(self, snap: FundingSnapshot) -> DynamicThreshold:
        notional = self._pos_sz

        # Gas estimates (USD)
        gas_open  = self._gas.gas_cost_usdc(400_000) + self._gas.gas_cost_usdc(350_000)
        gas_close = self._gas.gas_cost_usdc(300_000) + self._gas.gas_cost_usdc(200_000)
        gas_total = gas_open + gas_close

        # Protocol fees
        perp_fees = notional * (SNX_PERP_OPEN_FEE_ESTIMATE_BPS + SNX_PERP_CLOSE_FEE_ESTIMATE_BPS) / 10_000
        dex_fees  = notional * (UNI_SPOT_FEE_BPS * 2) / 1_000_000
        fee_total = perp_fees + dex_fees

        total_cost = gas_total + fee_total

        # Exit threshold — calculated first, needed for hold duration estimate
        if notional > 0:
            exit_8h = (total_cost / (notional * EXPECTED_MIN_HOLD_HOURS / 8)) * 100 * 0.5
        else:
            exit_8h = 0.05

        # Convert exit_8h to annualised % for hold duration calculation
        exit_annual_pct = exit_8h * 365 * 3

        # Dynamic hold duration estimated from funding velocity
        min_hold_hours = self._estimate_hold_hours(snap, exit_annual_pct)

        # Entry threshold: cost recovery over estimated hold, with 1.5x safety margin
        if notional > 0 and min_hold_hours > 0:
            min_hourly   = total_cost / min_hold_hours
            entry_annual = (min_hourly * 24 * 365 / notional * 100) * 1.5
        else:
            entry_annual = 20.0

        emergency = snap.funding_rate_8h_pct < 0

        return DynamicThreshold(
            entry_annual_pct=entry_annual,
            exit_8h_pct=exit_8h,
            emergency_exit=emergency,
            fee_total_usdc=fee_total,
            gas_total_usdc=gas_total,
            min_hold_hours=min_hold_hours,
            calculated_at=time.time(),
        )

# =============================================================================
# SECTION 14 — PositionExecutor
# =============================================================================

class PositionExecutor:
    """Handles all on-chain execution for opening, monitoring, and closing positions."""

    _SLIPPAGE_BPS = 30  # 0.3%

    def __init__(
        self,
        w3_getter,
        cfg: dict,
        account: Optional["LocalAccount"],
        mode: str,
        db: Database,
        alerter: Alerter,
    ):
        self._w3_getter = w3_getter
        self._cfg       = cfg
        self._account   = account
        self._mode      = mode
        self._db        = db
        self._alerter   = alerter

        self._snx_account_id: Optional[int] = None
        self._snx_lock = threading.Lock()

        # Contract cache
        self._contracts: Dict[str, object] = {}
        self._contract_lock = threading.Lock()

    # -------------------------------------------------------------------------
    # Contract helpers
    # -------------------------------------------------------------------------

    def _contract(self, name: str, w3: Web3):
        with self._contract_lock:
            if name not in self._contracts:
                addr_map = {
                    "snx":    (self._cfg["snx_perps_market"], SNX_PERPS_MARKET_ABI),
                    "usdc":   (self._cfg["usdc"],             ERC20_ABI),
                    "weth":   (self._cfg["weth"],             ERC20_ABI),
                    "wsteth": (self._cfg["wsteth"],           WSTETH_ABI),
                    "router": (self._cfg["uniswap_router"],   UNI_ROUTER_ABI),
                    "quoter": (self._cfg["uniswap_quoter"],   UNI_QUOTER_V2_ABI),
                }
                addr, abi = addr_map[name]
                self._contracts[name] = w3.eth.contract(
                    address=Web3.to_checksum_address(addr), abi=abi
                )
        return self._contracts[name]

    def invalidate_contracts(self) -> None:
        with self._contract_lock:
            self._contracts.clear()

    # -------------------------------------------------------------------------
    # SNX account
    # -------------------------------------------------------------------------

    def get_or_create_snx_account(self) -> int:
        with self._snx_lock:
            if self._snx_account_id is not None:
                return self._snx_account_id

            # Try DB
            saved = self._db.load_snx_account_id()
            if saved:
                log.info("PositionExecutor: loaded SNX account %d from DB", saved)
                self._snx_account_id = saved
                return saved

            # Simulate mode
            if self._mode == "simulate":
                fake_id = 999001
                log.info("PositionExecutor [SIM]: using fake SNX account %d", fake_id)
                self._snx_account_id = fake_id
                self._db.save_snx_account_id(fake_id)
                return fake_id

            # Create on-chain
            log.info("PositionExecutor: creating new SNX account on-chain")
            w3, _ = self._w3_getter()
            snx = self._contract("snx", w3)
            nonce = w3.eth.get_transaction_count(self._account.address)
            tx = snx.functions.createAccount().build_transaction(
                self._gas_params(w3, nonce)
            )
            tx_hash = self._send(tx, w3)
            receipt = w3.eth.get_transaction_receipt(tx_hash)

            # Parse AccountCreated event
            account_id = None
            try:
                logs = snx.events.AccountCreated().process_receipt(receipt)
                if logs:
                    account_id = logs[0]["args"]["accountId"]
            except Exception as exc:
                log.warning("PositionExecutor: could not parse AccountCreated log — %s", exc)

            if account_id is None:
                raise RuntimeError("createAccount tx succeeded but could not extract accountId")

            log.info("PositionExecutor: SNX account created: %d", account_id)
            self._snx_account_id = account_id
            self._db.save_snx_account_id(account_id)
            return account_id

    # -------------------------------------------------------------------------
    # Open position
    # -------------------------------------------------------------------------

    def open(
        self, snap: FundingSnapshot, position_size_usdc: float
    ) -> Optional[HedgePosition]:
        pos = HedgePosition(
            position_id=str(uuid.uuid4()),
            status=PositionStatus.PENDING,
            opened_at=time.time(),
            closed_at=None,
            close_reason=None,
            spot=None,
            perp=None,
            funding_collected_usd=0.0,
            fees_paid_usd=0.0,
            net_profit_usd=0.0,
            rebalance_count=0,
            total_rebalance_cost=0.0,
            spot_tx1_price=snap.index_price_usd,
        )

        log.info(
            "PositionExecutor.open: starting — size $%.0f rate_8h=%.4f%% rate_annual=%.1f%%",
            position_size_usdc, snap.funding_rate_8h_pct, snap.funding_rate_annual,
        )

        # TX1 — Open spot leg
        spot = self._open_spot_leg(snap, position_size_usdc, pos)
        if spot is None:
            log.error("PositionExecutor.open: spot leg failed — aborting")
            pos.status = PositionStatus.FAILED
            return None
        pos.spot = spot
        pos.spot_tx1_price = spot.entry_price_usd

        # Abort-on-gap check
        current_price = self._fetch_price()
        if current_price is not None:
            gap_pct = abs(current_price - spot.entry_price_usd) / spot.entry_price_usd
            if gap_pct > ABORT_ON_GAP_THRESHOLD:
                log.warning(
                    "PositionExecutor.open: ABORT_ON_GAP — entry=%.2f current=%.2f gap=%.2f%%",
                    spot.entry_price_usd, current_price, gap_pct * 100,
                )
                self._db.log_event("ABORT_ON_GAP", f"gap={gap_pct:.4f} entry={spot.entry_price_usd:.2f} current={current_price:.2f}")
                self._alerter.send(f"⚠️ Agent Beta: ABORT_ON_GAP — price moved {gap_pct*100:.2f}% between TX1 and TX2. Unwinding spot.")
                # Unwind spot
                self._unwind_spot_abort(spot)
                pos.status = PositionStatus.FAILED
                return None

        # TX2 — Open perp leg
        perp = self._open_perp_leg(snap, position_size_usdc, spot.entry_price_usd, pos)
        if perp is None:
            log.error("PositionExecutor.open: perp leg failed — unwinding spot")
            self._unwind_spot_abort(spot)
            pos.status = PositionStatus.FAILED
            return None
        pos.perp = perp
        pos.status = PositionStatus.OPEN

        log.info(
            "PositionExecutor.open: POSITION OPEN %s — spot_price=%.2f perp_account=%d",
            pos.position_id, spot.entry_price_usd, perp.account_id,
        )
        return pos

    def _open_spot_leg(
        self, snap: FundingSnapshot, position_size_usdc: float, pos: HedgePosition
    ) -> Optional[SpotLeg]:
        usdc_amount_raw = int(position_size_usdc * (10 ** USDC_DECIMALS))

        if self._mode == "simulate":
            sim_weth = int(position_size_usdc / snap.index_price_usd * 10 ** 18)
            log.info(
                "[SIM] _open_spot_leg: buy %.6f WETH @ $%.2f, wrap to wstETH",
                sim_weth / 10 ** 18, snap.index_price_usd,
            )
            return SpotLeg(
                use_wsteth=True,
                weth_amount=sim_weth,
                wsteth_amount=int(sim_weth * 0.94),  # approximate wstETH ratio
                usdc_spent=usdc_amount_raw,
                entry_price_usd=snap.index_price_usd,
                tx_hash_buy="0xSIM_BUY_" + pos.position_id[:8],
                tx_hash_wrap="0xSIM_WRAP_" + pos.position_id[:8],
                opened_at=time.time(),
            )

        try:
            w3, _ = self._w3_getter()
            usdc_c  = self._contract("usdc",   w3)
            weth_c  = self._contract("weth",   w3)
            wsteth_c = self._contract("wsteth", w3)
            router_c = self._contract("router", w3)
            quoter_c = self._contract("quoter", w3)

            # Quote USDC → WETH
            quote = quoter_c.functions.quoteExactInputSingle((
                Web3.to_checksum_address(self._cfg["usdc"]),
                Web3.to_checksum_address(self._cfg["weth"]),
                usdc_amount_raw,
                UNI_USDC_WETH_FEE,
                0,
            )).call()
            weth_quote = quote[0]
            min_weth   = int(weth_quote * (10_000 - self._SLIPPAGE_BPS) // 10_000)
            entry_price = position_size_usdc / (weth_quote / 10 ** 18)

            nonce = w3.eth.get_transaction_count(self._account.address)
            nonce = self._ensure_approval(usdc_c, self._cfg["uniswap_router"], usdc_amount_raw, w3, nonce)

            # Swap USDC → WETH
            deadline = int(time.time()) + 180
            swap_tx = router_c.functions.exactInputSingle((
                Web3.to_checksum_address(self._cfg["usdc"]),
                Web3.to_checksum_address(self._cfg["weth"]),
                UNI_USDC_WETH_FEE,
                self._account.address,
                deadline,
                usdc_amount_raw,
                min_weth,
                0,
            )).build_transaction(self._gas_params(w3, nonce))
            buy_hash = self._send(swap_tx, w3)
            nonce += 1

            actual_weth = weth_c.functions.balanceOf(self._account.address).call()

            # Phase 1: hold plain WETH — wstETH.wrap() takes stETH not WETH, and on Base
            # wstETH is a bridged token with no native wrap() entrypoint. Aave deposit
            # upgrade is deferred to Phase 2.
            log.info("_open_spot_leg: holding %.6f WETH (wstETH upgrade deferred to Phase 2)", actual_weth / 10 ** 18)

            return SpotLeg(
                use_wsteth=False,
                weth_amount=actual_weth,
                wsteth_amount=0,
                usdc_spent=usdc_amount_raw,
                entry_price_usd=entry_price,
                tx_hash_buy=buy_hash,
                tx_hash_wrap="",
                opened_at=time.time(),
            )

        except Exception as exc:
            log.error("_open_spot_leg: %s", exc, exc_info=True)
            return None

    def _open_perp_leg(
        self,
        snap: FundingSnapshot,
        position_size_usdc: float,
        spot_price: float,
        pos: HedgePosition,
    ) -> Optional[PerpLeg]:
        account_id = self.get_or_create_snx_account()

        size_tokens = position_size_usdc / spot_price
        size_raw    = -int(size_tokens * SNX_SIZE_PRECISION)  # negative = short

        usdc_amount_raw = int(position_size_usdc * (10 ** USDC_DECIMALS))

        if self._mode == "simulate":
            collateral_raw = int(usdc_amount_raw * INITIAL_COLLATERAL_MULTIPLIER)
            log.info(
                "[SIM] _open_perp_leg: short %.4f ETH @ $%.2f collateral $%.0f",
                size_tokens, spot_price, collateral_raw / 10 ** USDC_DECIMALS,
            )
            return PerpLeg(
                account_id=account_id,
                market_id=SNX_ETH_MARKET_ID,
                size_tokens=size_tokens,
                size_raw=size_raw,
                collateral_usdc=collateral_raw,
                entry_price_usd=spot_price,
                entry_rate_8h_pct=snap.funding_rate_8h_pct,
                commit_tx="0xSIM_COMMIT_" + pos.position_id[:8],
                settle_tx="0xSIM_SETTLE_" + pos.position_id[:8],
                opened_at=time.time(),
                last_monitored=time.time(),
            )

        try:
            w3, _ = self._w3_getter()
            snx    = self._contract("snx",  w3)
            usdc_c = self._contract("usdc", w3)

            # Get required margins
            collateral_raw = 0
            try:
                margins = snx.functions.getRequiredMargins(
                    account_id, SNX_ETH_MARKET_ID, size_raw
                ).call()
                req_initial = margins[0]
                collateral_raw = int(req_initial * INITIAL_COLLATERAL_MULTIPLIER)
            except Exception as margin_exc:
                log.warning("_open_perp_leg: getRequiredMargins failed — %s — using 25%% of notional", margin_exc)
                collateral_raw = int(usdc_amount_raw * 0.25 * INITIAL_COLLATERAL_MULTIPLIER)

            # Deposit collateral
            nonce = w3.eth.get_transaction_count(self._account.address)
            nonce = self._ensure_approval(usdc_c, self._cfg["snx_perps_market"], collateral_raw, w3, nonce)

            deposit_tx = snx.functions.modifyCollateral(
                account_id, SNX_USDC_SYNTH_ID, collateral_raw
            ).build_transaction(self._gas_params(w3, nonce))
            self._send(deposit_tx, w3)
            nonce += 1

            # Acceptable price with 1% slippage for short (accept higher prices)
            acceptable_price = int(spot_price * 1.01 * SNX_PRICE_PRECISION)

            # Commit order
            commit_tx_data = snx.functions.commitOrder((
                SNX_ETH_MARKET_ID,
                account_id,
                size_raw,
                SNX_SETTLEMENT_STRATEGY_ID,
                acceptable_price,
                _TRACKING_CODE,
                "0x0000000000000000000000000000000000000000",
            )).build_transaction(self._gas_params(w3, nonce))

            commit_hash = ""
            try:
                commit_hash = self._send(commit_tx_data, w3)
                nonce += 1
            except Exception as commit_exc:
                log.error("_open_perp_leg: commitOrder failed — %s — withdrawing collateral", commit_exc)
                self._withdraw_collateral(account_id, collateral_raw)
                return None

            # Wait for SNX settlement window then check/settle
            log.info("_open_perp_leg: waiting %.1fs for SNX keeper settlement", SNX_SETTLEMENT_DELAY_S + 1.0)
            time.sleep(SNX_SETTLEMENT_DELAY_S + 1.0)

            # Check if keeper has already settled; only call settleOrder if order still open
            settle_hash = ""
            try:
                open_order = snx.functions.getOpenOrder(account_id, SNX_ETH_MARKET_ID).call()
                order_still_open = open_order[0] > 0  # commitmentTime > 0 means pending
            except Exception:
                order_still_open = True  # assume open if check fails, attempt settle

            if order_still_open:
                try:
                    settle_tx_data = snx.functions.settleOrder(
                        account_id, SNX_ETH_MARKET_ID
                    ).build_transaction(self._gas_params(w3, nonce))
                    settle_hash = self._send(settle_tx_data, w3)
                except Exception as settle_exc:
                    # Keeper may have settled between our check and our call — verify position opened
                    log.warning("_open_perp_leg: settleOrder failed — checking if keeper settled — %s", settle_exc)
                    try:
                        _, _, pos_size = snx.functions.getOpenPosition(account_id, SNX_ETH_MARKET_ID).call()
                        if pos_size == 0:
                            log.error("_open_perp_leg: settle failed and position is zero — withdrawing collateral")
                            self._withdraw_collateral(account_id, collateral_raw)
                            return None
                        log.info("_open_perp_leg: keeper settled for us, position size=%d", pos_size)
                        settle_hash = "keeper_settled"
                    except Exception as check_exc:
                        log.error("_open_perp_leg: cannot verify position — %s", check_exc)
                        self._withdraw_collateral(account_id, collateral_raw)
                        return None
            else:
                log.info("_open_perp_leg: keeper already settled order")

            log.info(
                "_open_perp_leg: short open — account=%d size=%.4f ETH collateral=$%.0f",
                account_id, size_tokens, collateral_raw / 10 ** USDC_DECIMALS,
            )
            return PerpLeg(
                account_id=account_id,
                market_id=SNX_ETH_MARKET_ID,
                size_tokens=size_tokens,
                size_raw=size_raw,
                collateral_usdc=collateral_raw,
                entry_price_usd=spot_price,
                entry_rate_8h_pct=snap.funding_rate_8h_pct,
                commit_tx=commit_hash,
                settle_tx=settle_hash,
                opened_at=time.time(),
                last_monitored=time.time(),
            )

        except Exception as exc:
            log.error("_open_perp_leg: %s", exc, exc_info=True)
            return None

    # -------------------------------------------------------------------------
    # Close position
    # -------------------------------------------------------------------------

    def close(self, pos: HedgePosition, reason: str) -> bool:
        log.info(
            "PositionExecutor.close: %s reason=%s",
            pos.position_id, reason,
        )
        pos.status = PositionStatus.CLOSING

        perp_ok = self._close_perp_leg(pos)
        spot_ok = self._close_spot_leg(pos)

        if perp_ok and spot_ok:
            self._calculate_final_pnl(pos)
            pos.status      = PositionStatus.CLOSED
            pos.closed_at   = time.time()
            pos.close_reason = reason
            log.info(
                "PositionExecutor.close: CLOSED %s net_profit=$%.4f",
                pos.position_id, pos.net_profit_usd,
            )
            return True
        else:
            pos.status = PositionStatus.FAILED
            msg = f"🚨 Agent Beta CRITICAL: position {pos.position_id[:8]} close FAILED — perp_ok={perp_ok} spot_ok={spot_ok}"
            self._alerter.send(msg)
            log.error("PositionExecutor.close: FAILED %s", pos.position_id)
            return False

    def _close_perp_leg(self, pos: HedgePosition) -> bool:
        if pos.perp is None:
            return True

        if self._mode == "simulate":
            log.info("[SIM] _close_perp_leg: closing short %.4f ETH", pos.perp.size_tokens)
            elapsed_8h = (time.time() - pos.perp.opened_at) / (8 * 3600)
            pos.perp.accrued_funding_usd = (
                abs(pos.perp.entry_rate_8h_pct / 100)
                * pos.perp.size_tokens
                * pos.perp.entry_price_usd
                * elapsed_8h
            )
            pos.funding_collected_usd = pos.perp.accrued_funding_usd
            return True

        try:
            w3, _ = self._w3_getter()
            snx  = self._contract("snx", w3)
            nonce = w3.eth.get_transaction_count(self._account.address)

            # Close short → positive sizeDelta (exact opposite)
            close_size   = abs(pos.perp.size_raw)
            accept_price = int(pos.perp.entry_price_usd * 0.99 * SNX_PRICE_PRECISION)

            commit_tx = snx.functions.commitOrder((
                SNX_ETH_MARKET_ID,
                pos.perp.account_id,
                close_size,
                SNX_SETTLEMENT_STRATEGY_ID,
                accept_price,
                _TRACKING_CODE,
                "0x0000000000000000000000000000000000000000",
            )).build_transaction(self._gas_params(w3, nonce))
            self._send(commit_tx, w3)
            nonce += 1

            time.sleep(SNX_SETTLEMENT_DELAY_S + 1.0)

            # Check if keeper already settled before calling settleOrder
            try:
                open_order = snx.functions.getOpenOrder(pos.perp.account_id, SNX_ETH_MARKET_ID).call()
                order_still_open = open_order[0] > 0
            except Exception:
                order_still_open = True

            if order_still_open:
                try:
                    settle_tx = snx.functions.settleOrder(
                        pos.perp.account_id, SNX_ETH_MARKET_ID
                    ).build_transaction(self._gas_params(w3, nonce))
                    self._send(settle_tx, w3)
                    nonce += 1
                except Exception as settle_exc:
                    log.warning("_close_perp_leg: settleOrder failed — checking if keeper settled — %s", settle_exc)
                    try:
                        _, _, pos_size = snx.functions.getOpenPosition(pos.perp.account_id, SNX_ETH_MARKET_ID).call()
                        if pos_size != 0:
                            log.error("_close_perp_leg: position still open after settle failure — manual intervention required")
                            return False
                        log.info("_close_perp_leg: keeper settled close for us")
                    except Exception as check_exc:
                        log.error("_close_perp_leg: cannot verify close — %s", check_exc)
                        return False
            else:
                log.info("_close_perp_leg: keeper already settled close order")

            # Read available margin then withdraw
            available = snx.functions.getAvailableMargin(pos.perp.account_id).call()
            if available > 0:
                self._withdraw_collateral(pos.perp.account_id, available)

            pos.funding_collected_usd = pos.perp.accrued_funding_usd
            return True

        except Exception as exc:
            log.error("_close_perp_leg: %s", exc, exc_info=True)
            return False

    def _close_spot_leg(self, pos: HedgePosition) -> bool:
        if pos.spot is None:
            return True

        if self._mode == "simulate":
            current_price = self._fetch_price() or pos.spot.entry_price_usd
            usdc_returned = pos.spot.weth_amount / 10 ** 18 * current_price
            log.info(
                "[SIM] _close_spot_leg: sell %.6f WETH → $%.2f",
                pos.spot.weth_amount / 10 ** 18, usdc_returned,
            )
            return True

        try:
            w3, _  = self._w3_getter()
            wsteth_c = self._contract("wsteth", w3)
            router_c = self._contract("router", w3)
            weth_c   = self._contract("weth",   w3)
            nonce    = w3.eth.get_transaction_count(self._account.address)

            weth_to_sell = pos.spot.weth_amount

            if pos.spot.use_wsteth and pos.spot.wsteth_amount > 0:
                try:
                    # unwrap wstETH → WETH
                    nonce = self._ensure_approval(wsteth_c, self._cfg["uniswap_router"], pos.spot.wsteth_amount, w3, nonce)
                    unwrap_tx = wsteth_c.functions.unwrap(
                        pos.spot.wsteth_amount
                    ).build_transaction(self._gas_params(w3, nonce))
                    self._send(unwrap_tx, w3)
                    nonce += 1
                    weth_to_sell = weth_c.functions.balanceOf(self._account.address).call()
                except Exception as unwrap_exc:
                    log.warning("_close_spot_leg: unwrap failed — selling wstETH directly. %s", unwrap_exc)
                    # Sell wstETH directly via Uniswap (use wsteth_amount)
                    weth_to_sell = 0

            if weth_to_sell > 0:
                nonce = self._ensure_approval(weth_c, self._cfg["uniswap_router"], weth_to_sell, w3, nonce)
                current_price = self._fetch_price() or pos.spot.entry_price_usd
                min_usdc = int(
                    weth_to_sell / 10 ** 18 * current_price
                    * (10_000 - self._SLIPPAGE_BPS) / 10_000
                    * 10 ** USDC_DECIMALS
                )
                deadline = int(time.time()) + 180
                sell_tx = router_c.functions.exactInputSingle((
                    Web3.to_checksum_address(self._cfg["weth"]),
                    Web3.to_checksum_address(self._cfg["usdc"]),
                    UNI_WETH_USDC_FEE,
                    self._account.address,
                    deadline,
                    weth_to_sell,
                    min_usdc,
                    0,
                )).build_transaction(self._gas_params(w3, nonce))
                self._send(sell_tx, w3)

            log.info("_close_spot_leg: sold spot leg successfully")
            return True

        except Exception as exc:
            log.error("_close_spot_leg: %s", exc, exc_info=True)
            return False

    def _unwind_spot_abort(self, spot: SpotLeg) -> None:
        """Sell WETH/wstETH immediately on abort-on-gap."""
        if self._mode == "simulate":
            log.info("[SIM] _unwind_spot_abort: selling spot back to USDC")
            return
        try:
            w3, _ = self._w3_getter()
            wsteth_c = self._contract("wsteth", w3)
            router_c = self._contract("router", w3)
            weth_c   = self._contract("weth",   w3)
            nonce    = w3.eth.get_transaction_count(self._account.address)
            weth_to_sell = spot.weth_amount

            if spot.use_wsteth and spot.wsteth_amount > 0:
                try:
                    unwrap_tx = wsteth_c.functions.unwrap(
                        spot.wsteth_amount
                    ).build_transaction(self._gas_params(w3, nonce))
                    self._send(unwrap_tx, w3)
                    nonce += 1
                    weth_to_sell = weth_c.functions.balanceOf(self._account.address).call()
                except Exception as exc2:
                    log.error("_unwind_spot_abort: unwrap failed — %s", exc2)

            if weth_to_sell > 0:
                nonce = self._ensure_approval(weth_c, self._cfg["uniswap_router"], weth_to_sell, w3, nonce)
                current_price = self._fetch_price() or spot.entry_price_usd
                min_usdc = int(
                    weth_to_sell / 10 ** 18 * current_price * 0.98 * 10 ** USDC_DECIMALS
                )
                deadline = int(time.time()) + 180
                sell_tx = router_c.functions.exactInputSingle((
                    Web3.to_checksum_address(self._cfg["weth"]),
                    Web3.to_checksum_address(self._cfg["usdc"]),
                    UNI_WETH_USDC_FEE,
                    self._account.address,
                    deadline,
                    weth_to_sell,
                    min_usdc,
                    0,
                )).build_transaction(self._gas_params(w3, nonce))
                self._send(sell_tx, w3)
            log.info("_unwind_spot_abort: spot unwound successfully")
        except Exception as exc:
            log.error("_unwind_spot_abort: %s", exc, exc_info=True)

    def _withdraw_collateral(self, account_id: int, amount: int) -> None:
        """modifyCollateral with negative delta to withdraw."""
        if self._mode == "simulate":
            log.info("[SIM] _withdraw_collateral: withdraw $%.2f from account %d", amount / 10 ** USDC_DECIMALS, account_id)
            return
        try:
            w3, _ = self._w3_getter()
            snx   = self._contract("snx", w3)
            nonce = w3.eth.get_transaction_count(self._account.address)
            tx = snx.functions.modifyCollateral(
                account_id, SNX_USDC_SYNTH_ID, -amount
            ).build_transaction(self._gas_params(w3, nonce))
            self._send(tx, w3)
            log.info("_withdraw_collateral: withdrew $%.4f from SNX account %d", amount / 10 ** USDC_DECIMALS, account_id)
        except Exception as exc:
            log.error("_withdraw_collateral: %s", exc, exc_info=True)

    # -------------------------------------------------------------------------
    # Rebalance + collateral management
    # -------------------------------------------------------------------------

    def rebalance_spot(self, pos: HedgePosition, current_price: float) -> bool:
        if pos.spot is None or pos.perp is None:
            return False

        target_weth = pos.perp.size_tokens
        current_weth = pos.spot.weth_amount / 10 ** 18
        drift_weth   = target_weth - current_weth
        drift_usd    = abs(drift_weth) * current_price
        direction    = "buy" if drift_weth > 0 else "sell"

        log.info(
            "rebalance_spot: drift_weth=%.6f drift_usd=$%.2f direction=%s",
            drift_weth, drift_usd, direction,
        )

        if self._mode == "simulate":
            cost_est = drift_usd * 0.001  # 0.1% estimated cost
            pos.rebalance_count       += 1
            pos.total_rebalance_cost  += cost_est
            pos.fees_paid_usd         += cost_est
            log.info("[SIM] rebalance_spot: simulated %s $%.2f cost=$%.4f", direction, drift_usd, cost_est)
            return True

        try:
            w3, _    = self._w3_getter()
            usdc_c   = self._contract("usdc",   w3)
            weth_c   = self._contract("weth",   w3)
            router_c = self._contract("router", w3)
            nonce    = w3.eth.get_transaction_count(self._account.address)
            deadline = int(time.time()) + 180

            if direction == "buy":
                usdc_in = int(drift_usd * 10 ** USDC_DECIMALS)
                min_out = int(abs(drift_weth) * 10 ** 18 * 0.997)
                nonce = self._ensure_approval(usdc_c, self._cfg["uniswap_router"], usdc_in, w3, nonce)
                tx = router_c.functions.exactInputSingle((
                    Web3.to_checksum_address(self._cfg["usdc"]),
                    Web3.to_checksum_address(self._cfg["weth"]),
                    UNI_USDC_WETH_FEE,
                    self._account.address,
                    deadline,
                    usdc_in,
                    min_out,
                    0,
                )).build_transaction(self._gas_params(w3, nonce))
            else:
                weth_in = int(abs(drift_weth) * 10 ** 18)
                min_out = int(drift_usd * 10 ** USDC_DECIMALS * 0.997)
                nonce = self._ensure_approval(weth_c, self._cfg["uniswap_router"], weth_in, w3, nonce)
                tx = router_c.functions.exactInputSingle((
                    Web3.to_checksum_address(self._cfg["weth"]),
                    Web3.to_checksum_address(self._cfg["usdc"]),
                    UNI_WETH_USDC_FEE,
                    self._account.address,
                    deadline,
                    weth_in,
                    min_out,
                    0,
                )).build_transaction(self._gas_params(w3, nonce))

            self._send(tx, w3)
            cost_est = drift_usd * 0.001
            pos.rebalance_count      += 1
            pos.total_rebalance_cost += cost_est
            pos.fees_paid_usd        += cost_est
            log.info("rebalance_spot: %s complete cost≈$%.4f", direction, cost_est)
            return True

        except Exception as exc:
            log.error("rebalance_spot: %s", exc, exc_info=True)
            return False

    def add_collateral(self, pos: HedgePosition, amount_usdc: float) -> bool:
        if pos.perp is None:
            return False
        amount_raw = int(amount_usdc * 10 ** USDC_DECIMALS)

        if self._mode == "simulate":
            pos.perp.collateral_usdc += amount_raw
            log.info("[SIM] add_collateral: added $%.2f to account %d", amount_usdc, pos.perp.account_id)
            return True

        try:
            w3, _  = self._w3_getter()
            snx    = self._contract("snx",  w3)
            usdc_c = self._contract("usdc", w3)
            nonce  = w3.eth.get_transaction_count(self._account.address)
            nonce  = self._ensure_approval(usdc_c, self._cfg["snx_perps_market"], amount_raw, w3, nonce)
            tx = snx.functions.modifyCollateral(
                pos.perp.account_id, SNX_USDC_SYNTH_ID, amount_raw
            ).build_transaction(self._gas_params(w3, nonce))
            self._send(tx, w3)
            pos.perp.collateral_usdc += amount_raw
            log.info("add_collateral: added $%.2f collateral", amount_usdc)
            return True
        except Exception as exc:
            log.error("add_collateral: %s", exc, exc_info=True)
            return False

    # -------------------------------------------------------------------------
    # Utility
    # -------------------------------------------------------------------------

    def _ensure_approval(
        self,
        token_contract,
        spender: str,
        amount: int,
        w3: Web3,
        nonce: int,
    ) -> int:
        try:
            owner = self._account.address
            allowance = token_contract.functions.allowance(
                owner, Web3.to_checksum_address(spender)
            ).call()
            if allowance >= amount:
                return nonce
            approve_tx = token_contract.functions.approve(
                Web3.to_checksum_address(spender), amount
            ).build_transaction(self._gas_params(w3, nonce))
            self._send(approve_tx, w3)
            log.debug("_ensure_approval: approved %s for exact amount %d", spender[:10], amount)
            return nonce + 1
        except Exception as exc:
            log.error("_ensure_approval: %s", exc, exc_info=True)
            return nonce

    def _gas_params(self, w3: Web3, nonce: int) -> dict:
        try:
            block   = w3.eth.get_block("latest")
            base    = block.get("baseFeePerGas", Web3.to_wei("0.005", "gwei"))
            priority = Web3.to_wei("0.001", "gwei")
            max_fee  = base * 2 + priority
        except Exception:
            max_fee  = Web3.to_wei("0.015", "gwei")
            priority = Web3.to_wei("0.001", "gwei")

        return {
            "from":                 self._account.address,
            "nonce":                nonce,
            "maxFeePerGas":         max_fee,
            "maxPriorityFeePerGas": priority,
            "chainId":              self._cfg["chain_id"],
            "type":                 2,
        }

    def _send(self, tx: dict, w3: Web3) -> str:
        signed  = self._account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        if receipt["status"] == 0:
            raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")
        log.debug("TX confirmed: %s block=%d", tx_hash.hex(), receipt["blockNumber"])
        return tx_hash.hex()

    def _fetch_price(self) -> Optional[float]:
        try:
            w3, _ = self._w3_getter()
            snx   = self._contract("snx", w3)
            raw   = snx.functions.indexPrice(SNX_ETH_MARKET_ID).call()
            return raw / SNX_PRICE_PRECISION
        except Exception as exc:
            log.warning("_fetch_price: %s", exc)
            return None

    def _calculate_final_pnl(self, pos: HedgePosition) -> None:
        staking_yield = pos.spot.staking_yield_usd if pos.spot else 0.0
        pos.net_profit_usd = (
            pos.funding_collected_usd
            + staking_yield
            - pos.fees_paid_usd
        )
        log.info(
            "_calculate_final_pnl: funding=$%.4f staking=$%.4f fees=$%.4f net=$%.4f",
            pos.funding_collected_usd, staking_yield, pos.fees_paid_usd, pos.net_profit_usd,
        )

# =============================================================================
# SECTION 15 — PerformanceTracker
# =============================================================================

class PerformanceTracker:
    """Tracks session-level performance metrics."""

    def __init__(self):
        self._lock = threading.Lock()

        self.scans               = 0
        self.monitor_cycles      = 0
        self.positions_opened    = 0
        self.positions_closed    = 0
        self.wins                = 0
        self.losses              = 0
        self.emergency_closes    = 0
        self.margin_alerts       = 0
        self.rebalances          = 0
        self.total_funding_usd   = 0.0
        self.total_staking_usd   = 0.0
        self.total_fees_usd      = 0.0
        self.net_profit_usd      = 0.0
        self.consecutive_failures = 0
        self._started_at         = time.time()

    def record_scan(self) -> None:
        with self._lock:
            self.scans += 1

    def record_monitor(self) -> None:
        with self._lock:
            self.monitor_cycles += 1

    def record_open(self) -> None:
        with self._lock:
            self.positions_opened    += 1
            self.consecutive_failures = 0

    def record_success(self) -> None:
        with self._lock:
            self.consecutive_failures = 0

    def record_close(self, pos: "HedgePosition") -> None:
        with self._lock:
            self.positions_closed += 1
            self.total_funding_usd += pos.funding_collected_usd
            staking = pos.spot.staking_yield_usd if pos.spot else 0.0
            self.total_staking_usd += staking
            self.total_fees_usd    += pos.fees_paid_usd
            self.net_profit_usd    += pos.net_profit_usd
            if pos.net_profit_usd > 0:
                self.wins += 1
            else:
                self.losses += 1

    def record_error(self) -> None:
        with self._lock:
            self.consecutive_failures += 1

    def record_emergency(self) -> None:
        with self._lock:
            self.emergency_closes += 1

    def record_margin_alert(self) -> None:
        with self._lock:
            self.margin_alerts += 1

    def record_rebalance(self) -> None:
        with self._lock:
            self.rebalances += 1

    @property
    def win_rate(self) -> float:
        with self._lock:
            total = self.wins + self.losses
            return self.wins / total if total > 0 else 0.0

    def print_summary(self) -> None:
        uptime_h = (time.time() - self._started_at) / 3600
        log.info(
            "\n"
            "============================================================\n"
            "  Agent Beta — Performance Summary\n"
            "============================================================\n"
            "  Uptime:              %.1fh\n"
            "  Scans:               %d\n"
            "  Monitor cycles:      %d\n"
            "  Positions opened:    %d\n"
            "  Positions closed:    %d\n"
            "  Win rate:            %.1f%%\n"
            "  Emergency closes:    %d\n"
            "  Margin alerts:       %d\n"
            "  Rebalances:          %d\n"
            "  Funding collected:   $%.4f\n"
            "  Staking yield:       $%.4f\n"
            "  Fees paid:           $%.4f\n"
            "  Net profit:          $%.4f\n"
            "============================================================",
            uptime_h,
            self.scans,
            self.monitor_cycles,
            self.positions_opened,
            self.positions_closed,
            self.win_rate * 100,
            self.emergency_closes,
            self.margin_alerts,
            self.rebalances,
            self.total_funding_usd,
            self.total_staking_usd,
            self.total_fees_usd,
            self.net_profit_usd,
        )

# =============================================================================
# SECTION 16 — AgentBeta (main orchestrator)
# =============================================================================

class AgentBeta:
    """Main orchestrator — wires all components together."""

    def __init__(
        self,
        network: str,
        mode: str,
        position_size_usdc: float,
        min_daily_profit: float,
        db_path: str,
    ):
        self._network_name      = network
        self._mode              = mode
        self._position_size     = max(MIN_POSITION_SIZE_USDC, min(position_size_usdc, MAX_POSITION_SIZE_USDC))
        self._min_daily_profit  = min_daily_profit
        self._cfg               = NETWORKS[network]

        # Positions registry
        self._positions: Dict[str, HedgePosition] = {}
        self._pos_lock = threading.Lock()

        # Infrastructure
        self._rpc     = RPCPool(self._cfg)
        self._ws      = BlockSubscriber(self._cfg.get("ws_url", ""))
        self._db      = Database(db_path)
        self._alerter = Alerter()
        self._cb      = CircuitBreaker()
        self._perf    = PerformanceTracker()

        # Contract-dependent
        self._gas_estimator = GasEstimator(lambda: self._rpc.get_w3(), self._cfg)
        self._oracle        = FundingRateOracle(lambda: self._rpc.get_w3(), self._cfg)
        self._threshold     = ThresholdCalculator(self._gas_estimator, self._position_size)

        # Account
        if mode == "live":
            pk = os.getenv("PRIVATE_KEY", "")
            if not pk:
                log.critical("PRIVATE_KEY not set — cannot run in live mode")
                sys.exit(1)
            self._account: LocalAccount = Account.from_key(pk)
            log.info("Live wallet: %s", self._account.address)
        else:
            self._account = Account.create()
            log.info("Simulate wallet (throwaway): %s", self._account.address)

        self._executor = PositionExecutor(
            w3_getter=lambda: self._rpc.get_w3(),
            cfg=self._cfg,
            account=self._account,
            mode=mode,
            db=self._db,
            alerter=self._alerter,
        )

        self._scan_count      = 0
        self._last_rpc_url    = ""
        self._stopped         = False

        # Crash recovery — reload any positions left open from a previous run
        self._recover_open_positions()

    # -------------------------------------------------------------------------
    # Run
    # -------------------------------------------------------------------------

    def _recover_open_positions(self) -> None:
        """On startup, reload any OPEN/PENDING positions from DB to prevent double-entry after crash."""
        rows = self._db.load_open_positions(self._network_name, self._mode)
        if not rows:
            return
        log.warning("CRASH RECOVERY: found %d open position(s) in DB — reloading into monitor", len(rows))
        for row in rows:
            try:
                spot = SpotLeg(
                    use_wsteth=bool(row.get("spot_use_wsteth", 0)),
                    weth_amount=int(row["spot_weth_amount"] or 0),
                    wsteth_amount=int(row["spot_wsteth_amount"] or 0),
                    usdc_spent=int(row["spot_usdc_spent"] or 0),
                    entry_price_usd=row["spot_entry_price_usd"] or 0.0,
                    tx_hash_buy=row.get("spot_tx_buy") or "",
                    tx_hash_wrap=row.get("spot_tx_wrap") or "",
                    staking_yield_usd=row.get("spot_staking_yield_usd") or 0.0,
                    opened_at=row.get("opened_at") or time.time(),
                ) if row.get("spot_entry_price_usd") else None

                perp = PerpLeg(
                    account_id=int(row["perp_account_id"] or 0),
                    market_id=row.get("perp_market_id") or SNX_ETH_MARKET_ID,
                    size_tokens=row.get("perp_size_tokens") or 0.0,
                    size_raw=0,  # not stored; only needed for new orders
                    collateral_usdc=int(row["perp_collateral_usdc"] or 0),
                    entry_price_usd=row.get("perp_entry_price_usd") or 0.0,
                    entry_rate_8h_pct=row.get("perp_entry_rate_8h") or 0.0,
                    commit_tx=row.get("perp_commit_tx") or "",
                    settle_tx=row.get("perp_settle_tx") or "",
                    accrued_funding_usd=row.get("perp_accrued_funding") or 0.0,
                    unrealised_pnl_usd=row.get("perp_unrealised_pnl") or 0.0,
                    opened_at=row.get("opened_at") or time.time(),
                    last_monitored=time.time(),
                ) if row.get("perp_account_id") else None

                pos = HedgePosition(
                    position_id=row["position_id"],
                    status=PositionStatus(row["status"]),
                    spot=spot,
                    perp=perp,
                    opened_at=row.get("opened_at") or time.time(),
                    closed_at=None,
                    close_reason=None,
                    funding_collected_usd=row.get("funding_collected_usd") or 0.0,
                    fees_paid_usd=row.get("fees_paid_usd") or 0.0,
                    net_profit_usd=0.0,
                    rebalance_count=row.get("rebalance_count") or 0,
                    total_rebalance_cost=row.get("total_rebalance_cost") or 0.0,
                    spot_tx1_price=row.get("spot_tx1_price") or 0.0,
                )
                with self._pos_lock:
                    self._positions[pos.position_id] = pos
                log.warning(
                    "CRASH RECOVERY: restored position %s status=%s opened=%.0f",
                    pos.position_id[:8], pos.status.value, pos.opened_at,
                )
            except Exception as exc:
                log.error("CRASH RECOVERY: failed to restore row %s — %s", row.get("position_id"), exc)

    def run(self) -> None:
        self._print_banner()
        self._alerter.send(
            f"🚀 Agent Beta started\n"
            f"Network: {self._network_name}\n"
            f"Mode: {self._mode}\n"
            f"Position size: ${self._position_size:,.0f}"
        )

        # Monitor loop on daemon thread
        monitor_thread = threading.Thread(
            target=self._monitor_loop, daemon=True, name="MonitorLoop"
        )
        monitor_thread.start()

        try:
            while not self._stopped:
                block = self._current_block()
                self.scan(block)
                self._scan_count += 1

                if self._scan_count % 10 == 0:
                    self._perf.print_summary()

                # Cadencing
                if self._ws.is_connected:
                    for _ in range(SCAN_INTERVAL_S):
                        if self._stopped:
                            break
                        self._ws.wait_for_block(timeout=1.0)
                else:
                    time.sleep(SCAN_INTERVAL_S)

        except KeyboardInterrupt:
            log.info("KeyboardInterrupt received — shutting down")
            self._shutdown()

    # -------------------------------------------------------------------------
    # Scan loop
    # -------------------------------------------------------------------------

    def scan(self, block_number: int) -> None:
        if self._cb.is_open():
            return

        # RPC failover detection
        _, current_url = self._rpc.get_w3()
        if current_url != self._last_rpc_url and self._last_rpc_url:
            log.warning("scan: RPC failover detected — invalidating contracts")
            self._oracle.invalidate()
            self._executor.invalidate_contracts()
        self._last_rpc_url = current_url

        snap = self._oracle.fetch(block_number)
        if snap is None:
            log.error("scan: oracle returned None — incrementing failure counter")
            self._perf.record_error()
            self._cb.check(self._perf.consecutive_failures)
            return

        thresh = self._threshold.calculate(snap)
        self._perf.record_scan()
        self._perf.record_success()

        active = self._active_positions()

        log.info(
            "SCAN #%d block=%d | rate_8h=%.4f%% annual=%.1f%% | "
            "entry_thresh=%.1f%% exit_thresh=%.4f%% | ETH=$%.2f | open=%d",
            self._scan_count,
            block_number,
            snap.funding_rate_8h_pct,
            snap.funding_rate_annual,
            thresh.entry_annual_pct,
            thresh.exit_8h_pct,
            snap.index_price_usd,
            len(active),
        )

        # Emergency exit
        if thresh.emergency_exit and active:
            log.warning("scan: EMERGENCY EXIT — funding rate went negative")
            for pos in active:
                self._close_position(pos, "emergency_negative_rate")
                self._perf.record_emergency()
            self._alerter.send(
                "🚨 Agent Beta: EMERGENCY EXIT — funding rate flipped negative. All positions closed."
            )
            return

        # Exit check
        if active and snap.funding_rate_8h_pct < thresh.exit_8h_pct:
            log.info("scan: funding below exit threshold (%.4f%% < %.4f%%) — closing", snap.funding_rate_8h_pct, thresh.exit_8h_pct)
            for pos in active:
                self._close_position(pos, f"exit_threshold_rate={snap.funding_rate_8h_pct:.4f}")
            return

        # High-yield alert
        if snap.funding_rate_annual > 150 and not active:
            self._alerter.send(
                f"💰 Agent Beta: HIGH YIELD ALERT\n"
                f"Rate: {snap.funding_rate_annual:.1f}% APY\n"
                f"8h rate: {snap.funding_rate_8h_pct:.4f}%\n"
                f"ETH: ${snap.index_price_usd:.2f}"
            )

        # Entry check
        if not active and snap.funding_rate_annual >= thresh.entry_annual_pct:
            # OI headroom guard — skip if our position would be >10% of remaining cap
            oi_ok = True
            if snap.max_oi_usd > 0:
                remaining_oi = snap.max_oi_usd - snap.oi_usd
                if self._position_size > remaining_oi * 0.90:
                    log.warning(
                        "scan: skipping entry — position $%.0f exceeds 90%% of remaining OI headroom $%.0f (max=$%.0f current=$%.0f)",
                        self._position_size, remaining_oi, snap.max_oi_usd, snap.oi_usd,
                    )
                    oi_ok = False

            if oi_ok:
                est_daily = (snap.funding_rate_8h_pct / 100) * self._position_size * 3
                est_net   = est_daily - thresh.gas_total_usdc

                if est_net >= self._min_daily_profit:
                    log.info(
                        "scan: ENTRY — annual=%.1f%% est_daily=$%.4f est_net=$%.4f oi=$%.0f/%.0f",
                        snap.funding_rate_annual, est_daily, est_net, snap.oi_usd, snap.max_oi_usd,
                    )
                    pos = self._executor.open(snap, self._position_size)
                    if pos is not None:
                        self._register_position(pos)
                    else:
                        self._perf.record_error()
                        self._cb.check(self._perf.consecutive_failures)
                else:
                    log.info(
                        "scan: qualifies (%.1f%% APY) but est_net=$%.4f below min=$%.2f",
                        snap.funding_rate_annual, est_net, self._min_daily_profit,
                    )
        elif active:
            log.info("scan: holding %d position(s) — rate=%.4f%%", len(active), snap.funding_rate_8h_pct)
        else:
            log.info(
                "scan: no entry — rate %.1f%% APY < threshold %.1f%% APY",
                snap.funding_rate_annual, thresh.entry_annual_pct,
            )

    # -------------------------------------------------------------------------
    # Monitor loop
    # -------------------------------------------------------------------------

    def _monitor_loop(self) -> None:
        while not self._stopped:
            time.sleep(MONITOR_INTERVAL_S)
            active = self._active_positions()
            if not active:
                continue
            block = self._current_block()
            self.monitor(block)

    def monitor(self, block_number: int) -> None:
        self._perf.record_monitor()
        active = self._active_positions()
        for pos in active:
            try:
                self._monitor_position(pos, block_number)
            except Exception as exc:
                log.error("monitor: unhandled error for %s — %s", pos.position_id[:8], exc, exc_info=True)

    def _monitor_position(self, pos: HedgePosition, block_number: int) -> None:
        if pos.perp is None or pos.spot is None:
            return

        margin_ratio   = 0.5  # assume healthy until updated
        current_price  = pos.spot.entry_price_usd
        delta_drift_pct = 0.0

        if self._mode == "live":
            try:
                w3, _ = self._rpc.get_w3()
                # We need to build the snx contract locally here
                snx = w3.eth.contract(
                    address=Web3.to_checksum_address(self._cfg["snx_perps_market"]),
                    abi=SNX_PERPS_MARKET_ABI,
                )

                # Open position data
                total_pnl, accrued_funding, position_size = snx.functions.getOpenPosition(
                    pos.perp.account_id, SNX_ETH_MARKET_ID
                ).call()

                pos.perp.unrealised_pnl_usd  = total_pnl / SNX_PRICE_PRECISION
                pos.perp.accrued_funding_usd = accrued_funding / SNX_PRICE_PRECISION
                pos.funding_collected_usd    = pos.perp.accrued_funding_usd

                # External liquidation detection
                if position_size == 0 and pos.status == PositionStatus.OPEN:
                    log.error(
                        "_monitor_position: positionSize == 0 — external liquidation detected for %s",
                        pos.position_id[:8],
                    )
                    self._alerter.send(
                        f"🚨 Agent Beta: LIQUIDATION DETECTED\n"
                        f"Position {pos.position_id[:8]} was liquidated externally!\n"
                        f"Closing spot leg."
                    )
                    self._executor._close_spot_leg(pos)
                    pos.status = PositionStatus.FAILED
                    pos.closed_at = time.time()
                    pos.close_reason = "external_liquidation"
                    self._db.upsert_position(pos, self._network_name, self._mode)
                    return

                # Available margin → ratio
                available_margin = snx.functions.getAvailableMargin(pos.perp.account_id).call()
                collateral_usd   = pos.perp.collateral_usdc / 10 ** USDC_DECIMALS
                margin_ratio     = max(0.0, available_margin / SNX_PRICE_PRECISION / collateral_usd) if collateral_usd > 0 else 0.0

                # Current price
                price_raw    = snx.functions.indexPrice(SNX_ETH_MARKET_ID).call()
                current_price = price_raw / SNX_PRICE_PRECISION

            except Exception as exc:
                log.warning("_monitor_position: live read failed — %s", exc)

        else:
            # Simulate: estimate funding from elapsed 8h periods
            elapsed_s     = time.time() - pos.perp.opened_at
            elapsed_8h    = elapsed_s / (8 * 3600)
            pos.perp.accrued_funding_usd = (
                abs(pos.perp.entry_rate_8h_pct / 100)
                * pos.perp.size_tokens
                * pos.perp.entry_price_usd
                * elapsed_8h
            )
            pos.funding_collected_usd = pos.perp.accrued_funding_usd
            current_price = self._executor._fetch_price() or pos.spot.entry_price_usd

        # True delta drift: compare current notional value of spot leg vs perp leg
        # Both legs started at the same notional; divergence = hedge slippage
        if pos.spot and pos.perp and pos.perp.size_tokens > 0:
            spot_notional  = (pos.spot.weth_amount / 10 ** WETH_DECIMALS) * current_price
            perp_notional  = pos.perp.size_tokens * current_price
            delta_drift_pct = abs(spot_notional - perp_notional) / perp_notional
        else:
            delta_drift_pct = 0.0

        # Rebalance if drift exceeds threshold
        if delta_drift_pct > DELTA_REBALANCE_THRESHOLD:
            log.info(
                "_monitor_position: delta drift %.2f%% > %.1f%% threshold — rebalancing",
                delta_drift_pct * 100, DELTA_REBALANCE_THRESHOLD * 100,
            )
            ok = self._executor.rebalance_spot(pos, current_price)
            if ok:
                self._perf.record_rebalance()
                self._db.log_event("REBALANCE", f"pos={pos.position_id[:8]} drift={delta_drift_pct:.4f}")

        # Staking yield update (simulate Lido ~3.5% APY)
        if pos.spot and pos.spot.use_wsteth:
            elapsed_years = (time.time() - pos.spot.opened_at) / SECONDS_PER_YEAR
            weth_value    = (pos.spot.weth_amount / 10 ** 18) * current_price
            pos.spot.staking_yield_usd = weth_value * 0.035 * elapsed_years

        # Margin tier handling (live only)
        if self._mode == "live":
            self._handle_margin_tier(pos, margin_ratio, current_price)

        # Max hold check
        age_hours = (time.time() - pos.opened_at) / 3600
        if age_hours >= MAX_HOLD_HOURS:
            log.info("_monitor_position: max hold reached %.1fh — closing", age_hours)
            self._close_position(pos, f"max_hold_{age_hours:.1f}h")
            return

        # Log funding epoch
        self._db.log_funding_epoch(
            position_id=pos.position_id,
            epoch_time=time.time(),
            funding_rate_8h=pos.perp.entry_rate_8h_pct,
            funding_usd=pos.funding_collected_usd,
            index_price_usd=current_price,
            margin_ratio=margin_ratio,
            delta_drift_pct=delta_drift_pct,
        )
        pos.perp.last_monitored = time.time()
        self._db.upsert_position(pos, self._network_name, self._mode)

    def _handle_margin_tier(
        self, pos: HedgePosition, margin_ratio: float, current_price: float
    ) -> None:
        if margin_ratio <= MARGIN_BUFFER_EMERGENCY_PCT:
            log.error(
                "_handle_margin_tier: EMERGENCY — margin_ratio=%.1f%% <= %.0f%%",
                margin_ratio * 100, MARGIN_BUFFER_EMERGENCY_PCT * 100,
            )
            self._alerter.send(
                f"🚨 Agent Beta: EMERGENCY CLOSE\n"
                f"Margin ratio {margin_ratio*100:.1f}% ≤ {MARGIN_BUFFER_EMERGENCY_PCT*100:.0f}%\n"
                f"Closing position to avoid liquidation penalty."
            )
            self._close_position(pos, f"margin_emergency_{margin_ratio:.3f}")
            self._perf.record_emergency()

        elif margin_ratio <= MARGIN_BUFFER_REDUCE_PCT:
            log.warning(
                "_handle_margin_tier: REDUCE — margin_ratio=%.1f%% <= %.0f%%",
                margin_ratio * 100, MARGIN_BUFFER_REDUCE_PCT * 100,
            )
            self._alerter.send(
                f"⚠️ Agent Beta: Margin Warning\n"
                f"Ratio {margin_ratio*100:.1f}% — consider manual review."
            )
            self._perf.record_margin_alert()
            self._db.log_event("MARGIN_REDUCE", f"ratio={margin_ratio:.4f}")

        elif margin_ratio <= MARGIN_BUFFER_ALERT_PCT:
            if pos.perp:
                add_amount = (pos.perp.collateral_usdc / 10 ** USDC_DECIMALS) * 0.20
                log.warning(
                    "_handle_margin_tier: ALERT — adding $%.2f collateral (margin_ratio=%.1f%%)",
                    add_amount, margin_ratio * 100,
                )
                self._alerter.send(
                    f"⚠️ Agent Beta: Adding collateral ${add_amount:.2f}\n"
                    f"Margin ratio {margin_ratio*100:.1f}% ≤ {MARGIN_BUFFER_ALERT_PCT*100:.0f}%"
                )
                self._executor.add_collateral(pos, add_amount)
                self._perf.record_margin_alert()
        else:
            log.debug(
                "_handle_margin_tier: normal — margin_ratio=%.1f%%", margin_ratio * 100
            )

    # -------------------------------------------------------------------------
    # Position lifecycle helpers
    # -------------------------------------------------------------------------

    def _close_position(self, pos: HedgePosition, reason: str) -> None:
        ok = self._executor.close(pos, reason)
        if ok:
            self._perf.record_close(pos)
        self._db.upsert_position(pos, self._network_name, self._mode)
        self._db.log_event("POSITION_CLOSED", f"id={pos.position_id[:8]} reason={reason} net=${pos.net_profit_usd:.4f}")

    def _register_position(self, pos: HedgePosition) -> None:
        with self._pos_lock:
            self._positions[pos.position_id] = pos
        self._db.upsert_position(pos, self._network_name, self._mode)
        self._perf.record_open()
        self._db.log_event("POSITION_OPENED", f"id={pos.position_id[:8]}")
        self._alerter.send(
            f"✅ Agent Beta: Position opened\n"
            f"ID: {pos.position_id[:8]}\n"
            f"Size: ${self._position_size:,.0f}\n"
            f"ETH: ${pos.spot_tx1_price:.2f}"
        )

    def _active_positions(self) -> List[HedgePosition]:
        with self._pos_lock:
            return [
                p for p in self._positions.values()
                if p.status in (PositionStatus.OPEN, PositionStatus.PENDING)
            ]

    def _current_block(self) -> int:
        if self._ws.is_connected and self._ws.latest_block > 0:
            return self._ws.latest_block
        try:
            w3, _ = self._rpc.get_w3()
            return w3.eth.block_number
        except Exception as exc:
            log.warning("_current_block: %s", exc)
            return 0

    def _shutdown(self) -> None:
        log.info("AgentBeta: shutting down")
        self._stopped = True

        active = self._active_positions()
        if active:
            log.info("AgentBeta: closing %d open position(s) on shutdown", len(active))
            for pos in active:
                self._close_position(pos, "agent_shutdown")

        self._perf.print_summary()
        self._ws.stop()
        self._rpc.stop()
        self._alerter.send("🛑 Agent Beta stopped cleanly")
        log.info("AgentBeta: shutdown complete")

    def _print_banner(self) -> None:
        log.info(
            "\n"
            "╔══════════════════════════════════════════════════════════╗\n"
            "║          AETHERIS PROTOCOL — AGENT BETA PHASE 1          ║\n"
            "║           Delta-Neutral Funding Rate Capture             ║\n"
            "╠══════════════════════════════════════════════════════════╣\n"
            "║  Strategy : Short ETH-PERP + Long wstETH hedge           ║\n"
            "║  Network  : %-44s ║\n"
            "║  Mode     : %-44s ║\n"
            "║  Pos size : $%-43.0f ║\n"
            "║  Min daily: $%-43.2f ║\n"
            "║  Scan     : %ds                                          ║\n"
            "║  Monitor  : %ds                                          ║\n"
            "╚══════════════════════════════════════════════════════════╝",
            self._network_name,
            self._mode.upper(),
            self._position_size,
            self._min_daily_profit,
            SCAN_INTERVAL_S,
            MONITOR_INTERVAL_S,
        )

# =============================================================================
# SECTION 17 — main() entry point
# =============================================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Aetheris Protocol — Agent Beta Phase 1: Delta-Neutral Funding Rate Capture"
    )
    parser.add_argument(
        "--network",
        choices=list(NETWORKS.keys()),
        default="baseSepolia",
        help="Target network (default: baseSepolia)",
    )
    parser.add_argument(
        "--mode",
        choices=["simulate", "live"],
        default="simulate",
        help="Execution mode (default: simulate)",
    )
    parser.add_argument(
        "--position-size",
        type=float,
        default=DEFAULT_POSITION_SIZE_USDC,
        dest="position_size",
        help=f"Position size in USDC (default: {DEFAULT_POSITION_SIZE_USDC})",
    )
    parser.add_argument(
        "--min-daily-profit",
        type=float,
        default=1.0,
        dest="min_daily_profit",
        help="Minimum estimated net daily profit in USD to enter a position (default: 1.0)",
    )
    parser.add_argument(
        "--db",
        type=str,
        default="agent_beta.db",
        help="SQLite database path (default: agent_beta.db)",
    )

    args = parser.parse_args()

    if args.mode == "live" and NETWORKS[args.network]["testnet"] is False:
        log.warning("=" * 60)
        log.warning("  LIVE MODE ON MAINNET — REAL FUNDS AT RISK")
        log.warning("  Ensure you have reviewed the pre-production checklist.")
        log.warning("=" * 60)

    agent = AgentBeta(
        network=args.network,
        mode=args.mode,
        position_size_usdc=args.position_size,
        min_daily_profit=args.min_daily_profit,
        db_path=args.db,
    )
    agent.run()


if __name__ == "__main__":
    main()