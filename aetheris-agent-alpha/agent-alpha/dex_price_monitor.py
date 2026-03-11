# Aetheris\aetheris-agent-alpha\agent\dex_price_monitor.py
"""
Aetheris Agent Alpha — DEX Price Monitor

Maintains real-time price feeds from up to 12 DEXs on Base L2.
Uses WebSocket connections for sub-second latency where available,
falling back to polling for DEXs that don't support WebSocket events.

SUPPORTED DEXs:
  1. Uniswap V3    — WebSocket via eth_subscribe (pool events)
  2. Aerodrome     — WebSocket via eth_subscribe (pool events)
  3. Balancer V2   — WebSocket via Vault swap events
  4. Curve Finance — Polling (no standard WebSocket event format)

HOW PRICE DISCOVERY WORKS:

  On Uniswap V3, the price of a token pair lives in a pool contract.
  The pool stores a value called sqrtPriceX96 — the square root of the
  current price, scaled by 2^96. When a swap happens, the pool emits
  a Swap event containing the new sqrtPriceX96. We subscribe to these
  events via WebSocket and compute the human-readable price on receipt.

  On Aerodrome, each pool emits a Sync event after every swap containing
  the new reserve amounts for both tokens. Price = reserve1 / reserve0.

  On Balancer, the central Vault emits a Swap event for every trade
  across any pool. We filter by pool ID to track specific pairs.

  On Curve, we poll the get_dy() view function every 500ms to get
  the current exchange rate for 1 unit of tokenIn to tokenOut.

OUTPUT:
  All price data is published to Redis pub/sub channel "aetheris:prices"
  in a normalized format that the Arbitrage Strategy Engine consumes.

  Format:
  {
    "dex":       "uniswap_v3",
    "pool":      "0x...",
    "token0":    "0x...",
    "token1":    "0x...",
    "price":     1823.45,      <- token1 per token0
    "liquidity": 1500000,      <- pool liquidity (for slippage estimation)
    "fee_bps":   30,           <- pool fee in basis points
    "timestamp": 1700000000,
    "block":     12345678
  }

Dependencies:
    pip install web3 websockets redis aiohttp structlog python-dotenv
"""

import asyncio
import json
import math
import os
import time
from dataclasses import dataclass, asdict
from decimal import Decimal
from typing import Optional

import redis.asyncio as aioredis
import structlog
import websockets
from dotenv import load_dotenv
from web3 import Web3

load_dotenv()

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger("aetheris.price_monitor")


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
class Config:
    # WebSocket RPC — required for event subscriptions
    BASE_WS_URL:     str = os.getenv("BASE_WS_URL",     "wss://base-mainnet.g.alchemy.com/v2/YOUR_KEY")
    BASE_HTTP_URL:   str = os.getenv("BASE_RPC_PRIMARY", "https://mainnet.base.org")
    REDIS_URL:       str = os.getenv("REDIS_URL",        "redis://localhost:6379")
    POLL_INTERVAL_S: float = float(os.getenv("PRICE_POLL_INTERVAL", "0.5"))

    # Price channel for arbitrage engine to subscribe
    PRICE_CHANNEL:   str = "aetheris:prices"
    # How long a price is considered fresh (seconds)
    PRICE_TTL_S:     int = 5


# ─────────────────────────────────────────────────────────────────────────────
# Data Model
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class PriceUpdate:
    dex:        str
    pool:       str
    token0:     str
    token1:     str
    price:      float      # token1 per token0
    liquidity:  int        # raw liquidity value
    fee_bps:    int        # pool fee in basis points
    timestamp:  float
    block:      int


# ─────────────────────────────────────────────────────────────────────────────
# Pool Registry — all pools we monitor
# In production this is loaded from a config file or database.
# ─────────────────────────────────────────────────────────────────────────────
MONITORED_POOLS = [
    # ── Uniswap V3 on Base ──────────────────────────────────────────────────
    {
        "dex":     "uniswap_v3",
        "pool":    "0x4C36388bE6F416A29C8d8Eee81C771cE6bE14B5",  # USDC/WETH 0.05%
        "token0":  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  # USDC (Base)
        "token1":  "0x4200000000000000000000000000000000000006",  # WETH (Base)
        "fee_bps": 5,
        "type":    "uniswap_v3",
        "decimals0": 6,
        "decimals1": 18,
    },
    {
        "dex":     "uniswap_v3",
        "pool":    "0x6E1C5A4e98b7c621C93ABFb0690E80D9AF7Cf2D2",  # WETH/USDC 0.3%
        "token0":  "0x4200000000000000000000000000000000000006",
        "token1":  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "fee_bps": 30,
        "type":    "uniswap_v3",
        "decimals0": 18,
        "decimals1": 6,
    },
    # ── Aerodrome on Base ────────────────────────────────────────────────────
    {
        "dex":     "aerodrome",
        "pool":    "0x6cDcb1C4A4D1C3C6d054b27AC5B77e89eAFb971d",  # USDC/WETH volatile
        "token0":  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "token1":  "0x4200000000000000000000000000000000000006",
        "fee_bps": 30,
        "type":    "aerodrome",
        "decimals0": 6,
        "decimals1": 18,
    },
    # ── Balancer V2 on Base ──────────────────────────────────────────────────
    {
        "dex":     "balancer_v2",
        "pool":    "0x79c58f70905F734641735BC61e45c19dD9Ad60bC",  # USDC/WETH 50/50
        "token0":  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "token1":  "0x4200000000000000000000000000000000000006",
        "fee_bps": 20,
        "type":    "balancer_v2",
        "pool_id": "0x79c58f70905f734641735bc61e45c19dd9ad60bc0002000000000000000000fe",
        "vault":   "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
        "decimals0": 6,
        "decimals1": 18,
    },
    # ── Curve Finance on Base ────────────────────────────────────────────────
    {
        "dex":     "curve",
        "pool":    "0x5FAE7E604FC3e3fd545Cf7eBe48A9E572EE10b0d",  # 3pool (USDC/USDT/DAI)
        "token0":  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  # USDC
        "token1":  "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",  # DAI
        "fee_bps": 4,
        "type":    "curve",
        "i": 0,   # USDC index in pool
        "j": 1,   # DAI index in pool
        "decimals0": 6,
        "decimals1": 18,
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# Price Math Helpers
# ─────────────────────────────────────────────────────────────────────────────
def sqrt_price_x96_to_price(
    sqrt_price_x96: int,
    decimals0: int,
    decimals1: int
) -> float:
    """
    Convert Uniswap V3's sqrtPriceX96 to a human-readable price.

    sqrtPriceX96 = sqrt(token1/token0) * 2^96

    So: price = (sqrtPriceX96 / 2^96)^2 * (10^decimals0 / 10^decimals1)

    The decimal adjustment converts from raw token units to human units.
    For example, USDC has 6 decimals and WETH has 18, so we multiply by
    10^(18-6) = 10^12 to get the price in human-readable USDC per WETH.
    """
    Q96     = 2 ** 96
    price   = (Decimal(sqrt_price_x96) / Decimal(Q96)) ** 2
    decimal_adj = Decimal(10 ** decimals0) / Decimal(10 ** decimals1)
    return float(price * decimal_adj)


def reserves_to_price(
    reserve0: int,
    reserve1: int,
    decimals0: int,
    decimals1: int
) -> float:
    """
    Compute price from AMM reserves (Aerodrome/Uniswap V2 style).
    price = (reserve1 / 10^decimals1) / (reserve0 / 10^decimals0)
    """
    if reserve0 == 0:
        return 0.0
    r0 = Decimal(reserve0) / Decimal(10 ** decimals0)
    r1 = Decimal(reserve1) / Decimal(10 ** decimals1)
    return float(r1 / r0)


# ─────────────────────────────────────────────────────────────────────────────
# Uniswap V3 Monitor — WebSocket event subscription
# ─────────────────────────────────────────────────────────────────────────────
UNISWAP_V3_SWAP_TOPIC = Web3.keccak(
    text="Swap(address,address,int256,int256,uint160,uint128,int24)"
).hex()


class UniswapV3Monitor:
    """
    Subscribes to Swap events on Uniswap V3 pools via WebSocket.

    The Swap event contains:
      - sender, recipient: addresses
      - amount0, amount1: token amounts (signed — negative means tokens left the pool)
      - sqrtPriceX96: new price after swap
      - liquidity: current pool liquidity
      - tick: current price tick
    """

    def __init__(self, pools: list[dict], publisher):
        self._pools     = {p["pool"].lower(): p for p in pools if p["type"] == "uniswap_v3"}
        self._publisher = publisher

    async def run(self, ws_url: str):
        while True:
            try:
                await self._subscribe(ws_url)
            except Exception as e:
                log.error("uniswap_v3_ws_error", error=str(e))
                await asyncio.sleep(2)

    async def _subscribe(self, ws_url: str):
        async with websockets.connect(ws_url, ping_interval=30) as ws:
            log.info("uniswap_v3_ws_connected")

            # Subscribe to logs for all monitored pools
            pool_addresses = list(self._pools.keys())
            sub_request = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "eth_subscribe",
                "params": [
                    "logs",
                    {
                        "address": pool_addresses,
                        "topics":  [UNISWAP_V3_SWAP_TOPIC],
                    }
                ]
            }
            await ws.send(json.dumps(sub_request))
            await ws.recv()  # subscription confirmation

            async for raw_msg in ws:
                try:
                    msg = json.loads(raw_msg)
                    if "params" not in msg:
                        continue

                    log_data = msg["params"]["result"]
                    await self._process_swap_log(log_data)

                except Exception as e:
                    log.error("uniswap_v3_log_parse_error", error=str(e))

    async def _process_swap_log(self, log_data: dict):
        address = log_data["address"].lower()
        pool    = self._pools.get(address)
        if not pool:
            return

        # Decode sqrtPriceX96 and liquidity from log data
        # Uniswap V3 Swap event data layout (ABI-encoded):
        #   amount0 (int256), amount1 (int256), sqrtPriceX96 (uint160),
        #   liquidity (uint128), tick (int24)
        data        = log_data["data"]
        data_bytes  = bytes.fromhex(data[2:])

        # Each ABI slot is 32 bytes
        # slot 0: amount0, slot 1: amount1, slot 2: sqrtPriceX96,
        # slot 3: liquidity, slot 4: tick
        sqrt_price_x96 = int.from_bytes(data_bytes[64:96], "big")
        liquidity      = int.from_bytes(data_bytes[96:128], "big")

        price = sqrt_price_x96_to_price(
            sqrt_price_x96,
            pool["decimals0"],
            pool["decimals1"]
        )

        update = PriceUpdate(
            dex=pool["dex"],
            pool=pool["pool"],
            token0=pool["token0"],
            token1=pool["token1"],
            price=price,
            liquidity=liquidity,
            fee_bps=pool["fee_bps"],
            timestamp=time.time(),
            block=int(log_data.get("blockNumber", "0x0"), 16),
        )

        await self._publisher.publish(update)
        log.info("uniswap_v3_price", pool=address[:10], price=f"{price:.4f}")


# ─────────────────────────────────────────────────────────────────────────────
# Aerodrome Monitor — WebSocket Sync event subscription
# ─────────────────────────────────────────────────────────────────────────────
AERODROME_SYNC_TOPIC = Web3.keccak(text="Sync(uint256,uint256)").hex()


class AerodromeMonitor:
    """
    Subscribes to Sync events on Aerodrome pools.
    Sync fires after every swap and contains the new reserve amounts.
    """

    def __init__(self, pools: list[dict], publisher):
        self._pools     = {p["pool"].lower(): p for p in pools if p["type"] == "aerodrome"}
        self._publisher = publisher

    async def run(self, ws_url: str):
        while True:
            try:
                await self._subscribe(ws_url)
            except Exception as e:
                log.error("aerodrome_ws_error", error=str(e))
                await asyncio.sleep(2)

    async def _subscribe(self, ws_url: str):
        async with websockets.connect(ws_url, ping_interval=30) as ws:
            log.info("aerodrome_ws_connected")

            sub_request = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "eth_subscribe",
                "params": [
                    "logs",
                    {
                        "address": list(self._pools.keys()),
                        "topics":  [AERODROME_SYNC_TOPIC],
                    }
                ]
            }
            await ws.send(json.dumps(sub_request))
            await ws.recv()

            async for raw_msg in ws:
                try:
                    msg = json.loads(raw_msg)
                    if "params" not in msg:
                        continue
                    log_data = msg["params"]["result"]
                    await self._process_sync_log(log_data)
                except Exception as e:
                    log.error("aerodrome_log_error", error=str(e))

    async def _process_sync_log(self, log_data: dict):
        address = log_data["address"].lower()
        pool    = self._pools.get(address)
        if not pool:
            return

        data       = log_data["data"]
        data_bytes = bytes.fromhex(data[2:])

        # Sync(uint256 reserve0, uint256 reserve1) — two 32-byte slots
        reserve0 = int.from_bytes(data_bytes[0:32],  "big")
        reserve1 = int.from_bytes(data_bytes[32:64], "big")

        price = reserves_to_price(reserve0, reserve1, pool["decimals0"], pool["decimals1"])

        update = PriceUpdate(
            dex=pool["dex"],
            pool=pool["pool"],
            token0=pool["token0"],
            token1=pool["token1"],
            price=price,
            liquidity=min(reserve0, reserve1),
            fee_bps=pool["fee_bps"],
            timestamp=time.time(),
            block=int(log_data.get("blockNumber", "0x0"), 16),
        )

        await self._publisher.publish(update)
        log.info("aerodrome_price", pool=address[:10], price=f"{price:.4f}")


# ─────────────────────────────────────────────────────────────────────────────
# Balancer V2 Monitor — WebSocket Vault Swap event subscription
# ─────────────────────────────────────────────────────────────────────────────
BALANCER_SWAP_TOPIC = Web3.keccak(
    text="Swap(bytes32,address,address,uint256,uint256)"
).hex()

BALANCER_VAULT_ABI = [
    {
        "name": "getPoolTokens",
        "type": "function",
        "inputs": [{"name": "poolId", "type": "bytes32"}],
        "outputs": [
            {"name": "tokens",          "type": "address[]"},
            {"name": "balances",        "type": "uint256[]"},
            {"name": "lastChangeBlock", "type": "uint256"},
        ],
        "stateMutability": "view",
    }
]


class BalancerV2Monitor:
    """
    Subscribes to Swap events on the Balancer V2 Vault.
    After each swap, queries getPoolTokens() to get current balances.
    """

    def __init__(self, pools: list[dict], publisher, http_url: str):
        self._pools     = {p["pool_id"].lower(): p for p in pools if p["type"] == "balancer_v2"}
        self._publisher = publisher
        self._w3        = Web3(Web3.HTTPProvider(http_url))

    async def run(self, ws_url: str):
        while True:
            try:
                await self._subscribe(ws_url)
            except Exception as e:
                log.error("balancer_ws_error", error=str(e))
                await asyncio.sleep(2)

    async def _subscribe(self, ws_url: str):
        vault_addresses = list({p["vault"] for p in self._pools.values()})

        async with websockets.connect(ws_url, ping_interval=30) as ws:
            log.info("balancer_ws_connected")

            sub_request = {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "eth_subscribe",
                "params": [
                    "logs",
                    {
                        "address": vault_addresses,
                        "topics":  [BALANCER_SWAP_TOPIC],
                    }
                ]
            }
            await ws.send(json.dumps(sub_request))
            await ws.recv()

            async for raw_msg in ws:
                try:
                    msg = json.loads(raw_msg)
                    if "params" not in msg:
                        continue
                    log_data = msg["params"]["result"]
                    await self._process_swap_log(log_data)
                except Exception as e:
                    log.error("balancer_log_error", error=str(e))

    async def _process_swap_log(self, log_data: dict):
        # Balancer Swap event: poolId is the first topic after the event signature
        topics   = log_data.get("topics", [])
        if len(topics) < 2:
            return
        pool_id  = topics[1].lower()
        pool     = self._pools.get(pool_id)
        if not pool:
            return

        # Query current pool balances
        try:
            vault    = self._w3.eth.contract(
                address=Web3.to_checksum_address(pool["vault"]),
                abi=BALANCER_VAULT_ABI,
            )
            result   = await asyncio.to_thread(
                vault.functions.getPoolTokens(pool_id).call
            )
            balances  = result[1]
            reserve0  = balances[0] if len(balances) > 0 else 0
            reserve1  = balances[1] if len(balances) > 1 else 0
            price     = reserves_to_price(reserve0, reserve1, pool["decimals0"], pool["decimals1"])

            update = PriceUpdate(
                dex=pool["dex"],
                pool=pool["pool"],
                token0=pool["token0"],
                token1=pool["token1"],
                price=price,
                liquidity=min(reserve0, reserve1),
                fee_bps=pool["fee_bps"],
                timestamp=time.time(),
                block=int(log_data.get("blockNumber", "0x0"), 16),
            )

            await self._publisher.publish(update)
            log.info("balancer_price", pool=pool["pool"][:10], price=f"{price:.4f}")

        except Exception as e:
            log.error("balancer_balance_query_error", error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Curve Finance Monitor — polling (no standard WebSocket event)
# ─────────────────────────────────────────────────────────────────────────────
CURVE_GET_DY_ABI = [
    {
        "name": "get_dy",
        "type": "function",
        "inputs": [
            {"name": "i",  "type": "int128"},
            {"name": "j",  "type": "int128"},
            {"name": "dx", "type": "uint256"},
        ],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    }
]


class CurveMonitor:
    """
    Polls Curve pool get_dy() every POLL_INTERVAL_S seconds.
    get_dy(i, j, dx) returns the amount of token j you receive
    for sending dx of token i. This gives us the current exchange rate.
    """

    def __init__(self, pools: list[dict], publisher, http_url: str):
        self._pools     = [p for p in pools if p["type"] == "curve"]
        self._publisher = publisher
        self._w3        = Web3(Web3.HTTPProvider(http_url))

    async def run(self):
        while True:
            try:
                await self._poll_all()
                await asyncio.sleep(Config.POLL_INTERVAL_S)
            except Exception as e:
                log.error("curve_poll_error", error=str(e))
                await asyncio.sleep(2)

    async def _poll_all(self):
        tasks = [self._poll_pool(p) for p in self._pools]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _poll_pool(self, pool: dict):
        try:
            contract = self._w3.eth.contract(
                address=Web3.to_checksum_address(pool["pool"]),
                abi=CURVE_GET_DY_ABI,
            )

            # Query how much token j we get for 1 unit of token i
            dx       = 10 ** pool["decimals0"]  # 1 unit of token0
            dy       = await asyncio.to_thread(
                contract.functions.get_dy(pool["i"], pool["j"], dx).call
            )

            # price = dy (in token1 units) / 10^decimals1
            price = (Decimal(dy) / Decimal(10 ** pool["decimals1"]))

            update = PriceUpdate(
                dex=pool["dex"],
                pool=pool["pool"],
                token0=pool["token0"],
                token1=pool["token1"],
                price=float(price),
                liquidity=0,  # Curve doesn't expose liquidity easily
                fee_bps=pool["fee_bps"],
                timestamp=time.time(),
                block=self._w3.eth.block_number,
            )

            await self._publisher.publish(update)

        except Exception as e:
            log.error("curve_pool_poll_error", pool=pool["pool"][:10], error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Redis Publisher — broadcasts price updates to arbitrage engine
# ─────────────────────────────────────────────────────────────────────────────
class PricePublisher:
    def __init__(self, redis_url: str):
        self._redis_url = redis_url
        self._redis: Optional[aioredis.Redis] = None

    async def connect(self):
        self._redis = await aioredis.from_url(self._redis_url, decode_responses=True)
        log.info("price_publisher_connected")

    async def publish(self, update: PriceUpdate):
        if not self._redis:
            return

        data = asdict(update)
        msg  = json.dumps(data)

        # Publish to real-time channel for arbitrage engine
        await self._redis.publish(Config.PRICE_CHANNEL, msg)

        # Also store latest price per pool for snapshot queries
        key = f"aetheris:price:{update.dex}:{update.pool.lower()}"
        await self._redis.setex(key, Config.PRICE_TTL_S, msg)

    async def close(self):
        if self._redis:
            await self._redis.close()


# ─────────────────────────────────────────────────────────────────────────────
# Main — start all monitors concurrently
# ─────────────────────────────────────────────────────────────────────────────
async def main():
    publisher = PricePublisher(Config.REDIS_URL)
    await publisher.connect()

    log.info("price_monitor_starting", pool_count=len(MONITORED_POOLS))

    v3_monitor   = UniswapV3Monitor(MONITORED_POOLS, publisher)
    aero_monitor = AerodromeMonitor(MONITORED_POOLS, publisher)
    bal_monitor  = BalancerV2Monitor(MONITORED_POOLS, publisher, Config.BASE_HTTP_URL)
    curve_monitor = CurveMonitor(MONITORED_POOLS, publisher, Config.BASE_HTTP_URL)

    await asyncio.gather(
        v3_monitor.run(Config.BASE_WS_URL),
        aero_monitor.run(Config.BASE_WS_URL),
        bal_monitor.run(Config.BASE_WS_URL),
        curve_monitor.run(),
    )


if __name__ == "__main__":
    asyncio.run(main())