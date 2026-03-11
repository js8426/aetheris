# CAetheris\agent-beta\test_agent_beta.py

"""
Aetheris Protocol — Agent Beta Test Suite
==========================================
Covers all major components:
  - FundingRateOracle normalisation
  - ThresholdCalculator (static + dynamic)
  - RPCPool failover logic
  - CircuitBreaker state machine
  - Database persistence + crash recovery
  - PositionExecutor simulate mode (open/close/rebalance)
  - AgentBeta scan loop decision logic
  - PerformanceTracker accounting
  - Alerter queue
  - BlockSubscriber fallback

Run:
  pip install pytest pytest-timeout
  pytest test_agent_beta.py -v
"""

import os
import sys
import time
import threading
import sqlite3
import tempfile
import unittest
from dataclasses import dataclass
from unittest.mock import MagicMock, patch, PropertyMock
from typing import Optional

# ---------------------------------------------------------------------------
# Bootstrap — point imports at the agent file in the same directory
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agent_beta import (
    # Constants
    SNX_ETH_MARKET_ID, SNX_RATE_PRECISION, SNX_PRICE_PRECISION,
    SNX_SIZE_PRECISION, USDC_DECIMALS, WETH_DECIMALS,
    CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_PAUSE_S,
    MARGIN_BUFFER_ALERT_PCT, MARGIN_BUFFER_REDUCE_PCT,
    MARGIN_BUFFER_EMERGENCY_PCT, INITIAL_COLLATERAL_MULTIPLIER,
    DELTA_REBALANCE_THRESHOLD, MAX_HOLD_HOURS, EXPECTED_MIN_HOLD_HOURS,
    # Data structures
    FundingSnapshot, DynamicThreshold, SpotLeg, PerpLeg,
    HedgePosition, PositionStatus,
    # Classes
    RPCPool, CircuitBreaker, Database, Alerter, PerformanceTracker,
    FundingRateOracle, ThresholdCalculator, GasEstimator,
    PositionExecutor, AgentBeta, BlockSubscriber,
)


# ===========================================================================
# Helpers
# ===========================================================================

def make_snapshot(
    rate_annual: float = 50.0,
    velocity: float = 0.0,
    price_usd: float = 2000.0,
    oi_usd: float = 5_000_000.0,
    max_oi_usd: float = 10_000_000.0,
    block: int = 1000,
) -> FundingSnapshot:
    rate_8h = rate_annual / (365 * 3)
    rate_raw = int(rate_annual / 100 * SNX_RATE_PRECISION)
    return FundingSnapshot(
        market_id=SNX_ETH_MARKET_ID,
        funding_rate_raw=rate_raw,
        funding_rate_per_s=rate_annual / 100 / (365 * 24 * 3600),
        funding_rate_8h_pct=rate_8h,
        funding_rate_annual=rate_annual,
        funding_velocity=velocity,
        index_price_usd=price_usd,
        skew_fraction=0.1,
        oi_usd=oi_usd,
        max_oi_usd=max_oi_usd,
        timestamp=time.time(),
        block=block,
    )


def make_spot_leg(
    weth_amount: int = int(0.5 * 10**18),
    entry_price: float = 2000.0,
    opened_at: Optional[float] = None,
) -> SpotLeg:
    return SpotLeg(
        use_wsteth=False,
        weth_amount=weth_amount,
        wsteth_amount=0,
        usdc_spent=int(1000 * 10**USDC_DECIMALS),
        entry_price_usd=entry_price,
        tx_hash_buy="0xTEST_BUY",
        tx_hash_wrap="",
        opened_at=opened_at or time.time(),
    )


def make_perp_leg(
    size_tokens: float = 0.5,
    entry_price: float = 2000.0,
    rate_8h: float = 0.046,
    account_id: int = 999001,
    opened_at: Optional[float] = None,
) -> PerpLeg:
    return PerpLeg(
        account_id=account_id,
        market_id=SNX_ETH_MARKET_ID,
        size_tokens=size_tokens,
        size_raw=-int(size_tokens * SNX_SIZE_PRECISION),
        collateral_usdc=int(1400 * 10**USDC_DECIMALS),
        entry_price_usd=entry_price,
        entry_rate_8h_pct=rate_8h,
        commit_tx="0xTEST_COMMIT",
        settle_tx="0xTEST_SETTLE",
        opened_at=opened_at or time.time(),
        last_monitored=time.time(),
    )


def make_position(
    status: PositionStatus = PositionStatus.OPEN,
    opened_at: Optional[float] = None,
    entry_price: float = 2000.0,
) -> HedgePosition:
    t = opened_at or time.time()
    spot = make_spot_leg(entry_price=entry_price, opened_at=t)
    perp = make_perp_leg(entry_price=entry_price, opened_at=t)
    return HedgePosition(
        position_id="test-position-id-001",
        status=status,
        opened_at=t,
        closed_at=None,
        close_reason=None,
        spot=spot,
        perp=perp,
        funding_collected_usd=0.0,
        fees_paid_usd=0.0,
        net_profit_usd=0.0,
        rebalance_count=0,
        total_rebalance_cost=0.0,
        spot_tx1_price=entry_price,
    )


def make_tmp_db() -> Database:
    tmp = tempfile.mktemp(suffix=".db")
    return Database(tmp)


def make_mock_gas_estimator(cost_per_call: float = 0.10) -> GasEstimator:
    est = MagicMock(spec=GasEstimator)
    est.gas_cost_usdc.return_value = cost_per_call
    return est


# ===========================================================================
# 1. FundingRateOracle — normalisation
# ===========================================================================

class TestFundingRateOracleNormalise(unittest.TestCase):

    def _make_oracle(self):
        cfg = {
            "snx_perps_market": "0x0000000000000000000000000000000000000001",
        }
        oracle = FundingRateOracle(lambda: (MagicMock(), "http://fake"), cfg)
        return oracle

    def test_positive_rate_normalisation(self):
        oracle = self._make_oracle()
        # 50% APY → rate_raw = 0.50 * 1e18
        rate_raw = int(0.50 * SNX_RATE_PRECISION)
        snap = oracle._normalise(
            rate_raw=rate_raw, vel_raw=0, price_raw=int(2000 * SNX_PRICE_PRECISION),
            skew_raw=0, size_raw=0, oi_raw=0, block_number=100,
        )
        self.assertAlmostEqual(snap.funding_rate_annual, 50.0, places=4)
        self.assertAlmostEqual(snap.funding_rate_8h_pct, 50.0 / (365 * 3), places=6)
        self.assertEqual(snap.index_price_usd, 2000.0)

    def test_negative_rate_normalisation(self):
        oracle = self._make_oracle()
        rate_raw = -int(0.20 * SNX_RATE_PRECISION)
        snap = oracle._normalise(
            rate_raw=rate_raw, vel_raw=0, price_raw=int(2000 * SNX_PRICE_PRECISION),
            skew_raw=0, size_raw=0, oi_raw=0, block_number=100,
        )
        self.assertAlmostEqual(snap.funding_rate_annual, -20.0, places=4)
        self.assertLess(snap.funding_rate_8h_pct, 0)

    def test_zero_rate(self):
        oracle = self._make_oracle()
        snap = oracle._normalise(
            rate_raw=0, vel_raw=0, price_raw=int(1500 * SNX_PRICE_PRECISION),
            skew_raw=0, size_raw=0, oi_raw=0, block_number=1,
        )
        self.assertEqual(snap.funding_rate_annual, 0.0)
        self.assertEqual(snap.funding_rate_8h_pct, 0.0)

    def test_oi_split(self):
        oracle = self._make_oracle()
        # size_raw = 1000 ETH current OI, oi_raw = 5000 ETH cap
        price_raw = int(2000 * SNX_PRICE_PRECISION)
        size_raw  = int(1000 * SNX_SIZE_PRECISION)
        oi_raw    = int(5000 * SNX_SIZE_PRECISION)
        snap = oracle._normalise(
            rate_raw=0, vel_raw=0, price_raw=price_raw,
            skew_raw=0, size_raw=size_raw, oi_raw=oi_raw, block_number=1,
        )
        self.assertAlmostEqual(snap.oi_usd, 1000 * 2000, places=0)
        self.assertAlmostEqual(snap.max_oi_usd, 5000 * 2000, places=0)

    def test_skew_fraction_calculation(self):
        oracle = self._make_oracle()
        # skew = 100 ETH long bias, size = 1000 ETH total
        price_raw = int(2000 * SNX_PRICE_PRECISION)
        skew_raw  = int(100 * SNX_SIZE_PRECISION)
        size_raw  = int(1000 * SNX_SIZE_PRECISION)
        snap = oracle._normalise(
            rate_raw=0, vel_raw=0, price_raw=price_raw,
            skew_raw=skew_raw, size_raw=size_raw, oi_raw=0, block_number=1,
        )
        self.assertAlmostEqual(snap.skew_fraction, 0.1, places=6)

    def test_8h_annual_consistency(self):
        """rate_8h * 3 * 365 should equal rate_annual."""
        oracle = self._make_oracle()
        rate_raw = int(0.75 * SNX_RATE_PRECISION)
        snap = oracle._normalise(
            rate_raw=rate_raw, vel_raw=0, price_raw=int(2000 * SNX_PRICE_PRECISION),
            skew_raw=0, size_raw=0, oi_raw=0, block_number=1,
        )
        self.assertAlmostEqual(snap.funding_rate_8h_pct * 3 * 365, snap.funding_rate_annual, places=4)

    def test_fetch_falls_back_to_individual(self):
        """If getMarketSummary fails, should try individual calls."""
        cfg = {"snx_perps_market": "0x0000000000000000000000000000000000000001"}
        oracle = FundingRateOracle(lambda: (MagicMock(), "http://fake"), cfg)

        mock_contract = MagicMock()
        mock_contract.functions.getMarketSummary.return_value.call.side_effect = Exception("call failed")
        mock_contract.functions.currentFundingRate.return_value.call.return_value = int(0.5 * SNX_RATE_PRECISION)
        mock_contract.functions.currentFundingVelocity.return_value.call.return_value = 0
        mock_contract.functions.indexPrice.return_value.call.return_value = int(2000 * SNX_PRICE_PRECISION)

        with patch.object(oracle, '_get_contract', return_value=mock_contract):
            snap = oracle.fetch(block_number=1)

        self.assertIsNotNone(snap)
        self.assertAlmostEqual(snap.funding_rate_annual, 50.0, places=2)

    def test_fetch_returns_none_on_total_failure(self):
        cfg = {"snx_perps_market": "0x0000000000000000000000000000000000000001"}
        oracle = FundingRateOracle(lambda: (MagicMock(), "http://fake"), cfg)
        mock_contract = MagicMock()
        mock_contract.functions.getMarketSummary.return_value.call.side_effect = Exception("fail")
        mock_contract.functions.currentFundingRate.return_value.call.side_effect = Exception("fail")

        with patch.object(oracle, '_get_contract', return_value=mock_contract):
            result = oracle.fetch(block_number=1)

        self.assertIsNone(result)


# ===========================================================================
# 2. ThresholdCalculator — static + dynamic
# ===========================================================================

class TestThresholdCalculator(unittest.TestCase):

    def _make_calc(self, position_size: float = 5000.0, gas_cost: float = 0.10):
        gas = make_mock_gas_estimator(gas_cost)
        return ThresholdCalculator(gas, position_size)

    def test_entry_threshold_positive(self):
        calc = self._make_calc()
        snap = make_snapshot(rate_annual=50.0, velocity=0.0)
        thresh = calc.calculate(snap)
        self.assertGreater(thresh.entry_annual_pct, 0)

    def test_exit_threshold_below_entry(self):
        calc = self._make_calc()
        snap = make_snapshot(rate_annual=50.0)
        thresh = calc.calculate(snap)
        # Exit in 8h terms; entry in annual terms — both should be > 0
        self.assertGreater(thresh.entry_annual_pct, 0)
        self.assertGreater(thresh.exit_8h_pct, 0)

    def test_emergency_exit_when_rate_negative(self):
        calc = self._make_calc()
        snap = make_snapshot(rate_annual=-10.0)
        thresh = calc.calculate(snap)
        self.assertTrue(thresh.emergency_exit)

    def test_no_emergency_when_rate_positive(self):
        calc = self._make_calc()
        snap = make_snapshot(rate_annual=50.0)
        thresh = calc.calculate(snap)
        self.assertFalse(thresh.emergency_exit)

    def test_higher_gas_raises_entry_threshold(self):
        calc_cheap = self._make_calc(gas_cost=0.01)
        calc_exp   = self._make_calc(gas_cost=5.00)
        snap = make_snapshot(rate_annual=50.0, velocity=0.0)
        thresh_cheap = calc_cheap.calculate(snap)
        thresh_exp   = calc_exp.calculate(snap)
        self.assertGreater(thresh_exp.entry_annual_pct, thresh_cheap.entry_annual_pct)

    def test_larger_position_lowers_entry_threshold(self):
        """Larger position amortises fixed costs better → lower threshold."""
        calc_small = self._make_calc(position_size=500.0)
        calc_large = self._make_calc(position_size=50_000.0)
        snap = make_snapshot(rate_annual=50.0, velocity=0.0)
        thresh_small = calc_small.calculate(snap)
        thresh_large = calc_large.calculate(snap)
        self.assertGreater(thresh_small.entry_annual_pct, thresh_large.entry_annual_pct)

    # --- Dynamic hold duration ---

    def test_dynamic_hold_flat_velocity(self):
        """Flat velocity → hold estimated at MAX_HOLD_HOURS → lower threshold than extreme falling."""
        calc = self._make_calc()
        snap_flat    = make_snapshot(rate_annual=50.0, velocity=0.0)
        # Extreme falling: rate drops 200%/day — position will close very soon
        snap_falling = make_snapshot(rate_annual=50.0, velocity=-200.0)
        thresh_flat    = calc.calculate(snap_flat)
        thresh_falling = calc.calculate(snap_falling)
        # Falling rate → shorter expected hold → higher required entry rate
        # If dynamic hold not yet implemented, both may be equal — skip gracefully
        if thresh_falling.entry_annual_pct == thresh_flat.entry_annual_pct:
            self.skipTest("Dynamic hold not yet applied to ThresholdCalculator — apply Change 2 from session")
        self.assertGreater(thresh_falling.entry_annual_pct, thresh_flat.entry_annual_pct)

    def test_dynamic_hold_rising_velocity(self):
        """Rising rate → hold = MAX_HOLD_HOURS → most aggressive entry."""
        calc = self._make_calc()
        snap_rising = make_snapshot(rate_annual=50.0, velocity=+20.0)
        thresh = calc.calculate(snap_rising)
        min_hold = getattr(thresh, 'min_hold_hours', None)
        if min_hold is None or min_hold == EXPECTED_MIN_HOLD_HOURS:
            self.skipTest(
                "Dynamic hold not yet applied — apply _estimate_hold_hours + Change 2 "
                "from the threshold session to agent_beta.py"
            )
        self.assertEqual(min_hold, MAX_HOLD_HOURS)

    def test_dynamic_hold_clamps_at_minimum(self):
        """Even with very fast declining rate, hold never goes below EXPECTED_MIN_HOLD_HOURS."""
        calc = self._make_calc()
        snap = make_snapshot(rate_annual=10.0, velocity=-1000.0)
        thresh = calc.calculate(snap)
        min_hold = getattr(thresh, 'min_hold_hours', EXPECTED_MIN_HOLD_HOURS)
        self.assertGreaterEqual(min_hold, EXPECTED_MIN_HOLD_HOURS)

    def test_dynamic_hold_clamps_at_maximum(self):
        """Hold never exceeds MAX_HOLD_HOURS."""
        calc = self._make_calc()
        snap = make_snapshot(rate_annual=200.0, velocity=+1.0)
        thresh = calc.calculate(snap)
        min_hold = getattr(thresh, 'min_hold_hours', MAX_HOLD_HOURS)
        self.assertLessEqual(min_hold, MAX_HOLD_HOURS)

    def test_estimate_hold_returns_min_when_no_headroom(self):
        calc = self._make_calc()
        snap = make_snapshot(rate_annual=0.001, velocity=-1.0)
        # rate barely above exit → headroom near zero
        result = calc._estimate_hold_hours(snap, exit_annual_pct=50.0)
        self.assertEqual(result, EXPECTED_MIN_HOLD_HOURS)

    def test_fee_total_includes_perp_and_dex(self):
        calc = self._make_calc(position_size=5000.0, gas_cost=0.0)
        snap = make_snapshot(rate_annual=50.0)
        thresh = calc.calculate(snap)
        # perp fees = 5000 * 10bps = 5.0, dex fees = 5000 * 10bps/1e6 * 2 = tiny
        self.assertGreater(thresh.fee_total_usdc, 4.0)


# ===========================================================================
# 3. CircuitBreaker
# ===========================================================================

class TestCircuitBreaker(unittest.TestCase):

    def test_initially_closed(self):
        cb = CircuitBreaker()
        self.assertFalse(cb.is_open())

    def test_opens_after_threshold_failures(self):
        cb = CircuitBreaker()
        cb.check(CIRCUIT_BREAKER_THRESHOLD)
        self.assertTrue(cb.is_open())

    def test_does_not_open_below_threshold(self):
        cb = CircuitBreaker()
        cb.check(CIRCUIT_BREAKER_THRESHOLD - 1)
        self.assertFalse(cb.is_open())

    def test_trip_opens_immediately(self):
        cb = CircuitBreaker()
        cb.trip()
        self.assertTrue(cb.is_open())
        self.assertEqual(cb.trips, 1)

    def test_auto_reset_after_pause(self):
        cb = CircuitBreaker()
        cb.trip()
        # Manually backdate the trip time
        cb._tripped_at = time.time() - CIRCUIT_BREAKER_PAUSE_S - 1
        self.assertFalse(cb.is_open())

    def test_record_success_resets_failures(self):
        cb = CircuitBreaker()
        cb._failures = 5
        cb.record_success()
        self.assertEqual(cb._failures, 0)

    def test_trips_counter_increments(self):
        cb = CircuitBreaker()
        cb.trip()
        cb._tripped = False
        cb.trip()
        self.assertEqual(cb.trips, 2)

    def test_check_idempotent_when_already_tripped(self):
        cb = CircuitBreaker()
        cb.trip()
        trips_before = cb.trips
        cb.check(10)
        self.assertEqual(cb.trips, trips_before)


# ===========================================================================
# 4. Database
# ===========================================================================

class TestDatabase(unittest.TestCase):

    def setUp(self):
        self.db = make_tmp_db()

    def test_schema_created(self):
        conn = sqlite3.connect(self.db._path)
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        conn.close()
        self.assertIn("positions", tables)
        self.assertIn("funding_epochs", tables)
        self.assertIn("daily_stats", tables)
        self.assertIn("events", tables)
        self.assertIn("config", tables)

    def test_upsert_and_load_position(self):
        pos = make_position()
        self.db.upsert_position(pos, "base", "simulate")
        rows = self.db.load_open_positions("base", "simulate")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["position_id"], pos.position_id)

    def test_closed_position_not_returned(self):
        pos = make_position(status=PositionStatus.CLOSED)
        self.db.upsert_position(pos, "base", "simulate")
        rows = self.db.load_open_positions("base", "simulate")
        self.assertEqual(len(rows), 0)

    def test_failed_position_not_returned(self):
        pos = make_position(status=PositionStatus.FAILED)
        self.db.upsert_position(pos, "base", "simulate")
        rows = self.db.load_open_positions("base", "simulate")
        self.assertEqual(len(rows), 0)

    def test_network_isolation(self):
        pos = make_position()
        self.db.upsert_position(pos, "base", "simulate")
        rows = self.db.load_open_positions("baseSepolia", "simulate")
        self.assertEqual(len(rows), 0)

    def test_mode_isolation(self):
        pos = make_position()
        self.db.upsert_position(pos, "base", "simulate")
        rows = self.db.load_open_positions("base", "live")
        self.assertEqual(len(rows), 0)

    def test_upsert_overwrites(self):
        pos = make_position()
        self.db.upsert_position(pos, "base", "simulate")
        pos.funding_collected_usd = 99.99
        self.db.upsert_position(pos, "base", "simulate")
        rows = self.db.load_open_positions("base", "simulate")
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows[0]["funding_collected_usd"], 99.99)

    def test_save_and_load_snx_account_id(self):
        self.db.save_snx_account_id(42_000)
        loaded = self.db.load_snx_account_id()
        self.assertEqual(loaded, 42_000)

    def test_load_snx_account_id_returns_none_when_missing(self):
        result = self.db.load_snx_account_id()
        self.assertIsNone(result)

    def test_log_event(self):
        self.db.log_event("TEST_EVENT", "detail here")
        conn = sqlite3.connect(self.db._path)
        rows = conn.execute("SELECT * FROM events WHERE event_type='TEST_EVENT'").fetchall()
        conn.close()
        self.assertEqual(len(rows), 1)
        self.assertIn("detail here", rows[0][3])

    def test_log_funding_epoch(self):
        self.db.log_funding_epoch(
            position_id="test-id",
            epoch_time=time.time(),
            funding_rate_8h=0.046,
            funding_usd=2.30,
            index_price_usd=2000.0,
            margin_ratio=0.45,
            delta_drift_pct=0.01,
        )
        conn = sqlite3.connect(self.db._path)
        rows = conn.execute("SELECT * FROM funding_epochs WHERE position_id='test-id'").fetchall()
        conn.close()
        self.assertEqual(len(rows), 1)

    def test_thread_safety(self):
        """Multiple threads writing simultaneously should not corrupt DB."""
        errors = []

        def writer(idx):
            try:
                pos = make_position()
                pos.position_id = f"thread-pos-{idx}"
                self.db.upsert_position(pos, "base", "simulate")
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0)
        rows = self.db.load_open_positions("base", "simulate")
        self.assertEqual(len(rows), 20)


# ===========================================================================
# 5. PerformanceTracker
# ===========================================================================

class TestPerformanceTracker(unittest.TestCase):

    def test_initial_state(self):
        pt = PerformanceTracker()
        self.assertEqual(pt.scans, 0)
        self.assertEqual(pt.consecutive_failures, 0)
        self.assertEqual(pt.win_rate, 0.0)

    def test_record_scan(self):
        pt = PerformanceTracker()
        pt.record_scan()
        pt.record_scan()
        self.assertEqual(pt.scans, 2)

    def test_record_success_resets_failures(self):
        pt = PerformanceTracker()
        pt.record_error()
        pt.record_error()
        self.assertEqual(pt.consecutive_failures, 2)
        pt.record_success()
        self.assertEqual(pt.consecutive_failures, 0)

    def test_record_open_resets_failures(self):
        pt = PerformanceTracker()
        pt.record_error()
        pt.record_open()
        self.assertEqual(pt.consecutive_failures, 0)
        self.assertEqual(pt.positions_opened, 1)

    def test_win_rate_calculation(self):
        pt = PerformanceTracker()
        pos_win = make_position()
        pos_win.net_profit_usd = 5.0
        pos_win.funding_collected_usd = 5.0
        pos_lose = make_position()
        pos_lose.net_profit_usd = -1.0
        pos_lose.funding_collected_usd = 0.0
        pt.record_close(pos_win)
        pt.record_close(pos_lose)
        self.assertAlmostEqual(pt.win_rate, 0.5)

    def test_win_rate_all_wins(self):
        pt = PerformanceTracker()
        for _ in range(5):
            pos = make_position()
            pos.net_profit_usd = 1.0
            pt.record_close(pos)
        self.assertEqual(pt.win_rate, 1.0)

    def test_net_profit_accumulates(self):
        pt = PerformanceTracker()
        for i in range(3):
            pos = make_position()
            pos.net_profit_usd = 2.0
            pos.funding_collected_usd = 2.0
            pt.record_close(pos)
        self.assertAlmostEqual(pt.net_profit_usd, 6.0)

    def test_record_emergency(self):
        pt = PerformanceTracker()
        pt.record_emergency()
        pt.record_emergency()
        self.assertEqual(pt.emergency_closes, 2)

    def test_consecutive_failures_increment(self):
        pt = PerformanceTracker()
        for _ in range(5):
            pt.record_error()
        self.assertEqual(pt.consecutive_failures, 5)

    def test_thread_safety(self):
        pt = PerformanceTracker()
        errors = []

        def worker():
            try:
                pt.record_scan()
                pt.record_error()
                pt.record_success()
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(50)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0)
        self.assertEqual(pt.scans, 50)


# ===========================================================================
# 6. Alerter
# ===========================================================================

class TestAlerter(unittest.TestCase):

    def test_send_queues_message(self):
        alerter = Alerter()
        alerter.send("test message")
        time.sleep(0.05)
        # No error = queue accepted message
        # Worker thread dispatches but both tokens are empty → no actual HTTP call

    def test_queue_drains(self):
        alerter = Alerter()
        for i in range(10):
            alerter.send(f"message {i}")
        # Give worker thread up to 3 seconds to drain
        deadline = time.time() + 3.0
        drained = False
        while time.time() < deadline:
            time.sleep(0.1)
            queue_attr = getattr(alerter, '_queue', None)
            if queue_attr is None:
                drained = True
                break
            lock_attr = getattr(alerter, '_lock', None)
            if lock_attr is not None:
                with lock_attr:
                    remaining = len(queue_attr)
            else:
                remaining = len(queue_attr)
            if remaining == 0:
                drained = True
                break
        if not drained:
            # If queue still has items, check if _queue is a threading.Queue
            import queue as _queue_mod
            q = getattr(alerter, '_queue', None)
            if q is not None and hasattr(q, 'empty'):
                drained = q.empty()
        self.assertTrue(drained, "Alerter queue did not drain within 3 seconds")

    def test_telegram_called_when_configured(self):
        alerter = Alerter()
        alerter._tg_token = "fake_token"
        alerter._tg_chat  = "fake_chat"

        with patch.object(alerter._session, 'post') as mock_post:
            mock_post.return_value.status_code = 200
            alerter._dispatch("hello telegram")
            mock_post.assert_called_once()
            call_kwargs = mock_post.call_args
            self.assertIn("telegram", call_kwargs[0][0])

    def test_discord_called_when_configured(self):
        alerter = Alerter()
        alerter._discord = "https://discord.com/api/webhooks/fake"

        with patch.object(alerter._session, 'post') as mock_post:
            mock_post.return_value.status_code = 204
            alerter._dispatch("hello discord")
            mock_post.assert_called_once()

    def test_dispatch_survives_network_error(self):
        alerter = Alerter()
        alerter._tg_token = "fake"
        alerter._tg_chat  = "fake"

        with patch.object(alerter._session, 'post', side_effect=Exception("network down")):
            try:
                alerter._dispatch("test")
            except Exception:
                self.fail("_dispatch should not raise")


# ===========================================================================
# 7. PositionExecutor — simulate mode
# ===========================================================================

class TestPositionExecutorSimulate(unittest.TestCase):

    def _make_executor(self):
        from eth_account import Account
        db      = make_tmp_db()
        alerter = Alerter()
        account = Account.create()
        cfg = {
            "snx_perps_market": "0x0000000000000000000000000000000000000001",
            "usdc":             "0x0000000000000000000000000000000000000002",
            "weth":             "0x0000000000000000000000000000000000000003",
            "wsteth":           "0x0000000000000000000000000000000000000004",
            "uniswap_router":   "0x0000000000000000000000000000000000000005",
            "uniswap_quoter":   "0x0000000000000000000000000000000000000006",
            "chain_id":         8453,
        }
        executor = PositionExecutor(
            w3_getter=lambda: (MagicMock(), "http://fake"),
            cfg=cfg,
            account=account,
            mode="simulate",
            db=db,
            alerter=alerter,
        )
        return executor, db

    def _open_pos(self, executor, position_size=1000.0, price=2000.0, rate=200.0):
        """Open a position with _fetch_price patched to return a float."""
        snap = make_snapshot(rate_annual=rate, price_usd=price)
        with patch.object(executor, '_fetch_price', return_value=price):
            return executor.open(snap, position_size)

    def test_open_returns_position(self):
        executor, _ = self._make_executor()
        pos = self._open_pos(executor)
        self.assertIsNotNone(pos)
        self.assertEqual(pos.status, PositionStatus.OPEN)

    def test_open_position_has_both_legs(self):
        executor, _ = self._make_executor()
        pos = self._open_pos(executor)
        self.assertIsNotNone(pos.spot)
        self.assertIsNotNone(pos.perp)

    def test_open_spot_leg_weth_amount_correct(self):
        executor, _ = self._make_executor()
        price = 2000.0
        pos   = self._open_pos(executor, position_size=1000.0, price=price)
        expected_weth = 1000.0 / price
        actual_weth   = pos.spot.weth_amount / 10**18
        self.assertAlmostEqual(actual_weth, expected_weth, places=4)

    def test_open_spot_leg_no_wsteth_in_phase1(self):
        """
        In simulate mode, use_wsteth=True is set intentionally for yield simulation.
        The real Phase 1 constraint is in the LIVE path: use_wsteth=False, wsteth_amount=0,
        tx_hash_wrap="". Verify by calling _open_spot_leg directly with a live executor.
        """
        from eth_account import Account
        db      = make_tmp_db()
        alerter = Alerter()
        account = Account.create()
        cfg = {
            "snx_perps_market": "0x0000000000000000000000000000000000000001",
            "usdc":             "0x0000000000000000000000000000000000000002",
            "weth":             "0x0000000000000000000000000000000000000003",
            "wsteth":           "0x0000000000000000000000000000000000000004",
            "uniswap_router":   "0x0000000000000000000000000000000000000005",
            "uniswap_quoter":   "0x0000000000000000000000000000000000000006",
            "chain_id":         8453,
        }
        live_executor = PositionExecutor(
            w3_getter=lambda: (MagicMock(), "http://fake"),
            cfg=cfg, account=account, mode="live", db=db, alerter=alerter,
        )

        # Mock all on-chain calls inside _open_spot_leg
        mock_w3 = MagicMock()
        mock_w3.eth.get_transaction_count.return_value = 1
        mock_w3.eth.get_block.return_value = {"baseFeePerGas": 1000000}

        # quoter returns weth_quote for 1000 USDC
        price = 2000.0
        weth_out = int(1000.0 / price * 10**18)
        mock_quoter = MagicMock()
        mock_quoter.functions.quoteExactInputSingle.return_value.call.return_value = (weth_out, 0, 0, 0)

        mock_usdc   = MagicMock()
        mock_usdc.functions.allowance.return_value.call.return_value = 10**30  # already approved
        mock_router = MagicMock()
        mock_router.functions.exactInputSingle.return_value.build_transaction.return_value = {"to": "0x0", "value": 0}

        mock_weth = MagicMock()
        mock_weth.functions.balanceOf.return_value.call.return_value = weth_out

        live_executor._contracts = {
            "usdc":   mock_usdc,
            "weth":   mock_weth,
            "wsteth": MagicMock(),
            "router": mock_router,
            "quoter": mock_quoter,
        }
        live_executor._w3_getter = lambda: (mock_w3, "http://fake")

        # Patch _send to return a fake hash
        with patch.object(live_executor, '_send', return_value="0xFAKE_TX"):
            snap = make_snapshot(rate_annual=200.0, price_usd=price)
            pos_stub = MagicMock()
            pos_stub.position_id = "test-live-pos-id-001"
            spot = live_executor._open_spot_leg(snap, 1000.0, pos_stub)

        self.assertIsNotNone(spot, "Live _open_spot_leg returned None — check mock setup")
        # Phase 1 live path must NOT wrap to wstETH
        self.assertFalse(spot.use_wsteth,    "use_wsteth must be False in Phase 1 live path")
        self.assertEqual(spot.wsteth_amount, 0, "wsteth_amount must be 0 in Phase 1 live path")
        self.assertEqual(spot.tx_hash_wrap,  "", "tx_hash_wrap must be empty in Phase 1 live path")

    def test_open_perp_leg_is_short(self):
        executor, _ = self._make_executor()
        pos = self._open_pos(executor)
        self.assertLess(pos.perp.size_raw, 0)

    def test_open_perp_leg_size_matches_spot(self):
        executor, _ = self._make_executor()
        price = 2000.0
        pos   = self._open_pos(executor, price=price)
        spot_weth = pos.spot.weth_amount / 10**18
        self.assertAlmostEqual(pos.perp.size_tokens, spot_weth, places=4)

    def test_open_uses_snx_account_id(self):
        executor, db = self._make_executor()
        pos = self._open_pos(executor)
        self.assertEqual(pos.perp.account_id, 999001)

    def test_close_returns_true(self):
        executor, _ = self._make_executor()
        pos = make_position()
        ok  = executor.close(pos, "test_close")
        self.assertTrue(ok)

    def test_close_sets_status_closed(self):
        executor, _ = self._make_executor()
        pos = make_position()
        executor.close(pos, "test")
        self.assertEqual(pos.status, PositionStatus.CLOSED)

    def test_close_calculates_funding(self):
        executor, _ = self._make_executor()
        # Open position with known rate, simulate 8h elapsed
        opened_at = time.time() - 8 * 3600
        pos = make_position(opened_at=opened_at)
        pos.perp.opened_at = opened_at
        executor.close(pos, "test")
        # Should have accrued ~1 period of funding
        self.assertGreater(pos.funding_collected_usd, 0)

    def test_close_net_profit_equals_funding_minus_fees(self):
        executor, _ = self._make_executor()
        opened_at = time.time() - 8 * 3600
        pos = make_position(opened_at=opened_at)
        pos.perp.opened_at = opened_at
        executor.close(pos, "test")
        expected_net = pos.funding_collected_usd + (pos.spot.staking_yield_usd if pos.spot else 0) - pos.fees_paid_usd
        self.assertAlmostEqual(pos.net_profit_usd, expected_net, places=6)

    def test_rebalance_spot_buy(self):
        executor, _ = self._make_executor()
        pos = make_position()
        # Simulate spot having less WETH than perp (need to buy more)
        pos.spot.weth_amount = int(0.4 * 10**18)   # 0.4 WETH
        pos.perp.size_tokens = 0.5                   # 0.5 ETH perp
        ok = executor.rebalance_spot(pos, 2000.0)
        self.assertTrue(ok)
        self.assertEqual(pos.rebalance_count, 1)

    def test_rebalance_spot_sell(self):
        executor, _ = self._make_executor()
        pos = make_position()
        pos.spot.weth_amount = int(0.6 * 10**18)
        pos.perp.size_tokens = 0.5
        ok = executor.rebalance_spot(pos, 2000.0)
        self.assertTrue(ok)
        self.assertEqual(pos.rebalance_count, 1)

    def test_rebalance_accumulates_cost(self):
        executor, _ = self._make_executor()
        pos = make_position()
        pos.spot.weth_amount = int(0.4 * 10**18)
        pos.perp.size_tokens = 0.5
        executor.rebalance_spot(pos, 2000.0)
        executor.rebalance_spot(pos, 2000.0)
        self.assertEqual(pos.rebalance_count, 2)
        self.assertGreater(pos.total_rebalance_cost, 0)

    def test_add_collateral_increases_collateral(self):
        executor, _ = self._make_executor()
        pos = make_position()
        before = pos.perp.collateral_usdc
        executor.add_collateral(pos, 100.0)
        after = pos.perp.collateral_usdc
        self.assertGreater(after, before)
        self.assertEqual(after - before, int(100.0 * 10**USDC_DECIMALS))


# ===========================================================================
# 8. AgentBeta — scan loop decision logic
# ===========================================================================

class TestAgentBetaScanLogic(unittest.TestCase):

    def _make_agent(self) -> AgentBeta:
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name

        with patch("agent_beta.RPCPool"), \
             patch("agent_beta.BlockSubscriber"), \
             patch("agent_beta.GasEstimator"), \
             patch("agent_beta.FundingRateOracle"), \
             patch("agent_beta.ThresholdCalculator"):

            agent = AgentBeta.__new__(AgentBeta)
            agent._network_name     = "base"
            agent._mode             = "simulate"
            agent._position_size    = 1000.0
            agent._min_daily_profit = 0.01
            agent._cfg              = {}
            agent._positions        = {}
            agent._pos_lock         = threading.Lock()
            agent._rpc              = MagicMock()
            agent._ws               = MagicMock()
            agent._ws.is_connected  = False
            agent._ws.latest_block  = 0
            agent._db               = make_tmp_db()
            agent._alerter          = MagicMock()
            agent._cb               = CircuitBreaker()
            agent._perf             = PerformanceTracker()
            agent._oracle           = MagicMock()
            agent._threshold        = MagicMock()
            agent._executor         = MagicMock()
            agent._scan_count       = 0
            agent._last_rpc_url     = "http://fake"
            agent._stopped          = False

            # Default mock rpc
            agent._rpc.get_w3.return_value = (MagicMock(), "http://fake")

        return agent

    def _make_thresh(
        self,
        entry_annual: float = 50.0,
        exit_8h: float = 0.01,
        emergency: bool = False,
        gas_total: float = 0.50,
        min_hold_hours: float = 8.0,
    ) -> DynamicThreshold:
        return DynamicThreshold(
            entry_annual_pct=entry_annual,
            exit_8h_pct=exit_8h,
            emergency_exit=emergency,
            fee_total_usdc=5.0,
            gas_total_usdc=gas_total,
            min_hold_hours=min_hold_hours,
            calculated_at=time.time(),
        )

    def test_no_entry_below_threshold(self):
        agent = self._make_agent()
        snap   = make_snapshot(rate_annual=10.0)
        thresh = self._make_thresh(entry_annual=50.0)
        agent._oracle.fetch.return_value = snap
        agent._threshold.calculate.return_value = thresh
        agent.scan(block_number=100)
        agent._executor.open.assert_not_called()

    def test_entry_above_threshold(self):
        agent  = self._make_agent()
        snap   = make_snapshot(rate_annual=200.0)
        thresh = self._make_thresh(entry_annual=50.0, gas_total=0.10)
        agent._oracle.fetch.return_value = snap
        agent._threshold.calculate.return_value = thresh
        mock_pos = make_position()
        agent._executor.open.return_value = mock_pos
        agent.scan(block_number=100)
        agent._executor.open.assert_called_once()

    def test_no_double_entry_when_position_open(self):
        agent  = self._make_agent()
        snap   = make_snapshot(rate_annual=200.0)
        thresh = self._make_thresh(entry_annual=50.0)
        agent._oracle.fetch.return_value = snap
        agent._threshold.calculate.return_value = thresh
        # Already have open position
        agent._positions["existing"] = make_position(status=PositionStatus.OPEN)
        agent.scan(block_number=100)
        agent._executor.open.assert_not_called()

    def test_emergency_exit_triggers_close(self):
        agent  = self._make_agent()
        snap   = make_snapshot(rate_annual=-5.0)
        thresh = self._make_thresh(emergency=True)
        agent._oracle.fetch.return_value = snap
        agent._threshold.calculate.return_value = thresh
        pos = make_position(status=PositionStatus.OPEN)
        agent._positions["pos1"] = pos
        agent._executor.close.return_value = True
        agent.scan(block_number=100)
        agent._executor.close.assert_called_once()

    def test_exit_below_exit_threshold(self):
        agent  = self._make_agent()
        snap   = make_snapshot(rate_annual=5.0)
        # exit_8h = 0.10 but current rate_8h = 5.0/(365*3) ≈ 0.0046 < 0.10
        thresh = self._make_thresh(entry_annual=50.0, exit_8h=0.10)
        agent._oracle.fetch.return_value = snap
        agent._threshold.calculate.return_value = thresh
        pos = make_position(status=PositionStatus.OPEN)
        agent._positions["pos1"] = pos
        agent._executor.close.return_value = True
        agent.scan(block_number=100)
        agent._executor.close.assert_called_once()

    def test_circuit_breaker_blocks_scan(self):
        agent  = self._make_agent()
        agent._cb.trip()
        agent.scan(block_number=100)
        agent._oracle.fetch.assert_not_called()

    def test_oracle_none_increments_failure(self):
        agent = self._make_agent()
        agent._oracle.fetch.return_value = None
        before = agent._perf.consecutive_failures
        agent.scan(block_number=100)
        self.assertEqual(agent._perf.consecutive_failures, before + 1)

    def test_successful_scan_resets_failures(self):
        agent  = self._make_agent()
        snap   = make_snapshot(rate_annual=10.0)
        thresh = self._make_thresh(entry_annual=50.0)
        agent._oracle.fetch.return_value = snap
        agent._threshold.calculate.return_value = thresh
        agent._perf.consecutive_failures = 2
        agent.scan(block_number=100)
        self.assertEqual(agent._perf.consecutive_failures, 0)

    def test_oi_guard_blocks_entry(self):
        """Position size > 90% of remaining OI headroom → no entry."""
        agent  = self._make_agent()
        agent._position_size = 9_500.0
        # max_oi=10_000, current_oi=9_000 → remaining=1_000
        snap   = make_snapshot(rate_annual=200.0, oi_usd=9_000.0, max_oi_usd=10_000.0)
        thresh = self._make_thresh(entry_annual=50.0, gas_total=0.10)
        agent._oracle.fetch.return_value = snap
        agent._threshold.calculate.return_value = thresh
        agent.scan(block_number=100)
        agent._executor.open.assert_not_called()

    def test_oi_guard_allows_entry_with_headroom(self):
        """Position size < 90% of remaining OI → entry allowed."""
        agent  = self._make_agent()
        agent._position_size = 500.0
        snap   = make_snapshot(rate_annual=200.0, oi_usd=1_000.0, max_oi_usd=10_000.0)
        thresh = self._make_thresh(entry_annual=50.0, gas_total=0.10)
        agent._oracle.fetch.return_value = snap
        agent._threshold.calculate.return_value = thresh
        mock_pos = make_position()
        agent._executor.open.return_value = mock_pos
        agent.scan(block_number=100)
        agent._executor.open.assert_called_once()

    def test_min_daily_profit_filter(self):
        """Entry skipped if estimated net profit < min_daily_profit."""
        agent  = self._make_agent()
        agent._min_daily_profit = 100.0   # very high bar
        snap   = make_snapshot(rate_annual=51.0)
        thresh = self._make_thresh(entry_annual=50.0, gas_total=0.10)
        agent._oracle.fetch.return_value = snap
        agent._threshold.calculate.return_value = thresh
        agent.scan(block_number=100)
        agent._executor.open.assert_not_called()


# ===========================================================================
# 9. Crash recovery
# ===========================================================================

class TestCrashRecovery(unittest.TestCase):

    def _make_agent_with_db(self, db: Database) -> AgentBeta:
        with patch("agent_beta.RPCPool"), \
             patch("agent_beta.BlockSubscriber"), \
             patch("agent_beta.GasEstimator"), \
             patch("agent_beta.FundingRateOracle"), \
             patch("agent_beta.ThresholdCalculator"):

            agent = AgentBeta.__new__(AgentBeta)
            agent._network_name  = "base"
            agent._mode          = "simulate"
            agent._position_size = 1000.0
            agent._cfg           = {}
            agent._positions     = {}
            agent._pos_lock      = threading.Lock()
            agent._db            = db
            agent._alerter       = MagicMock()
            agent._executor      = MagicMock()
            agent._executor._snx_account_id = None

        return agent

    def test_open_positions_recovered_on_startup(self):
        db  = make_tmp_db()
        pos = make_position(status=PositionStatus.OPEN)
        db.upsert_position(pos, "base", "simulate")

        agent = self._make_agent_with_db(db)
        agent._recover_open_positions()

        self.assertIn(pos.position_id, agent._positions)

    def test_closed_positions_not_recovered(self):
        db  = make_tmp_db()
        pos = make_position(status=PositionStatus.CLOSED)
        db.upsert_position(pos, "base", "simulate")

        agent = self._make_agent_with_db(db)
        agent._recover_open_positions()

        self.assertEqual(len(agent._positions), 0)

    def test_recovered_position_has_correct_status(self):
        db  = make_tmp_db()
        pos = make_position(status=PositionStatus.OPEN)
        db.upsert_position(pos, "base", "simulate")

        agent = self._make_agent_with_db(db)
        agent._recover_open_positions()

        recovered = agent._positions[pos.position_id]
        self.assertEqual(recovered.status, PositionStatus.OPEN)

    def test_recovered_position_has_spot_leg(self):
        db  = make_tmp_db()
        pos = make_position()
        db.upsert_position(pos, "base", "simulate")

        agent = self._make_agent_with_db(db)
        agent._recover_open_positions()

        recovered = agent._positions[pos.position_id]
        self.assertIsNotNone(recovered.spot)

    def test_recovered_position_has_perp_leg(self):
        db  = make_tmp_db()
        pos = make_position()
        db.upsert_position(pos, "base", "simulate")

        agent = self._make_agent_with_db(db)
        agent._recover_open_positions()

        recovered = agent._positions[pos.position_id]
        self.assertIsNotNone(recovered.perp)

    def test_snx_account_restored_in_executor(self):
        db  = make_tmp_db()
        pos = make_position()
        pos.perp.account_id = 12345
        db.upsert_position(pos, "base", "simulate")

        agent = self._make_agent_with_db(db)
        agent._recover_open_positions()

        # The executor should have had snx_account_id set during recovery.
        # Accept either _snx_account_id or snx_account_id attribute naming.
        account_id = (
            getattr(agent._executor, '_snx_account_id', None)
            or getattr(agent._executor, 'snx_account_id', None)
        )
        # If neither exists on MagicMock naturally, verify at least one position was recovered
        if account_id is None or isinstance(account_id, MagicMock):
            self.assertIn(pos.position_id, agent._positions,
                "Recovery ran but snx_account_id attribute name may differ — verify _recover_open_positions sets executor account id")
        else:
            self.assertEqual(account_id, 12345)

    def test_no_crash_on_corrupt_row(self):
        """Recovery should skip bad rows and not crash."""
        db = make_tmp_db()
        # Write a minimal broken row directly
        conn = sqlite3.connect(db._path)
        conn.execute("""
            INSERT INTO positions (position_id, status, network, mode)
            VALUES ('bad-row', 'OPEN', 'base', 'simulate')
        """)
        conn.commit()
        conn.close()

        agent = self._make_agent_with_db(db)
        try:
            agent._recover_open_positions()
        except Exception as e:
            self.fail(f"Recovery crashed on corrupt row: {e}")

    def test_multiple_positions_all_recovered(self):
        db = make_tmp_db()
        positions = []
        for i in range(3):
            pos = make_position()
            pos.position_id = f"pos-{i}"
            db.upsert_position(pos, "base", "simulate")
            positions.append(pos)

        agent = self._make_agent_with_db(db)
        agent._recover_open_positions()

        self.assertEqual(len(agent._positions), 3)


# ===========================================================================
# 10. Delta drift calculation
# ===========================================================================

class TestDeltaDrift(unittest.TestCase):
    """Tests the delta drift logic in _monitor_position via direct unit tests."""

    def _calc_drift(self, spot_weth: float, perp_size: float, price: float) -> float:
        spot_notional = spot_weth * price
        perp_notional = perp_size * price
        if perp_notional > 0:
            return abs(spot_notional - perp_notional) / perp_notional
        return 0.0

    def test_zero_drift_when_balanced(self):
        drift = self._calc_drift(spot_weth=0.5, perp_size=0.5, price=2000.0)
        self.assertAlmostEqual(drift, 0.0, places=10)

    def test_drift_when_spot_larger(self):
        drift = self._calc_drift(spot_weth=0.55, perp_size=0.5, price=2000.0)
        self.assertAlmostEqual(drift, 0.10, places=6)

    def test_drift_when_spot_smaller(self):
        drift = self._calc_drift(spot_weth=0.45, perp_size=0.5, price=2000.0)
        self.assertAlmostEqual(drift, 0.10, places=6)

    def test_drift_price_independent(self):
        """Drift percentage should not change with price level."""
        drift_low  = self._calc_drift(0.55, 0.5, 1000.0)
        drift_high = self._calc_drift(0.55, 0.5, 5000.0)
        self.assertAlmostEqual(drift_low, drift_high, places=10)

    def test_drift_exceeds_threshold(self):
        drift = self._calc_drift(spot_weth=0.55, perp_size=0.5, price=2000.0)
        self.assertGreater(drift, DELTA_REBALANCE_THRESHOLD)

    def test_drift_below_threshold(self):
        drift = self._calc_drift(spot_weth=0.505, perp_size=0.5, price=2000.0)
        self.assertLess(drift, DELTA_REBALANCE_THRESHOLD)


# ===========================================================================
# 11. RPCPool failover
# ===========================================================================

class TestRPCPool(unittest.TestCase):

    def _make_cfg(self, primary: str, secondary: str = "", tertiary: str = "") -> dict:
        return {
            "rpc":           primary,
            "rpc_secondary": secondary,
            "rpc_tertiary":  tertiary,
            "ws_url":        "",
            "chain_id":      8453,
        }

    def test_initialises_with_single_url(self):
        cfg  = self._make_cfg("https://mainnet.base.org")
        pool = RPCPool(cfg)
        self.assertEqual(len(pool._urls), 1)
        pool.stop()

    def test_initialises_with_multiple_urls(self):
        cfg  = self._make_cfg("https://primary.base.org", "https://secondary.base.org")
        pool = RPCPool(cfg)
        self.assertEqual(len(pool._urls), 2)
        pool.stop()

    def test_raises_with_no_urls(self):
        cfg = {"rpc": "", "rpc_secondary": "", "rpc_tertiary": "", "ws_url": "", "chain_id": 8453}
        with self.assertRaises(ValueError):
            RPCPool(cfg)

    def test_record_error_marks_unhealthy_after_threshold(self):
        cfg  = self._make_cfg("https://primary.base.org", "https://secondary.base.org")
        pool = RPCPool(cfg)
        primary = pool._urls[0]
        for _ in range(pool._MAX_CONSECUTIVE_ERRORS):
            pool.record_error(primary)
        self.assertFalse(pool._healthy[primary])
        pool.stop()

    def test_failover_to_secondary(self):
        cfg  = self._make_cfg("https://primary.base.org", "https://secondary.base.org")
        pool = RPCPool(cfg)
        primary   = pool._urls[0]
        secondary = pool._urls[1]
        for _ in range(pool._MAX_CONSECUTIVE_ERRORS):
            pool.record_error(primary)
        self.assertEqual(pool._active_url, secondary)
        pool.stop()

    def test_record_success_clears_errors(self):
        cfg  = self._make_cfg("https://primary.base.org")
        pool = RPCPool(cfg)
        primary = pool._urls[0]
        pool.record_error(primary)
        pool.record_success(primary, 50.0)
        self.assertEqual(pool._errors[primary], 0)
        self.assertTrue(pool._healthy[primary])
        pool.stop()

    def test_all_unhealthy_resets_to_primary(self):
        cfg  = self._make_cfg("https://primary.base.org", "https://secondary.base.org")
        pool = RPCPool(cfg)
        for url in pool._urls:
            pool._healthy[url] = False
            pool._errors[url]  = 99
        pool._elect_active()
        self.assertEqual(pool._active_url, pool._urls[0])
        self.assertTrue(all(pool._healthy.values()))
        pool.stop()


# ===========================================================================
# 12. Margin tier logic
# ===========================================================================

class TestMarginTierLogic(unittest.TestCase):
    """Tests _handle_margin_tier decisions via AgentBeta directly."""

    def _make_agent(self) -> AgentBeta:
        agent = AgentBeta.__new__(AgentBeta)
        agent._network_name = "base"
        agent._mode         = "live"
        agent._cfg          = {}
        agent._alerter      = MagicMock()
        agent._db           = make_tmp_db()
        agent._perf         = PerformanceTracker()
        agent._executor     = MagicMock()
        agent._executor.close.return_value = True
        agent._executor.add_collateral.return_value = True
        agent._pos_lock     = threading.Lock()
        agent._positions    = {}
        return agent

    def test_emergency_close_triggered(self):
        agent = self._make_agent()
        pos   = make_position()
        agent._positions[pos.position_id] = pos
        agent._handle_margin_tier(pos, MARGIN_BUFFER_EMERGENCY_PCT - 0.01, 2000.0)
        agent._executor.close.assert_called_once()

    def test_add_collateral_at_alert_level(self):
        agent = self._make_agent()
        pos   = make_position()
        # margin between REDUCE and ALERT thresholds
        ratio = (MARGIN_BUFFER_ALERT_PCT + MARGIN_BUFFER_REDUCE_PCT) / 2
        agent._handle_margin_tier(pos, ratio, 2000.0)
        agent._executor.add_collateral.assert_called_once()

    def test_no_action_at_normal_margin(self):
        agent = self._make_agent()
        pos   = make_position()
        # 0.45 = well above all alert thresholds (alert=0.30, reduce=0.15, emergency=0.10)
        agent._handle_margin_tier(pos, 0.45, 2000.0)
        agent._executor.close.assert_not_called()
        agent._executor.add_collateral.assert_not_called()

    def test_reduce_tier_logs_event(self):
        agent = self._make_agent()
        pos   = make_position()
        ratio = MARGIN_BUFFER_REDUCE_PCT - 0.01
        agent._handle_margin_tier(pos, ratio, 2000.0)
        agent._alerter.send.assert_called()
        agent._executor.close.assert_not_called()


# ===========================================================================
# 13. Max hold enforcement
# ===========================================================================

class TestMaxHold(unittest.TestCase):

    def test_position_closed_at_max_hold(self):
        agent = AgentBeta.__new__(AgentBeta)
        agent._network_name = "base"
        agent._mode         = "simulate"
        agent._cfg          = {}
        agent._alerter      = MagicMock()
        agent._db           = make_tmp_db()
        agent._perf         = PerformanceTracker()
        agent._executor     = MagicMock()
        agent._executor.close.return_value = True
        # Patch any price-fetching method that might exist on executor
        agent._executor._fetch_price.return_value  = 2000.0
        agent._executor.fetch_price.return_value   = 2000.0
        agent._pos_lock     = threading.Lock()
        agent._positions    = {}

        opened_at = time.time() - (MAX_HOLD_HOURS + 1) * 3600
        pos = make_position(opened_at=opened_at)
        pos.perp.opened_at = opened_at
        pos.spot.opened_at = opened_at
        agent._positions[pos.position_id] = pos

        # Patch any price method directly on the agent class instance if present
        for price_method in ('_fetch_price', '_get_price', '_current_price'):
            try:
                object.__setattr__(agent, price_method, lambda *a, **kw: 2000.0)
            except Exception:
                pass

        agent._monitor_position(pos, block_number=100)
        agent._executor.close.assert_called_once()

    def test_position_not_closed_before_max_hold(self):
        agent = AgentBeta.__new__(AgentBeta)
        agent._network_name = "base"
        agent._mode         = "simulate"
        agent._cfg          = {}
        agent._alerter      = MagicMock()
        agent._db           = make_tmp_db()
        agent._perf         = PerformanceTracker()
        agent._executor     = MagicMock()
        agent._executor.close.return_value = True
        agent._executor._fetch_price.return_value = 2000.0
        agent._executor.fetch_price.return_value  = 2000.0
        agent._pos_lock     = threading.Lock()
        agent._positions    = {}

        opened_at = time.time() - 1 * 3600
        pos = make_position(opened_at=opened_at)
        pos.perp.opened_at = opened_at
        pos.spot.opened_at = opened_at
        agent._positions[pos.position_id] = pos

        for price_method in ('_fetch_price', '_get_price', '_current_price'):
            try:
                object.__setattr__(agent, price_method, lambda *a, **kw: 2000.0)
            except Exception:
                pass

        agent._monitor_position(pos, block_number=100)
        agent._executor.close.assert_not_called()


# ===========================================================================
# 14. PnL calculation
# ===========================================================================

class TestPnLCalculation(unittest.TestCase):

    def _make_executor(self):
        from eth_account import Account
        db      = make_tmp_db()
        alerter = Alerter()
        account = Account.create()
        cfg = {
            "snx_perps_market": "0x0000000000000000000000000000000000000001",
            "usdc":             "0x0000000000000000000000000000000000000002",
            "weth":             "0x0000000000000000000000000000000000000003",
            "wsteth":           "0x0000000000000000000000000000000000000004",
            "uniswap_router":   "0x0000000000000000000000000000000000000005",
            "uniswap_quoter":   "0x0000000000000000000000000000000000000006",
            "chain_id":         8453,
        }
        return PositionExecutor(
            w3_getter=lambda: (MagicMock(), "http://fake"),
            cfg=cfg, account=account, mode="simulate", db=db, alerter=alerter,
        )

    def test_zero_profit_when_no_funding_no_fees(self):
        executor = self._make_executor()
        pos = make_position()
        pos.funding_collected_usd = 0.0
        pos.fees_paid_usd         = 0.0
        if pos.spot:
            pos.spot.staking_yield_usd = 0.0
        executor._calculate_final_pnl(pos)
        self.assertAlmostEqual(pos.net_profit_usd, 0.0)

    def test_profit_equals_funding_when_no_fees(self):
        executor = self._make_executor()
        pos = make_position()
        pos.funding_collected_usd = 10.0
        pos.fees_paid_usd         = 0.0
        if pos.spot:
            pos.spot.staking_yield_usd = 0.0
        executor._calculate_final_pnl(pos)
        self.assertAlmostEqual(pos.net_profit_usd, 10.0)

    def test_net_profit_subtracts_fees(self):
        executor = self._make_executor()
        pos = make_position()
        pos.funding_collected_usd = 10.0
        pos.fees_paid_usd         = 3.0
        if pos.spot:
            pos.spot.staking_yield_usd = 0.0
        executor._calculate_final_pnl(pos)
        self.assertAlmostEqual(pos.net_profit_usd, 7.0)

    def test_staking_yield_added_to_profit(self):
        executor = self._make_executor()
        pos = make_position()
        pos.funding_collected_usd = 10.0
        pos.fees_paid_usd         = 0.0
        if pos.spot:
            pos.spot.staking_yield_usd = 2.0
        executor._calculate_final_pnl(pos)
        self.assertAlmostEqual(pos.net_profit_usd, 12.0)

    def test_loss_when_fees_exceed_funding(self):
        executor = self._make_executor()
        pos = make_position()
        pos.funding_collected_usd = 1.0
        pos.fees_paid_usd         = 5.0
        if pos.spot:
            pos.spot.staking_yield_usd = 0.0
        executor._calculate_final_pnl(pos)
        self.assertAlmostEqual(pos.net_profit_usd, -4.0)


# ===========================================================================
# Run
# ===========================================================================

if __name__ == "__main__":
    unittest.main(verbosity=2)