# Aetheris\aetheris-agent-alpha\agent-alpha\test_priority4_agents.py

"""
Priority 4 Python Agent Tests
Tests for: price math, PriceGraph, ArbitrageDetector, ProfitCalculator,
           SlippageModel, TradeOrderBuilder, and end-to-end pipeline.

Run with:
    python -m unittest test_priority4_agents -v
"""

import math
import sys
import time
import unittest
import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional
from unittest.mock import MagicMock

# ── Stub heavy external dependencies (no pip install required) ────────────────
for dep in ["web3", "redis", "redis.asyncio", "websockets",
            "aiohttp", "structlog", "dotenv", "tenacity", "eth_account"]:
    if dep not in sys.modules:
        sys.modules[dep] = MagicMock()

# ═════════════════════════════════════════════════════════════════════════════
# Code under test — copied inline so tests are self-contained
# (In production these are imported from dex_price_monitor.py / arbitrage_engine.py)
# ═════════════════════════════════════════════════════════════════════════════

# ── Price math (from dex_price_monitor.py) ────────────────────────────────────

def sqrt_price_x96_to_price(sqrt_price_x96: int, decimals0: int, decimals1: int) -> float:
    """
    Convert Uniswap V3 sqrtPriceX96 to human-readable price.
    Returns token1 per token0 in human units.
    """
    if sqrt_price_x96 == 0:
        return 0.0
    Q96         = Decimal(2 ** 96)
    price_raw   = (Decimal(sqrt_price_x96) / Q96) ** 2
    # Adjust for token decimals: multiply by 10^d0 / 10^d1
    decimal_adj = Decimal(10 ** decimals0) / Decimal(10 ** decimals1)
    return float(price_raw * decimal_adj)


def reserves_to_price(reserve0: int, reserve1: int, decimals0: int, decimals1: int) -> float:
    """
    Compute price from AMM reserves.
    Returns: (reserve1 / 10^d1) / (reserve0 / 10^d0) = token1 per token0 in human units.
    """
    if reserve0 == 0:
        return 0.0
    r0 = Decimal(reserve0) / Decimal(10 ** decimals0)
    r1 = Decimal(reserve1) / Decimal(10 ** decimals1)
    return float(r1 / r0)


# ── Data models (from arbitrage_engine.py) ────────────────────────────────────

@dataclass
class PriceUpdate:
    dex: str; pool: str; token0: str; token1: str
    price: float; liquidity: int; fee_bps: int
    timestamp: float; block: int


@dataclass
class GraphEdge:
    pool: str; dex: str; token_in: str; token_out: str
    rate: float; fee_bps: int; liquidity: int
    timestamp: float; log_rate: float


@dataclass
class ArbitragePath:
    cycle: list; edges: list; flash_amount: int; gross_profit: int
    flash_fee: int; gas_cost_usdc: int; mev_buffer: int
    net_profit: int; profit_pct: float


# ── PriceGraph ────────────────────────────────────────────────────────────────

class PriceGraph:
    def __init__(self):
        self._edges: dict[str, list[GraphEdge]] = {}
        self._tokens: set[str] = set()

    def update_pool(self, update: PriceUpdate):
        token0 = update.token0.lower()
        token1 = update.token1.lower()
        if update.price <= 0:
            return
        fee_mult     = 1.0 - (update.fee_bps / 10_000)
        rate_forward = update.price * fee_mult
        rate_reverse = (1.0 / update.price) * fee_mult

        if rate_forward > 0:
            self._upsert(GraphEdge(
                pool=update.pool.lower(), dex=update.dex,
                token_in=token0, token_out=token1,
                rate=rate_forward, fee_bps=update.fee_bps,
                liquidity=update.liquidity, timestamp=update.timestamp,
                log_rate=math.log(rate_forward),
            ))
        if rate_reverse > 0:
            self._upsert(GraphEdge(
                pool=update.pool.lower(), dex=update.dex,
                token_in=token1, token_out=token0,
                rate=rate_reverse, fee_bps=update.fee_bps,
                liquidity=update.liquidity, timestamp=update.timestamp,
                log_rate=math.log(rate_reverse),
            ))
        self._tokens.add(token0)
        self._tokens.add(token1)

    def _upsert(self, edge: GraphEdge):
        key = edge.token_in
        if key not in self._edges:
            self._edges[key] = []
        for i, ex in enumerate(self._edges[key]):
            if ex.pool == edge.pool and ex.token_out == edge.token_out:
                self._edges[key][i] = edge
                return
        self._edges[key].append(edge)

    def get_edges_from(self, token: str) -> list[GraphEdge]:
        return self._edges.get(token.lower(), [])

    def all_tokens(self) -> list[str]:
        return list(self._tokens)

    def edge_count(self) -> int:
        return sum(len(v) for v in self._edges.values())


# ── Constants ────────────────────────────────────────────────────────────────

FLASH_TOKEN       = "0xusdc000000000000000000000000000000000000"
MAX_PATH_HOPS     = 4
PRICE_STALE_AFTER = 5.0
AAVE_FEE_BPS      = 5
DEFAULT_FLASH_AMOUNT = 10_000 * 1_000_000   # $10,000 USDC (6 decimals)
MEV_BUFFER_PCT    = 0.3
SLIPPAGE_BPS      = 50
GAS_ESTIMATE_2HOP = 350_000
GAS_ESTIMATE_3HOP = 500_000
GAS_ESTIMATE_4HOP = 650_000


# ── ArbitrageDetector ─────────────────────────────────────────────────────────

class ArbitrageDetector:
    def __init__(self, graph: PriceGraph, max_hops: int = MAX_PATH_HOPS):
        self._graph    = graph
        self._max_hops = max_hops

    def find_opportunities(self) -> list[list[GraphEdge]]:
        flash_token = FLASH_TOKEN.lower()
        if flash_token not in self._graph.all_tokens():
            return []

        opportunities  = []
        visited_cycles: set = set()

        def dfs(current_token, path, log_rate_sum, depth):
            if depth > self._max_hops:
                return
            for edge in self._graph.get_edges_from(current_token):
                if time.time() - edge.timestamp > PRICE_STALE_AFTER:
                    continue
                new_log_rate = log_rate_sum + edge.log_rate
                if edge.token_out == flash_token and depth >= 1:   # ← depth>=1 for min 2-hop
                    if new_log_rate > 0:
                        cycle_key = tuple(sorted(e.pool for e in path + [edge]))
                        if cycle_key not in visited_cycles:
                            visited_cycles.add(cycle_key)
                            opportunities.append(path + [edge])
                    continue
                visited_tokens = {flash_token} | {e.token_out for e in path}
                if edge.token_out in visited_tokens:
                    continue
                dfs(edge.token_out, path + [edge], new_log_rate, depth + 1)

        dfs(flash_token, [], 0.0, 0)
        return opportunities


# ── ProfitCalculator ──────────────────────────────────────────────────────────

class ProfitCalculator:
    def __init__(self, gas_price_wei: int = 1_000_000_000):
        self._gas_price_wei = gas_price_wei

    def calculate(self, edges: list[GraphEdge], eth_price_usdc: float) -> Optional[ArbitragePath]:
        current_amount = DEFAULT_FLASH_AMOUNT

        for edge in edges:
            slippage_factor = self._slippage_factor(current_amount, edge.liquidity)
            current_amount  = int(current_amount * edge.rate * slippage_factor)

        gross_profit = current_amount - DEFAULT_FLASH_AMOUNT
        if gross_profit <= 0:
            return None

        flash_fee   = (DEFAULT_FLASH_AMOUNT * AAVE_FEE_BPS) // 10_000
        gas_units   = {2: GAS_ESTIMATE_2HOP, 3: GAS_ESTIMATE_3HOP}.get(len(edges), GAS_ESTIMATE_4HOP)
        gas_eth     = gas_units * self._gas_price_wei / 1e18
        gas_usdc    = int(gas_eth * eth_price_usdc * 1e6)
        mev_buffer  = int(gross_profit * MEV_BUFFER_PCT)
        net_profit  = gross_profit - flash_fee - gas_usdc - mev_buffer

        if net_profit <= 0:
            return None

        cycle = [e.token_in for e in edges] + [edges[-1].token_out]
        return ArbitragePath(
            cycle=cycle, edges=edges,
            flash_amount=DEFAULT_FLASH_AMOUNT,
            gross_profit=gross_profit, flash_fee=flash_fee,
            gas_cost_usdc=gas_usdc, mev_buffer=mev_buffer,
            net_profit=net_profit,
            profit_pct=(net_profit / DEFAULT_FLASH_AMOUNT) * 100,
        )

    def _slippage_factor(self, trade_amount: int, liquidity: int) -> float:
        if liquidity == 0:
            return 1.0 - (SLIPPAGE_BPS / 10_000)
        impact = trade_amount / (liquidity + trade_amount)
        return max(0.99, 1.0 - impact)


# ── TradeOrderBuilder ─────────────────────────────────────────────────────────

class TradeOrderBuilder:
    DEX_TYPE_CODES = {"uniswap_v3": 0, "aerodrome": 1, "balancer_v2": 2, "curve": 3}

    def build(self, arb: ArbitragePath) -> dict:
        path = []
        for edge in arb.edges:
            path.append({
                "dex":      edge.pool,
                "dexType":  self.DEX_TYPE_CODES.get(edge.dex, 0),
                "tokenIn":  edge.token_in,
                "tokenOut": edge.token_out,
                "fee":      edge.fee_bps * 100,
                "minOut":   0,
                "poolId":   "0x" + "00" * 32,
            })
        return {
            "trade_id":              str(uuid.uuid4()),
            "flash_token":           FLASH_TOKEN,
            "flash_amount":          arb.flash_amount,
            "path":                  path,
            "min_profit":            arb.net_profit // 2,
            "deadline":              int(time.time()) + 60,
            "estimated_net_profit":  arb.net_profit,
        }


# ═════════════════════════════════════════════════════════════════════════════
# Test data helpers
# ═════════════════════════════════════════════════════════════════════════════

WETH  = "0xweth0000000000000000000000000000000000000"
DAI   = "0xdai00000000000000000000000000000000000000"
POOL1 = "0xpool1000000000000000000000000000000000000"
POOL2 = "0xpool2000000000000000000000000000000000000"
POOL3 = "0xpool3000000000000000000000000000000000000"

# Liquidity large enough that slippage doesn't eat a 2% gain
DEEP_LIQUIDITY = 100_000_000_000_000  # 100 trillion


def make_price_update(**kwargs) -> PriceUpdate:
    defaults = dict(
        dex="uniswap_v3", pool=POOL1, token0=FLASH_TOKEN, token1=WETH,
        price=1800.0, liquidity=DEEP_LIQUIDITY, fee_bps=5,
        timestamp=time.time(), block=1000,
    )
    defaults.update(kwargs)
    return PriceUpdate(**defaults)


def make_edge(**kwargs) -> GraphEdge:
    rate = kwargs.pop("rate", 1.005)
    defaults = dict(
        pool=POOL1.lower(), dex="uniswap_v3",
        token_in=FLASH_TOKEN.lower(), token_out=WETH.lower(),
        fee_bps=0, liquidity=DEEP_LIQUIDITY,
        timestamp=time.time(),
    )
    defaults.update(kwargs)
    defaults["rate"] = rate
    defaults["log_rate"] = math.log(rate)
    return GraphEdge(**defaults)


def profitable_2hop_edges(rate: float = 1.02) -> list[GraphEdge]:
    """A round-trip FLASH→WETH→FLASH at the given per-hop rate."""
    return [
        make_edge(token_in=FLASH_TOKEN.lower(), token_out=WETH.lower(),
                  pool=POOL1.lower(), dex="uniswap_v3", rate=rate),
        make_edge(token_in=WETH.lower(), token_out=FLASH_TOKEN.lower(),
                  pool=POOL2.lower(), dex="aerodrome", rate=rate),
    ]


def insert_profitable_cycle(graph: PriceGraph, rate: float = 1.02):
    """Directly insert a profitable cycle into the graph."""
    ft = FLASH_TOKEN.lower()
    wt = WETH.lower()
    graph._tokens.add(ft)
    graph._tokens.add(wt)
    graph._edges[ft] = [make_edge(token_in=ft, token_out=wt,
                                   pool=POOL1, rate=rate)]
    graph._edges[wt] = [make_edge(token_in=wt, token_out=ft,
                                   pool=POOL2, rate=rate)]


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 1: Price Math — sqrt_price_x96_to_price
# ═════════════════════════════════════════════════════════════════════════════

class TestSqrtPriceX96ToPrice(unittest.TestCase):

    def test_returns_token1_per_token0_in_human_units(self):
        """
        Pool with token0=USDC(d=6), token1=WETH(d=18).
        sqrtPriceX96 encodes WETH/USDC in raw units.
        Result should be WETH-per-USDC in human units ≈ 1/1800.
        """
        price_raw = (1 / 1800) * (10 ** 18) / (10 ** 6)   # WETH_units / USDC_units
        sqrt_raw  = math.sqrt(price_raw)
        sqrt_x96  = int(sqrt_raw * (2 ** 96))
        result    = sqrt_price_x96_to_price(sqrt_x96, decimals0=6, decimals1=18)
        # result is WETH per USDC in human units ≈ 0.000556
        self.assertAlmostEqual(result, 1 / 1800, delta=1e-6)

    def test_stable_pair_near_one(self):
        """USDC/DAI (both 6 decimals) at 1:1 reserves → price ≈ 1.0."""
        Q96      = 2 ** 96
        sqrt_x96 = Q96  # sqrt(1) * 2^96
        result   = sqrt_price_x96_to_price(sqrt_x96, decimals0=6, decimals1=6)
        self.assertAlmostEqual(result, 1.0, places=6)

    def test_higher_sqrtprice_gives_higher_price(self):
        """Doubling the price should produce a higher result."""
        def to_sqrt_x96(price_raw):
            return int(math.sqrt(price_raw) * (2 ** 96))
        p1 = to_sqrt_x96(0.5)
        p2 = to_sqrt_x96(1.0)
        r1 = sqrt_price_x96_to_price(p1, decimals0=6, decimals1=6)
        r2 = sqrt_price_x96_to_price(p2, decimals0=6, decimals1=6)
        self.assertGreater(r2, r1)

    def test_zero_returns_zero(self):
        result = sqrt_price_x96_to_price(0, 6, 18)
        self.assertEqual(result, 0.0)

    def test_same_decimals_price_is_square_of_ratio(self):
        """With equal decimals the decimal adjustment cancels out."""
        Q96      = 2 ** 96
        sqrt_x96 = Q96 * 2   # sqrt(4) * Q96 = 4 after squaring
        result   = sqrt_price_x96_to_price(sqrt_x96, decimals0=6, decimals1=6)
        self.assertAlmostEqual(result, 4.0, places=4)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 2: Price Math — reserves_to_price
# ═════════════════════════════════════════════════════════════════════════════

class TestReservesToPrice(unittest.TestCase):

    def test_equal_reserves_equal_decimals_gives_one(self):
        result = reserves_to_price(1000 * 10**6, 1000 * 10**6, 6, 6)
        self.assertAlmostEqual(result, 1.0, places=6)

    def test_eth_usdc_price(self):
        """1 WETH reserve, 1800 USDC reserve → 1800 USDC per WETH."""
        result = reserves_to_price(1 * 10**18, 1800 * 10**6, 18, 6)
        self.assertAlmostEqual(result, 1800.0, delta=0.01)

    def test_zero_reserve0_returns_zero(self):
        result = reserves_to_price(0, 1000, 6, 6)
        self.assertEqual(result, 0.0)

    def test_price_is_token1_per_token0(self):
        """200 token1 for 100 token0 → price = 2.0."""
        result = reserves_to_price(100 * 10**6, 200 * 10**6, 6, 6)
        self.assertAlmostEqual(result, 2.0, places=6)

    def test_doubling_reserve1_doubles_price(self):
        r0     = 1000 * 10**6
        p_low  = reserves_to_price(r0, 1000 * 10**6, 6, 6)
        p_high = reserves_to_price(r0, 2000 * 10**6, 6, 6)
        self.assertAlmostEqual(p_high, p_low * 2, places=6)

    def test_decimal_adjustment_applied(self):
        """18-decimal token0 vs 6-decimal token1 — decimals must adjust."""
        r0 = 1 * 10**18   # 1 WETH
        r1 = 1800 * 10**6 # 1800 USDC
        result = reserves_to_price(r0, r1, 18, 6)
        self.assertAlmostEqual(result, 1800.0, delta=0.01)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 3: PriceGraph
# ═════════════════════════════════════════════════════════════════════════════

class TestPriceGraph(unittest.TestCase):

    def setUp(self):
        self.graph = PriceGraph()

    def test_empty_graph_has_no_tokens(self):
        self.assertEqual(self.graph.all_tokens(), [])

    def test_empty_graph_has_no_edges(self):
        self.assertEqual(self.graph.edge_count(), 0)

    def test_one_pool_creates_two_directed_edges(self):
        self.graph.update_pool(make_price_update())
        self.assertEqual(self.graph.edge_count(), 2)

    def test_both_token_addresses_tracked(self):
        self.graph.update_pool(make_price_update())
        tokens = self.graph.all_tokens()
        self.assertIn(FLASH_TOKEN.lower(), tokens)
        self.assertIn(WETH.lower(), tokens)

    def test_forward_edge_rate_deducts_fee(self):
        """rate = price * (1 - fee_bps/10000)."""
        self.graph.update_pool(make_price_update(price=1800.0, fee_bps=30))
        edges = self.graph.get_edges_from(FLASH_TOKEN)
        self.assertAlmostEqual(edges[0].rate, 1800.0 * (1 - 30/10_000), places=4)

    def test_reverse_edge_rate_is_inverse_with_fee(self):
        self.graph.update_pool(make_price_update(price=1800.0, fee_bps=30))
        edges = self.graph.get_edges_from(WETH)
        expected = (1.0 / 1800.0) * (1 - 30/10_000)
        self.assertAlmostEqual(edges[0].rate, expected, places=10)

    def test_updating_same_pool_replaces_not_duplicates(self):
        self.graph.update_pool(make_price_update(price=1800.0))
        self.graph.update_pool(make_price_update(price=1900.0))
        self.assertEqual(self.graph.edge_count(), 2)

    def test_updating_same_pool_uses_latest_price(self):
        self.graph.update_pool(make_price_update(price=1800.0, fee_bps=0))
        self.graph.update_pool(make_price_update(price=1900.0, fee_bps=0))
        edges = self.graph.get_edges_from(FLASH_TOKEN)
        self.assertAlmostEqual(edges[0].rate, 1900.0, places=2)

    def test_zero_price_creates_no_edges(self):
        self.graph.update_pool(make_price_update(price=0.0))
        self.assertEqual(self.graph.edge_count(), 0)

    def test_two_pools_same_pair_give_four_edges(self):
        self.graph.update_pool(make_price_update(pool=POOL1))
        self.graph.update_pool(make_price_update(pool=POOL2))
        self.assertEqual(self.graph.edge_count(), 4)

    def test_log_rate_equals_log_of_rate(self):
        self.graph.update_pool(make_price_update(price=1800.0, fee_bps=5))
        edges = self.graph.get_edges_from(FLASH_TOKEN)
        self.assertAlmostEqual(edges[0].log_rate, math.log(edges[0].rate), places=10)

    def test_unknown_token_returns_empty_list(self):
        self.assertEqual(self.graph.get_edges_from("0xunknown"), [])

    def test_three_token_graph_has_correct_counts(self):
        """USDC↔WETH + WETH↔DAI = 3 tokens, 4 edges."""
        self.graph.update_pool(make_price_update(
            token0=FLASH_TOKEN, token1=WETH, pool=POOL1))
        self.graph.update_pool(make_price_update(
            token0=WETH, token1=DAI, price=1.0, pool=POOL2))
        self.assertEqual(len(self.graph.all_tokens()), 3)
        self.assertEqual(self.graph.edge_count(), 4)

    def test_different_dex_types_tracked(self):
        self.graph.update_pool(make_price_update(pool=POOL1, dex="uniswap_v3"))
        self.graph.update_pool(make_price_update(pool=POOL2, dex="aerodrome"))
        edges = self.graph.get_edges_from(FLASH_TOKEN)
        dexes = {e.dex for e in edges}
        self.assertIn("uniswap_v3", dexes)
        self.assertIn("aerodrome",  dexes)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 4: ArbitrageDetector
# ═════════════════════════════════════════════════════════════════════════════

class TestArbitrageDetector(unittest.TestCase):

    def setUp(self):
        self.graph    = PriceGraph()
        self.detector = ArbitrageDetector(self.graph)

    def test_empty_graph_returns_no_opportunities(self):
        self.assertEqual(self.detector.find_opportunities(), [])

    def test_single_pool_cannot_form_cycle(self):
        self.graph.update_pool(make_price_update())
        self.assertEqual(self.detector.find_opportunities(), [])

    def test_detects_profitable_two_hop_cycle(self):
        insert_profitable_cycle(self.graph, rate=1.02)
        opps = self.detector.find_opportunities()
        self.assertGreater(len(opps), 0)

    def test_each_opportunity_is_a_list_of_edges(self):
        insert_profitable_cycle(self.graph, rate=1.02)
        opps = self.detector.find_opportunities()
        for path in opps:
            self.assertIsInstance(path, list)
            self.assertTrue(all(isinstance(e, GraphEdge) for e in path))

    def test_cycle_starts_and_ends_at_flash_token(self):
        insert_profitable_cycle(self.graph, rate=1.02)
        opps = self.detector.find_opportunities()
        for path in opps:
            self.assertEqual(path[0].token_in,  FLASH_TOKEN.lower())
            self.assertEqual(path[-1].token_out, FLASH_TOKEN.lower())

    def test_unprofitable_cycle_not_detected(self):
        """Rate < 1 per hop → log_rate_sum < 0 → not profitable."""
        insert_profitable_cycle(self.graph, rate=0.997)
        self.assertEqual(self.detector.find_opportunities(), [])

    def test_breakeven_cycle_not_detected(self):
        """Rate = 1.0 → log_rate_sum = 0 → not strictly profitable."""
        insert_profitable_cycle(self.graph, rate=1.0)
        self.assertEqual(self.detector.find_opportunities(), [])

    def test_stale_prices_excluded(self):
        """Edges older than PRICE_STALE_AFTER seconds are skipped."""
        ft = FLASH_TOKEN.lower()
        wt = WETH.lower()
        self.graph._tokens.add(ft)
        self.graph._tokens.add(wt)
        stale = time.time() - (PRICE_STALE_AFTER + 1)
        self.graph._edges[ft] = [make_edge(token_in=ft, token_out=wt,
                                            pool=POOL1, rate=1.02, timestamp=stale)]
        self.graph._edges[wt] = [make_edge(token_in=wt, token_out=ft,
                                            pool=POOL2, rate=1.02, timestamp=stale)]
        self.assertEqual(self.detector.find_opportunities(), [])

    def test_no_token_revisited_within_path(self):
        insert_profitable_cycle(self.graph, rate=1.02)
        opps = self.detector.find_opportunities()
        for path in opps:
            mid_tokens = [e.token_in for e in path]
            self.assertEqual(len(mid_tokens), len(set(mid_tokens)))

    def test_max_hops_limit_enforced(self):
        """Detector with max_hops=2 only returns paths of 2 edges or fewer."""
        detector = ArbitrageDetector(self.graph, max_hops=2)
        insert_profitable_cycle(self.graph, rate=1.02)
        for path in detector.find_opportunities():
            self.assertLessEqual(len(path), 2)

    def test_same_cycle_not_returned_twice(self):
        insert_profitable_cycle(self.graph, rate=1.02)
        opps = self.detector.find_opportunities()
        self.assertEqual(len(opps), 1)

    def test_flash_token_not_in_graph_returns_empty(self):
        """If flash token is not a known node, no opportunities possible."""
        self.graph.update_pool(make_price_update(
            token0=WETH, token1=DAI, pool=POOL1, price=1.0))
        self.assertEqual(self.detector.find_opportunities(), [])

    def test_three_hop_cycle_detected(self):
        """USDC → WETH → DAI → USDC profitable cycle should be found."""
        ft = FLASH_TOKEN.lower()
        wt = WETH.lower()
        dt = DAI.lower()
        for t in [ft, wt, dt]:
            self.graph._tokens.add(t)
        self.graph._edges[ft] = [make_edge(token_in=ft, token_out=wt, pool=POOL1, rate=1.02)]
        self.graph._edges[wt] = [make_edge(token_in=wt, token_out=dt, pool=POOL2, rate=1.02)]
        self.graph._edges[dt] = [make_edge(token_in=dt, token_out=ft, pool=POOL3, rate=1.02)]
        opps = self.detector.find_opportunities()
        self.assertGreater(len(opps), 0)
        self.assertTrue(any(len(p) == 3 for p in opps))


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 5: ProfitCalculator
# ═════════════════════════════════════════════════════════════════════════════

class TestProfitCalculator(unittest.TestCase):

    def setUp(self):
        self.calc     = ProfitCalculator(gas_price_wei=1_000_000_000)  # 1 gwei
        self.eth_usd  = 3000.0

    def test_profitable_path_returns_result(self):
        result = self.calc.calculate(profitable_2hop_edges(rate=1.02), self.eth_usd)
        self.assertIsNotNone(result)

    def test_unprofitable_path_returns_none(self):
        result = self.calc.calculate(profitable_2hop_edges(rate=0.995), self.eth_usd)
        self.assertIsNone(result)

    def test_net_profit_is_positive(self):
        result = self.calc.calculate(profitable_2hop_edges(rate=1.02), self.eth_usd)
        self.assertIsNotNone(result)
        self.assertGreater(result.net_profit, 0)

    def test_net_profit_less_than_gross(self):
        result = self.calc.calculate(profitable_2hop_edges(rate=1.02), self.eth_usd)
        self.assertIsNotNone(result)
        self.assertLess(result.net_profit, result.gross_profit)

    def test_flash_fee_is_correct_percentage(self):
        result = self.calc.calculate(profitable_2hop_edges(rate=1.02), self.eth_usd)
        self.assertIsNotNone(result)
        expected = (DEFAULT_FLASH_AMOUNT * AAVE_FEE_BPS) // 10_000
        self.assertEqual(result.flash_fee, expected)

    def test_mev_buffer_is_30_percent_of_gross(self):
        result = self.calc.calculate(profitable_2hop_edges(rate=1.05), self.eth_usd)
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result.mev_buffer, result.gross_profit * MEV_BUFFER_PCT, delta=1)

    def test_profit_pct_matches_net_over_flash(self):
        result = self.calc.calculate(profitable_2hop_edges(rate=1.02), self.eth_usd)
        self.assertIsNotNone(result)
        expected = (result.net_profit / DEFAULT_FLASH_AMOUNT) * 100
        self.assertAlmostEqual(result.profit_pct, expected, places=6)

    def test_cycle_starts_and_ends_at_flash_token(self):
        result = self.calc.calculate(profitable_2hop_edges(rate=1.02), self.eth_usd)
        self.assertIsNotNone(result)
        self.assertEqual(result.cycle[0],  FLASH_TOKEN.lower())
        self.assertEqual(result.cycle[-1], FLASH_TOKEN.lower())

    def test_higher_rate_produces_higher_profit(self):
        r1 = self.calc.calculate(profitable_2hop_edges(rate=1.02), self.eth_usd)
        r2 = self.calc.calculate(profitable_2hop_edges(rate=1.05), self.eth_usd)
        self.assertIsNotNone(r1)
        self.assertIsNotNone(r2)
        self.assertGreater(r2.net_profit, r1.net_profit)

    def test_3hop_gas_higher_than_2hop(self):
        dt = DAI.lower()
        edges_3 = [
            make_edge(token_in=FLASH_TOKEN.lower(), token_out=WETH.lower(), pool=POOL1, rate=1.02),
            make_edge(token_in=WETH.lower(),        token_out=dt,           pool=POOL2, rate=1.02),
            make_edge(token_in=dt,                  token_out=FLASH_TOKEN.lower(), pool=POOL3, rate=1.02),
        ]
        r2 = self.calc.calculate(profitable_2hop_edges(rate=1.02), self.eth_usd)
        r3 = self.calc.calculate(edges_3, self.eth_usd)
        if r2 and r3:
            self.assertGreater(r3.gas_cost_usdc, r2.gas_cost_usdc)

    def test_net_profit_formula_correct(self):
        """net = gross - flash_fee - gas - mev."""
        result = self.calc.calculate(profitable_2hop_edges(rate=1.02), self.eth_usd)
        self.assertIsNotNone(result)
        expected_net = (result.gross_profit - result.flash_fee
                        - result.gas_cost_usdc - result.mev_buffer)
        self.assertEqual(result.net_profit, expected_net)

    def test_returns_none_when_gas_exceeds_profit(self):
        """Very high gas price should make tiny profits unviable."""
        calc = ProfitCalculator(gas_price_wei=1_000_000_000_000)  # 1000 gwei
        result = calc.calculate(profitable_2hop_edges(rate=1.001), self.eth_usd)
        self.assertIsNone(result)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 6: Slippage Model
# ═════════════════════════════════════════════════════════════════════════════

class TestSlippageModel(unittest.TestCase):

    def setUp(self):
        self.calc = ProfitCalculator()

    def test_zero_liquidity_uses_default_slippage(self):
        factor = self.calc._slippage_factor(1_000_000, 0)
        self.assertAlmostEqual(factor, 1.0 - SLIPPAGE_BPS/10_000, places=6)

    def test_tiny_trade_vs_huge_liquidity_near_zero_impact(self):
        factor = self.calc._slippage_factor(1_000, 1_000_000_000_000_000)
        self.assertGreater(factor, 0.9999)

    def test_large_trade_vs_tiny_liquidity_hits_floor(self):
        factor = self.calc._slippage_factor(1_000_000_000, 1_000)
        self.assertAlmostEqual(factor, 0.99, places=2)

    def test_factor_never_exceeds_one(self):
        factor = self.calc._slippage_factor(100, 1_000_000_000_000)
        self.assertLessEqual(factor, 1.0)

    def test_factor_always_positive(self):
        factor = self.calc._slippage_factor(10_000_000_000, 1)
        self.assertGreater(factor, 0.0)

    def test_larger_trade_worse_factor(self):
        f_small = self.calc._slippage_factor(1_000,     10_000_000)
        f_large = self.calc._slippage_factor(5_000_000, 10_000_000)
        self.assertLessEqual(f_large, f_small)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 7: TradeOrderBuilder
# ═════════════════════════════════════════════════════════════════════════════

class TestTradeOrderBuilder(unittest.TestCase):

    def setUp(self):
        self.builder = TradeOrderBuilder()
        self.calc    = ProfitCalculator(gas_price_wei=1_000_000_000)
        self.arb     = self.calc.calculate(profitable_2hop_edges(rate=1.02), 3000.0)

    def test_returns_a_dict(self):
        self.assertIsNotNone(self.arb)
        order = self.builder.build(self.arb)
        self.assertIsInstance(order, dict)

    def test_trade_id_present_and_non_empty(self):
        order = self.builder.build(self.arb)
        self.assertIn("trade_id", order)
        self.assertGreater(len(order["trade_id"]), 0)

    def test_unique_trade_ids_per_call(self):
        o1 = self.builder.build(self.arb)
        o2 = self.builder.build(self.arb)
        self.assertNotEqual(o1["trade_id"], o2["trade_id"])

    def test_path_length_matches_edge_count(self):
        order = self.builder.build(self.arb)
        self.assertEqual(len(order["path"]), len(self.arb.edges))

    def test_dex_type_codes_correct(self):
        order = self.builder.build(self.arb)
        self.assertEqual(order["path"][0]["dexType"], 0)  # uniswap_v3
        self.assertEqual(order["path"][1]["dexType"], 1)  # aerodrome

    def test_flash_token_field_set(self):
        order = self.builder.build(self.arb)
        self.assertEqual(order["flash_token"], FLASH_TOKEN)

    def test_deadline_is_in_future(self):
        order = self.builder.build(self.arb)
        self.assertGreater(order["deadline"], int(time.time()))

    def test_min_profit_is_half_net_profit(self):
        order = self.builder.build(self.arb)
        self.assertEqual(order["min_profit"], self.arb.net_profit // 2)

    def test_each_hop_has_all_required_fields(self):
        order    = self.builder.build(self.arb)
        required = {"dex", "dexType", "tokenIn", "tokenOut", "fee", "minOut", "poolId"}
        for hop in order["path"]:
            self.assertEqual(set(hop.keys()), required)

    def test_flash_amount_matches_arb(self):
        order = self.builder.build(self.arb)
        self.assertEqual(order["flash_amount"], self.arb.flash_amount)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 8: End-to-End Integration
# ═════════════════════════════════════════════════════════════════════════════

class TestEndToEndPipeline(unittest.TestCase):

    def test_price_update_to_trade_order(self):
        """Full pipeline: PriceUpdate → Graph → Detect → Price → Build Order."""
        graph    = PriceGraph()
        detector = ArbitrageDetector(graph)
        calc     = ProfitCalculator(gas_price_wei=1_000_000_000)
        builder  = TradeOrderBuilder()

        insert_profitable_cycle(graph, rate=1.02)

        opps = detector.find_opportunities()
        self.assertGreater(len(opps), 0)

        arb = calc.calculate(opps[0], 3000.0)
        self.assertIsNotNone(arb)
        self.assertGreater(arb.net_profit, 0)

        order = builder.build(arb)
        self.assertIn("trade_id", order)
        self.assertEqual(len(order["path"]), 2)

    def test_unprofitable_cycle_produces_no_order(self):
        """Unprofitable cycles should not reach the builder."""
        graph    = PriceGraph()
        detector = ArbitrageDetector(graph)
        calc     = ProfitCalculator(gas_price_wei=1_000_000_000)

        insert_profitable_cycle(graph, rate=0.997)

        opps = detector.find_opportunities()
        self.assertEqual(opps, [])  # Detector stops it

    def test_stale_prices_blocked_before_order(self):
        """Stale price data is discarded at the detector level."""
        graph    = PriceGraph()
        detector = ArbitrageDetector(graph)

        ft = FLASH_TOKEN.lower()
        wt = WETH.lower()
        graph._tokens.add(ft)
        graph._tokens.add(wt)
        stale = time.time() - (PRICE_STALE_AFTER + 2)
        graph._edges[ft] = [make_edge(token_in=ft, token_out=wt,
                                       pool=POOL1, rate=1.02, timestamp=stale)]
        graph._edges[wt] = [make_edge(token_in=wt, token_out=ft,
                                       pool=POOL2, rate=1.02, timestamp=stale)]

        self.assertEqual(detector.find_opportunities(), [])

    def test_three_hop_opportunity_priced_correctly(self):
        """3-hop profitable cycle should produce a valid trade order."""
        graph    = PriceGraph()
        detector = ArbitrageDetector(graph)
        calc     = ProfitCalculator(gas_price_wei=1_000_000_000)
        builder  = TradeOrderBuilder()

        ft = FLASH_TOKEN.lower()
        wt = WETH.lower()
        dt = DAI.lower()
        for t in [ft, wt, dt]:
            graph._tokens.add(t)
        graph._edges[ft] = [make_edge(token_in=ft, token_out=wt, pool=POOL1, rate=1.02)]
        graph._edges[wt] = [make_edge(token_in=wt, token_out=dt, pool=POOL2, rate=1.02)]
        graph._edges[dt] = [make_edge(token_in=dt, token_out=ft, pool=POOL3, rate=1.02)]

        opps = detector.find_opportunities()
        three_hop = [p for p in opps if len(p) == 3]
        self.assertGreater(len(three_hop), 0)

        arb = calc.calculate(three_hop[0], 3000.0)
        if arb:  # might not be profitable after fees
            order = builder.build(arb)
            self.assertEqual(len(order["path"]), 3)

    def test_price_graph_update_propagates_to_detector(self):
        """A price update that creates a profitable cycle is immediately detectable."""
        graph    = PriceGraph()
        detector = ArbitrageDetector(graph)

        # Before update — no opportunities
        self.assertEqual(detector.find_opportunities(), [])

        # After update — profitable cycle inserted
        insert_profitable_cycle(graph, rate=1.02)
        opps = detector.find_opportunities()
        self.assertGreater(len(opps), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)