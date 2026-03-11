#!/usr/bin/env python3
"""
dashboard.py — Aetheris Agent Alpha Phase 2 Dashboard

Reads from agent.db (SQLite) and displays:
  - Live system health
  - Win rate, profit, gas, cumulative stats
  - Route scores and history
  - RPC pool status indicators
  - Progress against pre-defined success thresholds
  - Volatility mode history

Usage:
    python dashboard.py                  # default agent.db
    python dashboard.py --db agent.db    # explicit path
    python dashboard.py --watch          # auto-refresh every 5 seconds
    python dashboard.py --watch --interval 10
"""

import os
import sys
import sqlite3
import argparse
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List

# ─── Success thresholds (pre-defined, not changeable mid-test) ────────────────
THRESHOLD_TRADES_PER_WEEK   = 5      # min profitable trades / week
THRESHOLD_NET_PROFIT_30D    = 0.0    # must be positive after 30 days
THRESHOLD_WIN_RATE           = 60.0  # % win rate
THRESHOLD_CATASTROPHIC       = 0     # circuit breaker trips (goal: 0)
THRESHOLD_UPTIME_HOURS_DAY   = 20.0  # hours / day running

# ANSI colour codes (safe to use on PM2/standard terminals)
_R  = "\033[0m"
_B  = "\033[1m"
_G  = "\033[32m"   # green
_Y  = "\033[33m"   # yellow
_RD = "\033[31m"   # red
_C  = "\033[36m"   # cyan
_M  = "\033[35m"   # magenta
_DG = "\033[90m"   # dark grey

def _col(text: str, colour: str) -> str:
    return f"{colour}{text}{_R}"

def _ok(v: bool) -> str:
    return _col("✓", _G) if v else _col("✗", _RD)


class Dashboard:
    def __init__(self, db_path: str = "agent.db"):
        self.db_path = db_path
        if not os.path.exists(db_path):
            print(f"{_RD}Database not found: {db_path}{_R}")
            print("Start agent.py first to create the database.")
            sys.exit(1)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _q(self, sql: str, params=()) -> list:
        conn = self._connect()
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        return rows

    def _q1(self, sql: str, params=()) -> Optional[sqlite3.Row]:
        conn = self._connect()
        row  = conn.execute(sql, params).fetchone()
        conn.close()
        return row

    # ── Data fetchers ─────────────────────────────────────────────────────────

    def get_all_time_stats(self) -> dict:
        row = self._q1("""
            SELECT
                COUNT(*) as total_trades,
                SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as losses,
                SUM(net_profit_usd) as total_net,
                SUM(gross_profit_usd) as total_gross,
                SUM(gas_cost_usd) as total_gas,
                MAX(net_profit_usd) as best_trade,
                AVG(execution_time_s) as avg_exec_s
            FROM trades
        """)
        return dict(row) if row else {}

    def get_today_stats(self) -> dict:
        today = datetime.now(timezone.utc).date().isoformat()
        row   = self._q1("SELECT * FROM daily_stats WHERE date=?", (today,))
        return dict(row) if row else {}

    def get_30d_net_profit(self) -> float:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        row    = self._q1(
            "SELECT COALESCE(SUM(net_profit_usd),0) as s FROM trades "
            "WHERE timestamp >= ? AND success=1", (cutoff,))
        return float(row["s"]) if row else 0.0

    def get_weekly_wins(self) -> int:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        row    = self._q1(
            "SELECT COUNT(*) as c FROM trades WHERE timestamp >= ? AND success=1",
            (cutoff,))
        return int(row["c"]) if row else 0

    def get_recent_trades(self, n: int = 10) -> list:
        return self._q(
            "SELECT * FROM trades ORDER BY id DESC LIMIT ?", (n,))

    def get_route_scores(self) -> list:
        """Most recent score for each route key."""
        return self._q("""
            SELECT rs.route_key, rs.score,
                   rs.profit_last_usd,
                   rs.timestamp
            FROM route_scores rs
            WHERE (rs.route_key, rs.timestamp) IN (
                SELECT route_key, MAX(timestamp)
                FROM route_scores
                GROUP BY route_key
            )
            ORDER BY rs.score DESC
        """)

    def get_route_history(self, route_key: str, n: int = 10) -> list:
        return self._q(
            "SELECT timestamp, score FROM route_scores WHERE route_key=? "
            "ORDER BY id DESC LIMIT ?", (route_key, n))

    def get_scan_stats(self) -> dict:
        row = self._q1("""
            SELECT
                COUNT(*) as total_scans,
                AVG(scan_duration_ms) as avg_scan_ms,
                MAX(scan_duration_ms) as max_scan_ms,
                SUM(opportunities_found) as total_opps
            FROM scans
        """)
        return dict(row) if row else {}

    def get_recent_volatility(self, n: int = 5) -> list:
        return self._q(
            "SELECT timestamp, volatility_mode, volatility_value "
            "FROM scans WHERE volatility_mode IS NOT NULL "
            "ORDER BY id DESC LIMIT ?", (n,))

    def get_rpc_usage(self) -> list:
        return self._q("""
            SELECT rpc_endpoint,
                   COUNT(*) as used,
                   AVG(scan_duration_ms) as avg_ms
            FROM scans
            WHERE rpc_endpoint IS NOT NULL
            GROUP BY rpc_endpoint
            ORDER BY used DESC
        """)

    def get_recent_events(self, n: int = 8) -> list:
        return self._q(
            "SELECT * FROM events ORDER BY id DESC LIMIT ?", (n,))

    def get_gas_tier_breakdown(self) -> list:
        return self._q("""
            SELECT gas_tier, COUNT(*) as cnt,
                   SUM(net_profit_usd) as net,
                   AVG(gas_cost_usd) as avg_gas
            FROM trades
            WHERE gas_tier IS NOT NULL
            GROUP BY gas_tier
            ORDER BY gas_tier
        """)

    def get_jit_block_count(self) -> int:
        row = self._q1(
            "SELECT COUNT(*) as c FROM events WHERE event_type='JIT_BLOCKED'")
        return int(row["c"]) if row else 0

    def get_circuit_trips(self) -> int:
        row = self._q1(
            "SELECT COUNT(*) as c FROM events WHERE event_type='CIRCUIT_BREAKER_TRIP'")
        return int(row["c"]) if row else 0

    def get_daily_history(self, n: int = 7) -> list:
        return self._q(
            "SELECT * FROM daily_stats ORDER BY date DESC LIMIT ?", (n,))

    # ── Rendering ─────────────────────────────────────────────────────────────

    def render(self):
        # Gather all data
        all_time    = self.get_all_time_stats()
        today       = self.get_today_stats()
        scans       = self.get_scan_stats()
        net_30d     = self.get_30d_net_profit()
        weekly_wins = self.get_weekly_wins()
        jit_blocks  = self.get_jit_block_count()
        cb_trips    = self.get_circuit_trips()
        route_scores= self.get_route_scores()
        recent_tx   = self.get_recent_trades(8)
        recent_vol  = self.get_recent_volatility(3)
        rpc_usage   = self.get_rpc_usage()
        gas_tiers   = self.get_gas_tier_breakdown()
        recent_evt  = self.get_recent_events(6)
        daily_hist  = self.get_daily_history(7)

        total_trades = int(all_time.get("total_trades") or 0)
        wins         = int(all_time.get("wins")         or 0)
        losses       = int(all_time.get("losses")       or 0)
        total_net    = float(all_time.get("total_net")  or 0.0)
        total_gross  = float(all_time.get("total_gross")or 0.0)
        total_gas    = float(all_time.get("total_gas")  or 0.0)
        best_trade   = float(all_time.get("best_trade") or 0.0)
        win_rate     = (wins / total_trades * 100) if total_trades > 0 else 0.0
        total_scans  = int(scans.get("total_scans") or 0)
        avg_scan_ms  = float(scans.get("avg_scan_ms") or 0.0)

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        today_uptime = float(today.get("uptime_hours") or 0.0)

        W = 72
        print()
        print(_col("═" * W, _C))
        print(_col(f"  AETHERIS AGENT ALPHA — PHASE 2 DASHBOARD", _B + _C))
        print(_col(f"  {now_str}", _DG))
        print(_col("═" * W, _C))

        # ── Section 1: Success Threshold Tracker ──────────────────────────────
        print(_col("\n  SUCCESS THRESHOLDS", _B))
        print(_col("  ─" * 33, _DG))

        ww_ok  = weekly_wins  >= THRESHOLD_TRADES_PER_WEEK
        p30_ok = net_30d      >= THRESHOLD_NET_PROFIT_30D
        wr_ok  = win_rate     >= THRESHOLD_WIN_RATE
        cb_ok  = cb_trips     == THRESHOLD_CATASTROPHIC
        up_ok  = today_uptime >= THRESHOLD_UPTIME_HOURS_DAY

        print(f"  {_ok(ww_ok)} Profitable trades this week : "
              f"{_col(str(weekly_wins), _G if ww_ok else _RD)} / {THRESHOLD_TRADES_PER_WEEK} target")
        print(f"  {_ok(p30_ok)} Net profit (30 days)        : "
              f"{_col(f'${net_30d:.4f}', _G if p30_ok else _Y)} (target: ≥ $0)")
        print(f"  {_ok(wr_ok)} Win rate                    : "
              f"{_col(f'{win_rate:.1f}%', _G if wr_ok else _RD)} / {THRESHOLD_WIN_RATE}% target")
        print(f"  {_ok(cb_ok)} Circuit breaker trips       : "
              f"{_col(str(cb_trips), _G if cb_ok else _RD)} (target: 0)")
        print(f"  {_ok(up_ok)} Today uptime                : "
              f"{_col(f'{today_uptime:.1f}h', _G if up_ok else _Y)} / {THRESHOLD_UPTIME_HOURS_DAY}h target")

        # ── Section 2: All-Time Performance ───────────────────────────────────
        print(_col("\n  ALL-TIME PERFORMANCE", _B))
        print(_col("  ─" * 33, _DG))
        print(f"  Total scans        : {total_scans:,}  (avg {avg_scan_ms:.0f}ms/scan)")
        print(f"  Total trades       : {total_trades}  ({wins}W / {losses}L)")
        print(f"  Win rate           : {_col(f'{win_rate:.1f}%', _G if win_rate >= 60 else _Y)}")
        print(f"  Gross profit       : {_col(f'${total_gross:.4f}', _G)}")
        print(f"  Gas spent          : {_col(f'${total_gas:.4f}', _Y)}")
        print(f"  Net profit         : {_col(f'${total_net:.4f}', _G if total_net >= 0 else _RD)}")
        print(f"  Best single trade  : ${best_trade:.4f}")
        print(f"  JIT blocks (saved) : {jit_blocks}  (transactions blocked by U7 simulation)")

        # ── Section 3: Today's Stats ───────────────────────────────────────────
        if today:
            print(_col("\n  TODAY'S STATS", _B))
            print(_col("  ─" * 33, _DG))
            td_net  = float(today.get("net_profit_usd")   or 0.0)
            td_gas  = float(today.get("gas_spent_usd")    or 0.0)
            td_gr   = float(today.get("gross_profit_usd") or 0.0)
            td_wr   = float(today.get("win_rate")         or 0.0)
            td_tt   = int(today.get("total_trades")       or 0)
            td_sc   = int(today.get("total_scans")        or 0)
            td_jit  = int(today.get("jit_blocks")         or 0)
            td_rpc  = int(today.get("rpc_failover_events")or 0)
            td_cum  = float(today.get("cumulative_net_profit_usd") or 0.0)
            cap     = 100.0
            apy_est = (td_cum / cap * 365 / max(1, (datetime.now(timezone.utc).timetuple().tm_yday))) * 100
            print(f"  Trades             : {td_tt} | Scans: {td_sc}")
            print(f"  Win rate           : {td_wr:.1f}%")
            print(f"  Gross / Gas / Net  : ${td_gr:.4f} / ${td_gas:.4f} / "
                  f"{_col(f'${td_net:.4f}', _G if td_net >= 0 else _RD)}")
            print(f"  Cumulative net     : {_col(f'${td_cum:.4f}', _G if td_cum >= 0 else _RD)}")
            print(f"  Est. monthly APY   : {apy_est:.1f}% on $100 capital")
            print(f"  RPC failovers      : {td_rpc}  | JIT blocks today: {td_jit}")

        # ── Section 4: Volatility Mode ─────────────────────────────────────────
        print(_col("\n  VOLATILITY INTELLIGENCE (U5)", _B))
        print(_col("  ─" * 33, _DG))
        if recent_vol:
            latest = dict(recent_vol[0])
            mode   = latest.get("volatility_mode", "?")
            val    = float(latest.get("volatility_value") or 0.0)
            mode_col = _G if mode == "AGGRESSIVE" else (_Y if mode == "NORMAL" else _C)
            print(f"  Current mode       : {_col(mode, mode_col)}")
            print(f"  Current volatility : {val*100:.4f}%")
            print(f"  Recent modes       : " +
                  " → ".join(str(dict(r).get("volatility_mode","?"))
                              for r in reversed(list(recent_vol))))

        # ── Section 5: Route Scores ────────────────────────────────────────────
        print(_col("\n  ROUTE SCORES (U6)", _B))
        print(_col("  ─" * 33, _DG))
        if route_scores:
            for rs in route_scores:
                rsd = dict(rs)
                key   = str(rsd.get("route_key", "?"))
                score = float(rsd.get("score", 0.0))
                last  = float(rsd.get("profit_last_usd", 0.0))
                bar_w = min(30, int(score * 5))
                bar   = ("█" * bar_w).ljust(30)
                sc_col = _G if score >= 2.0 else (_Y if score >= 1.0 else _DG)
                print(f"  {key:<30} {_col(f'{score:.3f}', sc_col)} |{bar}| last=${last:.4f}")
        else:
            print(f"  {_DG}No route data yet{_R}")

        # ── Section 6: Gas Tier Breakdown ──────────────────────────────────────
        print(_col("\n  GAS LADDER USAGE (U8)", _B))
        print(_col("  ─" * 33, _DG))
        if gas_tiers:
            tier_names = {1: "Tier1-Min", 2: "Tier2-Std", 3: "Tier3-Agg"}
            for gt in gas_tiers:
                gtd = dict(gt)
                t   = int(gtd.get("gas_tier") or 0)
                cnt = int(gtd.get("cnt") or 0)
                net = float(gtd.get("net") or 0.0)
                gas = float(gtd.get("avg_gas") or 0.0)
                print(f"  {tier_names.get(t, f'Tier{t}'):<12} "
                      f"trades={cnt}  net=${net:.4f}  avg_gas=${gas:.4f}")
        else:
            print(f"  {_DG}No trade data yet{_R}")

        # ── Section 7: RPC Pool Health ─────────────────────────────────────────
        print(_col("\n  RPC POOL STATUS (U4)", _B))
        print(_col("  ─" * 33, _DG))
        if rpc_usage:
            for r in rpc_usage:
                rd   = dict(r)
                ep   = str(rd.get("rpc_endpoint") or "?")
                used = int(rd.get("used") or 0)
                ms   = float(rd.get("avg_ms") or 0.0)
                ms_col = _G if ms < 500 else (_Y if ms < 1000 else _RD)
                print(f"  {ep:<45} {_col(f'{ms:.0f}ms avg', ms_col)}  used={used}")
        else:
            print(f"  {_DG}No RPC data yet{_R}")

        # ── Section 8: Recent Trades ───────────────────────────────────────────
        print(_col("\n  RECENT TRADES", _B))
        print(_col("  ─" * 33, _DG))
        if recent_tx:
            print(f"  {'Time':<20} {'Pair':<12} {'Type':<5} {'Size':>8} "
                  f"{'Net':>10} {'Gas':>8} {'T':>1} {'OK':>2}")
            for tx in recent_tx:
                txd   = dict(tx)
                ts    = str(txd.get("timestamp",""))[:19]
                pair  = str(txd.get("pair","?"))[:11]
                rt    = str(txd.get("route_type","?"))[:4]
                size  = float(txd.get("trade_size_usd") or 0)
                net   = float(txd.get("net_profit_usd") or 0)
                gas   = float(txd.get("gas_cost_usd") or 0)
                tier  = int(txd.get("gas_tier") or 0)
                ok    = int(txd.get("success") or 0)
                nc    = _G if net > 0 else _RD
                oc    = _G if ok else _RD
                print(f"  {ts:<20} {pair:<12} {rt:<5} ${size:>7.0f} "
                      f"{_col(f'${net:>8.4f}', nc)} ${gas:>6.4f} {tier} {_col(str(ok), oc)}")
        else:
            print(f"  {_DG}No trades yet{_R}")

        # ── Section 9: 7-Day History ───────────────────────────────────────────
        print(_col("\n  7-DAY HISTORY", _B))
        print(_col("  ─" * 33, _DG))
        if daily_hist:
            print(f"  {'Date':<12} {'Trades':>6} {'WR%':>5} {'Net':>10} {'Gas':>8} {'Cum':>10}")
            for dh in daily_hist:
                dhd  = dict(dh)
                date = str(dhd.get("date","?"))
                tt   = int(dhd.get("total_trades") or 0)
                wr   = float(dhd.get("win_rate") or 0)
                net  = float(dhd.get("net_profit_usd") or 0)
                gas  = float(dhd.get("gas_spent_usd") or 0)
                cum  = float(dhd.get("cumulative_net_profit_usd") or 0)
                nc   = _G if net >= 0 else _RD
                cc   = _G if cum >= 0 else _RD
                print(f"  {date:<12} {tt:>6} {wr:>4.0f}% "
                      f"{_col(f'${net:>8.4f}', nc)} ${gas:>6.4f} {_col(f'${cum:>8.4f}', cc)}")
        else:
            print(f"  {_DG}No daily history yet{_R}")

        # ── Section 10: Recent Events ──────────────────────────────────────────
        print(_col("\n  RECENT EVENTS", _B))
        print(_col("  ─" * 33, _DG))
        if recent_evt:
            for ev in recent_evt:
                evd   = dict(ev)
                ts    = str(evd.get("timestamp",""))[:19]
                etype = str(evd.get("event_type",""))
                det   = str(evd.get("detail",""))[:50]
                ecol  = _RD if "TRIP" in etype or "BLOCK" in etype else \
                        _Y  if "FAILOVER" in etype else _DG
                print(f"  {ts} {_col(etype, ecol)} {det}")
        else:
            print(f"  {_DG}No events yet{_R}")

        print(_col("\n" + "═" * W, _C))
        print(f"  DB: {os.path.abspath(self.db_path)}")
        print(_col("═" * W + "\n", _C))


def main():
    parser = argparse.ArgumentParser(description="Aetheris Dashboard — Phase 2")
    parser.add_argument("--db",       default="agent.db",
                        help="Path to SQLite database (default: agent.db)")
    parser.add_argument("--watch",    action="store_true",
                        help="Auto-refresh mode")
    parser.add_argument("--interval", type=int, default=5,
                        help="Refresh interval in seconds (default: 5, only with --watch)")
    args = parser.parse_args()

    dashboard = Dashboard(args.db)

    if args.watch:
        try:
            while True:
                os.system("cls" if os.name == "nt" else "clear")
                dashboard.render()
                print(f"  Auto-refreshing every {args.interval}s… (Ctrl+C to stop)")
                time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\nDashboard stopped.")
    else:
        dashboard.render()


if __name__ == "__main__":
    main()
