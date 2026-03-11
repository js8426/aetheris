# Aetheris\aetheris-agent-alpha\agent\arbitrage_engine.py
"""
Aetheris Agent Alpha — Arbitrage Strategy Engine

Consumes real-time price data from the DEX Price Monitor and identifies
profitable arbitrage opportunities using graph-based path finding.

WHAT IS ARBITRAGE:
  The same asset can trade at different prices on different exchanges
  simultaneously. Arbitrage is the practice of buying on the cheaper
  exchange and selling on the more expensive one, capturing the difference.
  In DeFi, this happens automatically because market forces eventually
  equalize prices, but there is always a brief window where the price
  difference exceeds transaction costs.

ALGORITHM — BELLMAN-FORD ON A PRICE GRAPH:

  We model the DEX ecosystem as a weighted directed graph where:
    - Nodes  = token addresses
    - Edges  = liquidity pools (one edge per direction per pool)
    - Weight = log(1 / effective_exchange_rate)

  We use logarithms because log(a*b) = log(a) + log(b), which converts
  multiplicative exchange rates into additive path weights. This lets us
  use standard shortest-path algorithms.

  A profitable arbitrage cycle exists when the sum of weights around
  a cycle is NEGATIVE — meaning the product of exchange rates > 1,
  i.e., you end up with more tokens than you started with.

  The Bellman-Ford algorithm detects negative cycles in O(V*E) time.
  For our graph of ~20 tokens and ~50 pools, this runs in microseconds.

PROFIT CALCULATION:
  For each detected cycle, we calculate:
    1. Gross profit = amountOut - amountIn (in flash loan token units)
    2. Flash loan fee = amountIn * 0.05%
    3. Gas cost = estimated gas * current gas price (converted to token units)
    4. MEV risk = estimated probability of being front-run (reduces expected value)
    5. Net profit = gross profit - flash loan fee - gas cost - MEV risk buffer
  Only cycles where net profit > minimum threshold are submitted for execution.

RISK CONTROLS:
  - Maximum path length: 4 hops (longer paths have exponentially more slippage)
  - Maximum flash loan: $100,000 (set in AgentAlpha contract)
  - Slippage model: adjusts expected output based on pool depth and trade size
  - MEV risk: adds a buffer equal to estimated searcher competition

Dependencies:
    pip install redis aiohttp structlog python-dotenv web3
"""

import asyncio
import json
import math
import os
import time
import uuid
from dataclasses import dataclass
from typing import Optional

import aiohttp
import redis.asyncio as aioredis
import structlog
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
log = structlog.get_logger("aetheris.arbitrage_engine")


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
class Config:
    REDIS_URL:          str   = os.getenv("REDIS_URL", "redis://localhost:6379")
    PRICE_CHANNEL:      str   = "aetheris:prices"
    EXECUTION_CHANNEL:  str   = "aetheris:trades"
    BASE_RPC_URL:       str   = os.getenv("BASE_RPC_PRIMARY", "https://mainnet.base.org")

    # Minimum net profit to execute a trade (in USDC, 6 decimals)
    MIN_NET_PROFIT_USDC: int  = int(os.getenv("MIN_NET_PROFIT_USDC", "500000"))  # $0.50

    # Flash loan token (USDC on Base)
    FLASH_TOKEN:        str   = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

    # Maximum flash loan amount ($100,000 USDC)
    MAX_FLASH_AMOUNT:   int   = 100_000 * 1_000_000  # 100k USDC in 6-decimal units

    # Optimal flash loan amount to try first ($10,000 USDC)
    DEFAULT_FLASH_AMOUNT: int = 10_000 * 1_000_000

    # Aave flash loan fee (0.05%)
    AAVE_FEE_BPS:       int   = 5

    # Agent Alpha contract API for trade submission
    AGENT_ALPHA_API:    str   = os.getenv("AGENT_ALPHA_API", "http://localhost:8010")

    # MEV risk buffer as a percentage of gross profit
    MEV_BUFFER_PCT:     float = float(os.getenv("MEV_BUFFER_PCT", "0.3"))  # 30%

    # Default slippage tolerance per hop (0.5%)
    SLIPPAGE_BPS:       int   = 50

    # Maximum path length
    MAX_PATH_HOPS:      int   = 4

    # How long a price is valid before we consider it stale (seconds)
    PRICE_STALE_AFTER:  float = 5.0

    # Gas estimate for a typical 2-hop arbitrage (in gas units)
    GAS_ESTIMATE_2HOP:  int   = 350_000
    GAS_ESTIMATE_3HOP:  int   = 500_000
    GAS_ESTIMATE_4HOP:  int   = 650_000


# ─────────────────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class PriceUpdate:
    dex:        str
    pool:       str
    token0:     str
    token1:     str
    price:      float
    liquidity:  int
    fee_bps:    int
    timestamp:  float
    block:      int


@dataclass
class GraphEdge:
    """A directed edge in the price graph representing one swap direction."""
    pool:       str       # pool address
    dex:        str       # dex name
    token_in:   str       # token being sold
    token_out:  str       # token being received
    rate:       float     # effective exchange rate after fees: tokenOut per tokenIn
    fee_bps:    int       # pool fee in basis points
    liquidity:  int       # pool liquidity (for slippage estimation)
    timestamp:  float     # when this price was last updated
    log_rate:   float     # log(rate) — used in Bellman-Ford


@dataclass
class ArbitragePath:
    """A profitable arbitrage cycle."""
    cycle:          list[str]   # ordered list of token addresses forming the cycle
    edges:          list[GraphEdge]
    flash_amount:   int         # recommended flash loan size (in flash token units)
    gross_profit:   int         # expected gross profit (in flash token units)
    flash_fee:      int         # Aave fee cost
    gas_cost_usdc:  int         # estimated gas cost in USDC units
    mev_buffer:     int         # MEV risk buffer
    net_profit:     int         # gross_profit - flash_fee - gas_cost - mev_buffer
    profit_pct:     float       # net_profit / flash_amount as percentage


@dataclass
class TradeOrder:
    """Serialized trade parameters sent to the execution layer."""
    trade_id:     str
    flash_token:  str
    flash_amount: int
    path:         list[dict]   # list of SwapHop dicts matching AgentAlpha.SwapHop
    min_profit:   int
    deadline:     int
    estimated_net_profit: int


# ─────────────────────────────────────────────────────────────────────────────
# Price Graph — maintains the current state of all DEX prices
# ─────────────────────────────────────────────────────────────────────────────
class PriceGraph:
    """
    A directed weighted graph where nodes are token addresses and edges
    are DEX pools with their current exchange rates.

    Two edges exist per pool (one for each swap direction).
    The weight of each edge is log(1 / effective_rate).
    """

    # DEX type codes matching the AgentAlpha.DexType enum in Solidity
    DEX_TYPE_CODES = {
        "uniswap_v3":  0,
        "aerodrome":   1,
        "balancer_v2": 2,
        "curve":       3,
    }

    def __init__(self):
        # adjacency list: token_in → list of edges
        self._edges: dict[str, list[GraphEdge]] = {}
        # all known tokens
        self._tokens: set[str] = set()

    def update_pool(self, update: PriceUpdate):
        """Update or create both directed edges for a pool."""
        token0 = update.token0.lower()
        token1 = update.token1.lower()

        if update.price <= 0:
            return

        # Fee multiplier: rate after fee deduction
        fee_mult = 1.0 - (update.fee_bps / 10_000)

        # Forward edge: token0 → token1 (price is token1 per token0)
        rate_forward = update.price * fee_mult
        # Reverse edge: token1 → token0 (1/price, adjusted for fee)
        rate_reverse = (1.0 / update.price) * fee_mult if update.price > 0 else 0

        if rate_forward > 0:
            self._upsert_edge(GraphEdge(
                pool=update.pool.lower(),
                dex=update.dex,
                token_in=token0,
                token_out=token1,
                rate=rate_forward,
                fee_bps=update.fee_bps,
                liquidity=update.liquidity,
                timestamp=update.timestamp,
                log_rate=math.log(rate_forward),
            ))

        if rate_reverse > 0:
            self._upsert_edge(GraphEdge(
                pool=update.pool.lower(),
                dex=update.dex,
                token_in=token1,
                token_out=token0,
                rate=rate_reverse,
                fee_bps=update.fee_bps,
                liquidity=update.liquidity,
                timestamp=update.timestamp,
                log_rate=math.log(rate_reverse),
            ))

        self._tokens.add(token0)
        self._tokens.add(token1)

    def _upsert_edge(self, edge: GraphEdge):
        """Insert or update an edge by (pool, token_in) key."""
        key = edge.token_in
        if key not in self._edges:
            self._edges[key] = []

        # Replace existing edge for same pool+direction
        for i, existing in enumerate(self._edges[key]):
            if existing.pool == edge.pool and existing.token_out == edge.token_out:
                self._edges[key][i] = edge
                return

        self._edges[key].append(edge)

    def get_edges_from(self, token: str) -> list[GraphEdge]:
        return self._edges.get(token.lower(), [])

    def all_tokens(self) -> list[str]:
        return list(self._tokens)

    def edge_count(self) -> int:
        return sum(len(v) for v in self._edges.values())


# ─────────────────────────────────────────────────────────────────────────────
# Bellman-Ford Arbitrage Detector
# ─────────────────────────────────────────────────────────────────────────────
class ArbitrageDetector:
    """
    Uses a modified Bellman-Ford algorithm to find negative-weight cycles
    in the price graph, which correspond to profitable arbitrage opportunities.

    Standard Bellman-Ford finds shortest paths. We use it to detect
    negative cycles by running V-1 relaxation rounds and checking if
    any edge can still be relaxed on the V-th round.

    KEY INSIGHT:
      Edge weight = -log(rate)
      Path weight = sum of edge weights = -log(product of rates)
      Negative cycle = product of rates > 1 = profitable arbitrage
    """

    def __init__(self, graph: PriceGraph, max_hops: int = Config.MAX_PATH_HOPS):
        self._graph   = graph
        self._max_hops = max_hops

    def find_opportunities(self) -> list[list[GraphEdge]]:
        """
        Find all profitable arbitrage cycles starting and ending at
        the flash loan token (USDC).

        Returns a list of edge paths representing profitable cycles.
        """
        flash_token = Config.FLASH_TOKEN.lower()
        if flash_token not in self._graph.all_tokens():
            return []

        opportunities = []

        # We only care about cycles that START and END at the flash token.
        # This is a constrained DFS with profit tracking.
        visited_cycles = set()  # dedup cycles

        def dfs(current_token: str, path: list[GraphEdge], log_rate_sum: float, depth: int):
            if depth > self._max_hops:
                return

            for edge in self._graph.get_edges_from(current_token):
                # Skip stale prices
                if time.time() - edge.timestamp > Config.PRICE_STALE_AFTER:
                    continue

                new_log_rate = log_rate_sum + edge.log_rate

                if edge.token_out == flash_token and depth >= 2:
                    # Cycle complete — check if profitable
                    # product_of_rates = exp(sum of log_rates)
                    # Profitable if product > 1, i.e., log_sum > 0
                    if new_log_rate > 0:
                        cycle_key = tuple(sorted(e.pool for e in path + [edge]))
                        if cycle_key not in visited_cycles:
                            visited_cycles.add(cycle_key)
                            opportunities.append(path + [edge])
                    continue

                # Avoid revisiting tokens (no loops within the path)
                visited_tokens = {flash_token} | {e.token_out for e in path}
                if edge.token_out in visited_tokens:
                    continue

                dfs(edge.token_out, path + [edge], new_log_rate, depth + 1)

        dfs(flash_token, [], 0.0, 0)
        return opportunities


# ─────────────────────────────────────────────────────────────────────────────
# Profit Calculator
# ─────────────────────────────────────────────────────────────────────────────
class ProfitCalculator:
    """
    Given an arbitrage path, calculates expected net profit accounting for:
      1. Flash loan fee (Aave 0.05%)
      2. Gas cost (converted to USDC at current ETH price)
      3. Slippage (price impact of our own trade on pool liquidity)
      4. MEV risk buffer (probability a searcher front-runs us)
    """

    def __init__(self, http_url: str):
        self._w3 = Web3(Web3.HTTPProvider(http_url))

    def calculate(self, edges: list[GraphEdge], eth_price_usdc: float) -> Optional[ArbitragePath]:
        flash_amount = Config.DEFAULT_FLASH_AMOUNT

        # ── Step 1: Calculate gross output through the entire path ────────────
        current_amount = flash_amount
        tokens = [Config.FLASH_TOKEN.lower()]

        for edge in edges:
            # Slippage model: the larger our trade relative to pool liquidity,
            # the worse our execution price gets.
            slippage_factor = self._slippage_factor(current_amount, edge.liquidity)
            current_amount  = int(current_amount * edge.rate * slippage_factor)
            tokens.append(edge.token_out)

        gross_output = current_amount
        gross_profit = gross_output - flash_amount

        if gross_profit <= 0:
            return None

        # ── Step 2: Flash loan fee ─────────────────────────────────────────────
        flash_fee = (flash_amount * Config.AAVE_FEE_BPS) // 10_000

        # ── Step 3: Gas cost in USDC ──────────────────────────────────────────
        gas_estimate = {
            2: Config.GAS_ESTIMATE_2HOP,
            3: Config.GAS_ESTIMATE_3HOP,
        }.get(len(edges), Config.GAS_ESTIMATE_4HOP)

        try:
            gas_price_wei  = self._w3.eth.gas_price
            gas_cost_eth   = gas_estimate * gas_price_wei / 1e18
            gas_cost_usdc  = int(gas_cost_eth * eth_price_usdc * 1e6)  # 6 decimals
        except Exception:
            gas_cost_usdc  = 500_000  # default $0.50 if we can't fetch gas price

        # ── Step 4: MEV risk buffer ───────────────────────────────────────────
        mev_buffer = int(gross_profit * Config.MEV_BUFFER_PCT)

        # ── Step 5: Net profit ────────────────────────────────────────────────
        net_profit = gross_profit - flash_fee - gas_cost_usdc - mev_buffer

        if net_profit <= 0:
            return None

        profit_pct = (net_profit / flash_amount) * 100

        # Build token cycle list
        cycle = [e.token_in for e in edges] + [edges[-1].token_out]

        return ArbitragePath(
            cycle=cycle,
            edges=edges,
            flash_amount=flash_amount,
            gross_profit=gross_profit,
            flash_fee=flash_fee,
            gas_cost_usdc=gas_cost_usdc,
            mev_buffer=mev_buffer,
            net_profit=net_profit,
            profit_pct=profit_pct,
        )

    def _slippage_factor(self, trade_amount: int, liquidity: int) -> float:
        """
        Estimate price impact of trade on pool liquidity.
        As trade size grows relative to pool depth, slippage increases.
        Uses a simplified constant-product model.
        """
        if liquidity == 0:
            return 1.0 - (Config.SLIPPAGE_BPS / 10_000)

        # Impact = trade_amount / (liquidity + trade_amount)
        impact = trade_amount / (liquidity + trade_amount)
        return max(0.99, 1.0 - impact)  # floor at 1% slippage per hop


# ─────────────────────────────────────────────────────────────────────────────
# Trade Order Builder
# ─────────────────────────────────────────────────────────────────────────────
class TradeOrderBuilder:
    """
    Converts an ArbitragePath into a TradeOrder that can be submitted
    to the AgentAlpha Solidity contract via executeArbitrage().
    """

    DEX_TYPE_CODES = {
        "uniswap_v3":  0,
        "aerodrome":   1,
        "balancer_v2": 2,
        "curve":       3,
    }

    def build(self, arb: ArbitragePath) -> TradeOrder:
        path = []
        for edge in arb.edges:
            hop = {
                "dex":      edge.pool,
                "dexType":  self.DEX_TYPE_CODES.get(edge.dex, 0),
                "tokenIn":  Web3.to_checksum_address(edge.token_in),
                "tokenOut": Web3.to_checksum_address(edge.token_out),
                "fee":      edge.fee_bps * 100,  # Convert bps to Uniswap fee units
                "minOut":   0,                    # Set to 0 — contract checks final profit
                "poolId":   "0x" + "00" * 32,    # ZeroHash for non-Balancer DEXes
            }
            path.append(hop)

        return TradeOrder(
            trade_id=str(uuid.uuid4()),
            flash_token=Web3.to_checksum_address(Config.FLASH_TOKEN),
            flash_amount=arb.flash_amount,
            path=path,
            min_profit=arb.net_profit // 2,  # Accept half estimated profit as minimum
            deadline=int(time.time()) + 60,   # 60 second execution window
            estimated_net_profit=arb.net_profit,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Main Engine — ties everything together
# ─────────────────────────────────────────────────────────────────────────────
class ArbitrageEngine:
    """
    Subscribes to price updates from Redis, maintains the price graph,
    runs the arbitrage detector after each update, and publishes
    profitable trade orders for the execution layer.
    """

    def __init__(self):
        self._graph     = PriceGraph()
        self._detector  = ArbitrageDetector(self._graph)
        self._calculator = ProfitCalculator(Config.BASE_RPC_URL)
        self._builder   = TradeOrderBuilder()
        self._eth_price = 3000.0  # Updated periodically
        self._trades_submitted_this_block: set[str] = set()

    async def run(self):
        redis = await aioredis.from_url(Config.REDIS_URL, decode_responses=True)
        pub   = await aioredis.from_url(Config.REDIS_URL, decode_responses=True)
        pubsub = redis.pubsub()
        await pubsub.subscribe(Config.PRICE_CHANNEL)

        log.info("arbitrage_engine_started")

        # Fetch ETH price periodically in background
        asyncio.create_task(self._update_eth_price_loop())

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            try:
                data   = json.loads(message["data"])
                update = PriceUpdate(**data)

                # Update graph with new price
                self._graph.update_pool(update)

                # Search for opportunities
                opportunities = self._detector.find_opportunities()

                if not opportunities:
                    continue

                # Evaluate each opportunity
                for edges in opportunities:
                    arb = self._calculator.calculate(edges, self._eth_price)

                    if not arb:
                        continue
                    if arb.net_profit < Config.MIN_NET_PROFIT_USDC:
                        continue

                    # Build trade order
                    order = self._builder.build(arb)

                    log.info(
                        "opportunity_found",
                        hops=len(edges),
                        net_profit_usdc=arb.net_profit / 1e6,
                        profit_pct=f"{arb.profit_pct:.4f}%",
                        dexes=[e.dex for e in edges],
                    )

                    # Publish to execution channel
                    await pub.publish(
                        Config.EXECUTION_CHANNEL,
                        json.dumps(self._order_to_dict(order))
                    )

            except Exception as e:
                log.error("engine_processing_error", error=str(e))

    async def _update_eth_price_loop(self):
        """Fetch ETH/USDC price from Coinbase every 30 seconds."""
        while True:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        "https://api.coinbase.com/v2/exchange-rates?currency=ETH",
                        timeout=aiohttp.ClientTimeout(total=5),
                    ) as resp:
                        data = await resp.json()
                        usdc_rate = data["data"]["rates"].get("USDC")
                        if usdc_rate:
                            self._eth_price = float(usdc_rate)
                            log.debug("eth_price_updated", price=self._eth_price)
            except Exception as e:
                log.error("eth_price_fetch_error", error=str(e))
            await asyncio.sleep(30)

    def _order_to_dict(self, order: TradeOrder) -> dict:
        return {
            "trade_id":              order.trade_id,
            "flash_token":           order.flash_token,
            "flash_amount":          order.flash_amount,
            "path":                  order.path,
            "min_profit":            order.min_profit,
            "deadline":              order.deadline,
            "estimated_net_profit":  order.estimated_net_profit,
        }


async def main():
    engine = ArbitrageEngine()
    await engine.run()


if __name__ == "__main__":
    asyncio.run(main())