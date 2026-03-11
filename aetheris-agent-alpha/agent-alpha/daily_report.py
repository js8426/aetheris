#!/usr/bin/env python3
"""
daily_report.py — Aetheris Agent Alpha Phase 2 Daily Report Generator

Generates a comprehensive daily report from agent.db and saves it to a
timestamped text file. Run manually or schedule via cron/PM2:

  # Manual run
  python daily_report.py

  # Cron: run at midnight UTC every day
  0 0 * * *  cd /home/ubuntu/aetheris-agent-alpha/agent-alpha && python daily_report.py

  # PM2 scheduled task (requires pm2-cron-restart or use cron instead)

Usage:
    python daily_report.py                    # generates for today
    python daily_report.py --date 2025-01-15  # generates for specific date
    python daily_report.py --db agent.db      # explicit db path
    python daily_report.py --output ./reports # custom output directory
"""

import os
import sys
import sqlite3
import argparse
from datetime import datetime, timezone, timedelta
from typing import Optional

# ─── Success thresholds (same as dashboard.py — pre-defined) ─────────────────
THRESHOLD_TRADES_PER_WEEK  = 5
THRESHOLD_WIN_RATE          = 60.0
THRESHOLD_NET_PROFIT_30D    = 0.0
THRESHOLD_UPTIME_HOURS_DAY  = 20.0


class DailyReportGenerator:
    def __init__(self, db_path: str = "agent.db"):
        self.db_path = db_path
        if not os.path.exists(db_path):
            print(f"Database not found: {db_path}")
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

    def _pct(self, num: float, den: float) -> str:
        if den == 0:
            return "N/A"
        return f"{num / den * 100:.1f}%"

    def generate(self, date_str: str) -> str:
        """Generate a complete daily report for the given date (YYYY-MM-DD)."""

        # ── Fetch daily row ───────────────────────────────────────────────────
        day_row = self._q1("SELECT * FROM daily_stats WHERE date=?", (date_str,))
        day     = dict(day_row) if day_row else {}

        # ── Fetch trade-level data for this date ──────────────────────────────
        day_start = f"{date_str}T00:00:00"
        day_end   = f"{date_str}T23:59:59"

        trades = self._q("""
            SELECT * FROM trades
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp
        """, (day_start, day_end))

        scans = self._q("""
            SELECT * FROM scans
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp
        """, (day_start, day_end))

        events = self._q("""
            SELECT * FROM events
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp
        """, (day_start, day_end))

        # ── Compute derived stats ─────────────────────────────────────────────
        total_trades  = int(day.get("total_trades", 0))
        succ_trades   = int(day.get("successful_trades", 0))
        win_rate      = float(day.get("win_rate", 0.0))
        gross_profit  = float(day.get("gross_profit_usd", 0.0))
        gas_spent     = float(day.get("gas_spent_usd", 0.0))
        net_profit    = float(day.get("net_profit_usd", 0.0))
        cum_profit    = float(day.get("cumulative_net_profit_usd", 0.0))
        cb_trips      = int(day.get("circuit_breaker_trips", 0))
        uptime_hrs    = float(day.get("uptime_hours", 0.0))
        rpc_failovers = int(day.get("rpc_failover_events", 0))
        total_scans   = int(day.get("total_scans", 0))
        jit_blocks    = int(day.get("jit_blocks", 0))

        # Days since start for APY calculation
        first_trade = self._q1("SELECT MIN(timestamp) as ts FROM trades")
        if first_trade and first_trade["ts"]:
            start_date = datetime.fromisoformat(first_trade["ts"][:10])
            days_running = max(1, (datetime.strptime(date_str, "%Y-%m-%d") - start_date).days + 1)
        else:
            days_running = 1

        cap = 100.0   # $100 capital basis for APY estimate
        apy = (cum_profit / cap * 365 / days_running) * 100 if cum_profit > 0 else 0.0

        # Best and worst routes of the day
        best_route_row = self._q1("""
            SELECT pair, route_type, SUM(net_profit_usd) as net
            FROM trades WHERE timestamp >= ? AND timestamp <= ? AND success=1
            GROUP BY pair, route_type ORDER BY net DESC LIMIT 1
        """, (day_start, day_end))
        worst_route_row = self._q1("""
            SELECT pair, route_type, SUM(net_profit_usd) as net
            FROM trades WHERE timestamp >= ? AND timestamp <= ? AND success=0
            GROUP BY pair, route_type ORDER BY net ASC LIMIT 1
        """, (day_start, day_end))

        best_route  = f"{best_route_row['pair']} ({best_route_row['route_type']})" \
                      if best_route_row else "N/A"
        worst_route = f"{worst_route_row['pair']} ({worst_route_row['route_type']})" \
                      if worst_route_row else "N/A"

        # Peak activity hour
        hour_counts = {}
        for trade in trades:
            h = int(str(dict(trade).get("timestamp", "T00"))[-9:].split("T")[-1][:2]
                    if "T" in str(dict(trade).get("timestamp","")) else 0)
            try:
                h = int(str(dict(trade).get("timestamp","T00")).split("T")[1][:2])
            except Exception:
                h = 0
            hour_counts[h] = hour_counts.get(h, 0) + 1
        peak_hour = max(hour_counts, key=hour_counts.get) if hour_counts else None

        # Trade distribution by hour
        trade_dist = {h: hour_counts.get(h, 0) for h in range(24)}

        # Route score changes during the day
        score_changes = self._q("""
            SELECT route_key, MIN(score) as min_score, MAX(score) as max_score,
                   COUNT(*) as observations
            FROM route_scores
            WHERE timestamp >= ? AND timestamp <= ?
            GROUP BY route_key
            ORDER BY max_score DESC
        """, (day_start, day_end))

        # Volatility mode distribution
        vol_dist = {}
        for s in scans:
            sd = dict(s)
            m  = sd.get("volatility_mode", "UNKNOWN")
            vol_dist[m] = vol_dist.get(m, 0) + 1

        # Gas tier distribution
        gas_tier_dist = {}
        for t in trades:
            td = dict(t)
            gt = int(td.get("gas_tier") or 0)
            gas_tier_dist[gt] = gas_tier_dist.get(gt, 0) + 1

        # RPC endpoint usage
        rpc_dist = {}
        for s in scans:
            sd = dict(s)
            ep = str(sd.get("rpc_used") or "unknown")[:50]
            rpc_dist[ep] = rpc_dist.get(ep, 0) + 1

        # Avg scan duration
        scan_durations = [float(dict(s).get("scan_duration_ms") or 0) for s in scans]
        avg_scan_ms = sum(scan_durations) / len(scan_durations) if scan_durations else 0.0

        # 30-day context
        cutoff_30d = (datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=30)).isoformat()
        net_30d    = self._q1(
            "SELECT COALESCE(SUM(net_profit_usd),0) as s FROM trades "
            "WHERE timestamp >= ? AND success=1", (cutoff_30d,))
        net_30d_val = float(net_30d["s"]) if net_30d else 0.0

        weekly_wins = self._q1(
            "SELECT COUNT(*) as c FROM trades WHERE timestamp >= ? AND success=1",
            ((datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=7)).isoformat(),))
        weekly_wins_val = int(weekly_wins["c"]) if weekly_wins else 0

        # Success threshold evaluation
        thresh_ok  = (
            weekly_wins_val >= THRESHOLD_TRADES_PER_WEEK,
            net_30d_val     >= THRESHOLD_NET_PROFIT_30D,
            win_rate        >= THRESHOLD_WIN_RATE,
            cb_trips        == 0,
            uptime_hrs      >= THRESHOLD_UPTIME_HOURS_DAY,
        )
        thresh_names = [
            f"Profitable trades/week ({weekly_wins_val}/{THRESHOLD_TRADES_PER_WEEK})",
            f"Net positive 30-day (${net_30d_val:.4f})",
            f"Win rate ≥{THRESHOLD_WIN_RATE}% ({win_rate:.1f}%)",
            f"Zero catastrophic failures (trips: {cb_trips})",
            f"Uptime ≥{THRESHOLD_UPTIME_HOURS_DAY}h/day ({uptime_hrs:.1f}h)",
        ]

        # ── Build the report string ───────────────────────────────────────────
        W  = 72
        HR = "=" * W

        lines = []
        def L(s=""):
            lines.append(s)

        L(HR)
        L(f"  AETHERIS AGENT ALPHA — PHASE 2 DAILY REPORT")
        L(f"  Date: {date_str}")
        L(f"  Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
        L(HR)

        # ── Success Thresholds ────────────────────────────────────────────────
        L()
        L("  SUCCESS THRESHOLD REPORT")
        L("-" * W)
        for ok, name in zip(thresh_ok, thresh_names):
            L(f"  [{'PASS' if ok else 'FAIL'}] {name}")
        overall_pass = all(thresh_ok[:3])   # primary thresholds
        L()
        L(f"  Overall status: {'PASSING primary thresholds' if overall_pass else 'BELOW target'}")

        # ── Daily Trade Stats ─────────────────────────────────────────────────
        L()
        L("  TRADE STATISTICS")
        L("-" * W)
        L(f"  Total trades attempted      : {total_trades}")
        L(f"  Total trades successful     : {succ_trades}")
        L(f"  Total trades failed         : {total_trades - succ_trades}")
        L(f"  Win rate                    : {win_rate:.1f}%")
        L(f"  Total gross profit          : ${gross_profit:.6f}")
        L(f"  Total gas spent             : ${gas_spent:.6f}")
        L(f"  Total net profit            : ${net_profit:.6f}")
        L(f"  Cumulative net (all days)   : ${cum_profit:.6f}")
        L(f"  Est. monthly APY on $100    : {apy:.2f}%")
        L(f"  Best performing route today : {best_route}")
        L(f"  Worst performing route today: {worst_route}")

        # ── System Health ─────────────────────────────────────────────────────
        L()
        L("  SYSTEM HEALTH")
        L("-" * W)
        L(f"  Total scans                 : {total_scans}")
        L(f"  Avg scan duration           : {avg_scan_ms:.1f}ms")
        L(f"  Circuit breaker trips       : {cb_trips}")
        L(f"  Agent uptime                : {uptime_hrs:.1f} hours")
        L(f"  RPC failover events         : {rpc_failovers}")
        L(f"  JIT simulation blocks       : {jit_blocks} (trades prevented by U7)")

        # ── Volatility Modes ──────────────────────────────────────────────────
        L()
        L("  VOLATILITY MODE DISTRIBUTION (U5)")
        L("-" * W)
        total_s = sum(vol_dist.values()) or 1
        for mode, cnt in sorted(vol_dist.items(), key=lambda x: -x[1]):
            L(f"  {mode:<16} : {cnt:>5} scans ({cnt/total_s*100:.1f}%)")

        # ── Peak Activity ─────────────────────────────────────────────────────
        L()
        L("  HOURLY TRADE DISTRIBUTION (UTC)")
        L("-" * W)
        L(f"  Peak activity hour          : {f'{peak_hour:02d}:00' if peak_hour is not None else 'N/A'}")
        L()

        # Compact histogram
        max_cnt = max(trade_dist.values()) if trade_dist.values() else 1
        for h in range(24):
            cnt    = trade_dist[h]
            bar_w  = int(cnt / max_cnt * 30) if max_cnt > 0 else 0
            bar    = "█" * bar_w
            marker = " ← peak" if h == peak_hour else ""
            L(f"  {h:02d}:00  {bar:<30} {cnt}{marker}")

        # ── Route Score Changes ────────────────────────────────────────────────
        L()
        L("  ROUTE SCORE CHANGES (U6)")
        L("-" * W)
        if score_changes:
            for sc in score_changes:
                scd  = dict(sc)
                key  = str(scd.get("route_key","?"))
                lo   = float(scd.get("min_score") or 0)
                hi   = float(scd.get("max_score") or 0)
                obs  = int(scd.get("observations") or 0)
                delta = hi - lo
                dir_s = f"+{delta:.3f}" if delta >= 0 else f"{delta:.3f}"
                L(f"  {key:<35} {lo:.3f} → {hi:.3f}  ({dir_s})  obs={obs}")
        else:
            L("  No route score data for this date.")

        # ── Gas Tier Usage ─────────────────────────────────────────────────────
        L()
        L("  GAS LADDER USAGE (U8)")
        L("-" * W)
        tier_names = {1: "Tier 1 (Minimum)", 2: "Tier 2 (Standard)", 3: "Tier 3 (Aggressive)"}
        for tier, cnt in sorted(gas_tier_dist.items()):
            L(f"  {tier_names.get(tier, f'Tier {tier}'):<24} : {cnt} trades")

        # ── RPC Endpoint Usage ────────────────────────────────────────────────
        L()
        L("  RPC ENDPOINT USAGE (U4)")
        L("-" * W)
        total_sc = sum(rpc_dist.values()) or 1
        for ep, cnt in sorted(rpc_dist.items(), key=lambda x: -x[1]):
            L(f"  {ep:<50} : {cnt:>5} scans ({cnt/total_sc*100:.1f}%)")

        # ── Trade Detail ──────────────────────────────────────────────────────
        L()
        L("  TRADE DETAIL")
        L("-" * W)
        if trades:
            L(f"  {'Time':<20} {'Pair':<14} {'Type':<5} {'Size':>8} {'Net':>10} "
              f"{'Gas':>8} {'T':>1} {'OK':>2} {'Reason'}")
            for t in trades:
                td  = dict(t)
                ts  = str(td.get("timestamp",""))[:19]
                p   = str(td.get("pair","?"))[:13]
                rt  = str(td.get("route_type","?"))[:4]
                sz  = float(td.get("trade_size_usd") or 0)
                net = float(td.get("net_profit_usd") or 0)
                gas = float(td.get("gas_cost_usd")   or 0)
                tier= int(td.get("gas_tier") or 0)
                ok  = int(td.get("success") or 0)
                fr  = str(td.get("failure_reason") or "")[:30]
                L(f"  {ts:<20} {p:<14} {rt:<5} ${sz:>7.0f} ${net:>8.4f} "
                  f"${gas:>6.4f} {tier} {'Y' if ok else 'N'}  {fr}")
        else:
            L("  No trades on this date.")

        # ── Events Log ────────────────────────────────────────────────────────
        L()
        L("  EVENTS LOG")
        L("-" * W)
        if events:
            for ev in events:
                evd   = dict(ev)
                ts    = str(evd.get("timestamp",""))[:19]
                etype = str(evd.get("event_type",""))
                det   = str(evd.get("detail",""))
                L(f"  {ts}  {etype:<30}  {det}")
        else:
            L("  No events on this date.")

        # ── 30-Day Context ────────────────────────────────────────────────────
        L()
        L("  30-DAY CONTEXT")
        L("-" * W)
        L(f"  Net profit last 30 days     : ${net_30d_val:.6f}")
        L(f"  Profitable trades last week : {weekly_wins_val}")

        # ── Footer ────────────────────────────────────────────────────────────
        L()
        L(HR)
        L(f"  Report generated by daily_report.py  |  DB: {os.path.abspath(self.db_path)}")
        L(HR)

        return "\n".join(lines)

    def save_report(self, date_str: str, output_dir: str = ".") -> str:
        """Generate and save report. Returns the file path."""
        report_text = self.generate(date_str)

        os.makedirs(output_dir, exist_ok=True)
        filename = f"aetheris_report_{date_str}.txt"
        filepath = os.path.join(output_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(report_text)

        print(f"[OK] Report saved: {filepath}")
        return filepath


def main():
    parser = argparse.ArgumentParser(
        description="Aetheris Daily Report Generator — Phase 2")
    parser.add_argument("--date",   type=str, default=None,
                        help="Date to report on (YYYY-MM-DD). Default: yesterday.")
    parser.add_argument("--db",     type=str, default="agent.db",
                        help="Path to SQLite database (default: agent.db)")
    parser.add_argument("--output", type=str, default="reports",
                        help="Output directory for report files (default: reports/)")
    parser.add_argument("--print",  action="store_true",
                        help="Print report to stdout as well as saving to file")
    args = parser.parse_args()

    # Default to yesterday (reports are usually for the previous complete day)
    if args.date is None:
        yesterday  = datetime.now(timezone.utc) - timedelta(days=1)
        args.date  = yesterday.strftime("%Y-%m-%d")

    gen      = DailyReportGenerator(args.db)
    filepath = gen.save_report(args.date, args.output)

    if args.print:
        with open(filepath, "r", encoding="utf-8") as f:
            print(f.read())


if __name__ == "__main__":
    main()
