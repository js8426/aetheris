/// Aetheris\aetheris-agent-alpha-rust\src\db\mod.rs
///
/// Complete SQLite persistence for the 30-day silent launch observation period.
///
/// Tracks at trade level:
///   timestamp, tx_hash, pair, trade_size_usd, gross_profit, gas_cost,
///   net_profit, execution_time, success, failure_reason, rpc_endpoint,
///   route_score, gas_tier, block_number, network, mode
///
/// Tracks at daily level:
///   total_trades, successful_trades, win_rate, gross_profit, gas_spent,
///   net_profit, cumulative_net_profit, monthly_apy_on_100, circuit_breaker_trips,
///   uptime_hours, rpc_failover_events, route_score_changes,
///   best_route, worst_route, peak_hour, total_scans, jit_blocks
///
/// Also tracks: events, route_scores, hourly_activity

use anyhow::Result;
use chrono::Utc;
use rusqlite::{Connection, params};
use std::collections::HashMap;
use tokio::sync::Mutex;
use tracing::info;

use crate::arb::detector::ArbOpportunity;

pub struct Database {
    conn: Mutex<Connection>,
    pub path: String,
}

impl Database {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        // WAL mode for better concurrent write performance
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute_batch(SCHEMA)?;
        info!(
            "[DB] SQLite database: {}",
            std::path::Path::new(path)
                .canonicalize()
                .unwrap_or_default()
                .display()
        );
        Ok(Self {
            conn: Mutex::new(conn),
            path: path.into(),
        })
    }

    // ── Trade logging ─────────────────────────────────────────────────────────

    pub async fn log_trade(
        &self,
        opp:              &ArbOpportunity,
        success:          bool,
        tx_hash:          Option<&str>,
        execution_time_s: f64,
        failure_reason:   Option<&str>,
        rpc_endpoint:     &str,
        gas_tier:         u32,
        gas_cost_usd:     f64,
        block_number:     u64,
        network:          &str,
        mode:             &str,
    ) -> Result<()> {
        let scale     = 10f64.powi(opp.start_token.decimals() as i32);
        let size_usd  = opp.amount_in   / scale;
        let gross_usd = opp.gross_profit / scale;
        let net_usd   = opp.net_profit   / scale;
        let pair      = format!(
            "{}/{}",
            opp.start_token.name(),
            opp.legs_summary
                .last()
                .map(|l| l.token_out.name())
                .unwrap_or("?")
        );

        let conn = self.conn.lock().await;
        conn.execute(
            "INSERT INTO trades
               (timestamp, tx_hash, pair, route_type, trade_size_usd,
                gross_profit_usd, gas_cost_usd, net_profit_usd,
                execution_time_s, success, failure_reason, rpc_endpoint,
                route_score, gas_tier, block_number, network, mode)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
            params![
                Utc::now().to_rfc3339(),
                tx_hash,
                pair,
                &opp.route_key,
                r4(size_usd),
                r6(gross_usd),
                r6(gas_cost_usd),
                r6(net_usd),
                r3(execution_time_s),
                success as i32,
                failure_reason,
                &rpc_endpoint[..rpc_endpoint.len().min(80)],
                r4(opp.route_score),
                gas_tier,
                block_number as i64,
                network,
                mode,
            ],
        )?;

        // Update daily stats immediately after every trade
        drop(conn);
        self.update_daily_trade(
            success,
            gross_usd,
            gas_cost_usd,
            net_usd,
            &opp.route_key,
        ).await?;

        Ok(())
    }

    // ── Daily trade counter update ────────────────────────────────────────────

    async fn update_daily_trade(
        &self,
        success:       bool,
        gross_usd:     f64,
        gas_usd:       f64,
        net_usd:       f64,
        route_key:     &str,
    ) -> Result<()> {
        let today = today_str();
        let conn  = self.conn.lock().await;

        self.ensure_daily_row_locked(&conn, &today)?;

        // Get current best/worst route
        let existing: (i64, i64, f64, f64, f64, Option<String>, Option<String>) = conn.query_row(
            "SELECT total_trades, successful_trades, gross_profit_usd, gas_spent_usd,
                    net_profit_usd, best_route, worst_route
             FROM daily_stats WHERE date=?1",
            params![today],
            |row| Ok((
                row.get(0)?, row.get(1)?, row.get(2)?,
                row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?,
            )),
        )?;

        let new_total    = existing.0 + 1;
        let new_success  = existing.1 + if success { 1 } else { 0 };
        let new_win_rate = (new_success as f64 / new_total as f64) * 100.0;
        let new_gross    = existing.2 + gross_usd;
        let new_gas      = existing.3 + gas_usd;
        let new_net      = existing.4 + net_usd;

        // Cumulative net across all days
        let cumulative_base: f64 = conn.query_row(
            "SELECT COALESCE(SUM(net_profit_usd),0) FROM daily_stats WHERE date < ?1",
            params![today],
            |row| row.get(0),
        ).unwrap_or(0.0);
        let cumulative = cumulative_base + new_net;

        // APY: (net_profit / 100) * (365 / days_running) * 100
        let days_running: f64 = conn.query_row(
            "SELECT COUNT(DISTINCT date) FROM daily_stats",
            [],
            |row| row.get(0),
        ).unwrap_or(1.0_f64).max(1.0);
        let apy = if cumulative > 0.0 {
            (cumulative / 100.0) * (365.0 / days_running) * 100.0
        } else {
            0.0
        };

        // Best/worst route (simple: track the route_key with highest/lowest net today)
        // We'll update these via a separate call after we know daily totals
        let best  = existing.5.unwrap_or_else(|| route_key.to_string());
        let worst = existing.6.unwrap_or_else(|| route_key.to_string());

        conn.execute(
            "UPDATE daily_stats SET
               total_trades=?1, successful_trades=?2, win_rate=?3,
               gross_profit_usd=?4, gas_spent_usd=?5, net_profit_usd=?6,
               cumulative_net_profit_usd=?7, monthly_apy_on_100=?8,
               best_route=?9, worst_route=?10
             WHERE date=?11",
            params![
                new_total, new_success, r2(new_win_rate),
                r6(new_gross), r6(new_gas), r6(new_net),
                r6(cumulative), r4(apy),
                best, worst,
                today,
            ],
        )?;
        Ok(())
    }

    // ── Scan logging ──────────────────────────────────────────────────────────

    pub async fn log_scan(
        &self,
        block_number:        u64,
        opportunities_found: usize,
        scan_duration_ms:    f64,
        volatility_mode:     &str,
        volatility_value:    f64,
        rpc_used:            &str,
    ) -> Result<()> {
        let now  = Utc::now();
        let hour = now.format("%H").to_string().parse::<i64>().unwrap_or(0);

        let conn = self.conn.lock().await;
        conn.execute(
            "INSERT INTO scans
               (timestamp, block_number, opportunities_found,
                scan_duration_ms, volatility_mode, volatility_value, rpc_used)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![
                now.to_rfc3339(),
                block_number as i64,
                opportunities_found as i64,
                r2(scan_duration_ms),
                volatility_mode,
                r6(volatility_value),
                &rpc_used[..rpc_used.len().min(80)],
            ],
        )?;

        // Update hourly activity
        let today = today_str();
        conn.execute(
            "INSERT INTO hourly_activity (date, hour, scan_count, opportunity_count)
             VALUES (?1, ?2, 1, ?3)
             ON CONFLICT(date, hour) DO UPDATE SET
               scan_count        = scan_count        + 1,
               opportunity_count = opportunity_count + excluded.opportunity_count",
            params![today, hour, opportunities_found as i64],
        )?;

        // Increment total_scans in daily_stats
        self.ensure_daily_row_locked(&conn, &today)?;
        conn.execute(
            "UPDATE daily_stats SET total_scans = total_scans + 1 WHERE date=?1",
            params![today],
        )?;

        Ok(())
    }

    // ── Route score persistence ───────────────────────────────────────────────

    pub async fn save_route_score(
        &self,
        route_key: &str,
        score:     f64,
        profit_usd: f64,
    ) -> Result<()> {
        let conn = self.conn.lock().await;
        conn.execute(
            "INSERT INTO route_scores (timestamp, route_key, score, profit_last_usd)
             VALUES (?1, ?2, ?3, ?4)",
            params![Utc::now().to_rfc3339(), route_key, r4(score), r6(profit_usd)],
        )?;
        Ok(())
    }

    pub async fn load_route_scores(&self) -> Result<Vec<(String, f64)>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            "SELECT route_key, score FROM route_scores
             WHERE (route_key, timestamp) IN (
                 SELECT route_key, MAX(timestamp)
                 FROM route_scores GROUP BY route_key
             )",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ── Record route score changes ────────────────────────────────────────────

    pub async fn record_score_changes(
        &self,
        old_scores: &HashMap<String, f64>,
        new_scores: &HashMap<String, f64>,
    ) -> Result<()> {
        let today = today_str();
        let mut change_count = 0i64;

        for (key, &new_score) in new_scores {
            if let Some(&old_score) = old_scores.get(key) {
                if (new_score - old_score).abs() > 0.001 {
                    change_count += 1;
                }
            }
        }

        if change_count > 0 {
            let conn = self.conn.lock().await;
            self.ensure_daily_row_locked(&conn, &today)?;
            conn.execute(
                "UPDATE daily_stats SET
                   route_score_changes = route_score_changes + ?1
                 WHERE date=?2",
                params![change_count, today],
            )?;
        }
        Ok(())
    }

    // ── Event logging ─────────────────────────────────────────────────────────

    pub async fn log_event(&self, event_type: &str, detail: &str) -> Result<()> {
        let conn = self.conn.lock().await;
        conn.execute(
            "INSERT INTO events (timestamp, event_type, detail) VALUES (?1, ?2, ?3)",
            params![Utc::now().to_rfc3339(), event_type, detail],
        )?;
        Ok(())
    }

    // ── Circuit breaker trip ──────────────────────────────────────────────────

    pub async fn record_circuit_trip(&self) -> Result<()> {
        let today = today_str();
        let conn  = self.conn.lock().await;
        self.ensure_daily_row_locked(&conn, &today)?;
        conn.execute(
            "UPDATE daily_stats SET circuit_breaker_trips = circuit_breaker_trips + 1
             WHERE date=?1",
            params![today],
        )?;
        conn.execute(
            "INSERT INTO events (timestamp, event_type, detail) VALUES (?1,'CIRCUIT_BREAKER_TRIP','')",
            params![Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    // ── RPC failover event ────────────────────────────────────────────────────

    pub async fn record_rpc_failover(&self, from_url: &str, to_url: &str) -> Result<()> {
        let today = today_str();
        let conn  = self.conn.lock().await;
        self.ensure_daily_row_locked(&conn, &today)?;
        conn.execute(
            "UPDATE daily_stats SET rpc_failover_events = rpc_failover_events + 1
             WHERE date=?1",
            params![today],
        )?;
        conn.execute(
            "INSERT INTO events (timestamp, event_type, detail) VALUES (?1,'RPC_FAILOVER',?2)",
            params![
                Utc::now().to_rfc3339(),
                format!("{} → {}", &from_url[..from_url.len().min(40)], &to_url[..to_url.len().min(40)])
            ],
        )?;
        Ok(())
    }

    // ── Uptime checkpoint (call every hour) ───────────────────────────────────

    pub async fn record_uptime(&self, uptime_hours: f64) -> Result<()> {
        let today = today_str();
        let conn  = self.conn.lock().await;
        self.ensure_daily_row_locked(&conn, &today)?;
        conn.execute(
            "UPDATE daily_stats SET uptime_hours=?1 WHERE date=?2",
            params![r2(uptime_hours), today],
        )?;
        Ok(())
    }

    // ── Update best/worst route at end of day ─────────────────────────────────

    pub async fn refresh_best_worst_routes(&self) -> Result<()> {
        let today = today_str();
        let conn  = self.conn.lock().await;

        // Best route = highest total net profit today
        let best: Option<String> = conn.query_row(
            "SELECT route_type FROM trades
             WHERE DATE(timestamp)=?1 AND success=1
             GROUP BY route_type
             ORDER BY SUM(net_profit_usd) DESC LIMIT 1",
            params![today],
            |row| row.get(0),
        ).ok();

        // Worst route = most failures or lowest net profit today
        let worst: Option<String> = conn.query_row(
            "SELECT route_type FROM trades
             WHERE DATE(timestamp)=?1
             GROUP BY route_type
             ORDER BY SUM(net_profit_usd) ASC LIMIT 1",
            params![today],
            |row| row.get(0),
        ).ok();

        // Peak hour = hour with most scans
        let peak_hour: Option<i64> = conn.query_row(
            "SELECT hour FROM hourly_activity
             WHERE date=?1
             ORDER BY scan_count DESC LIMIT 1",
            params![today],
            |row| row.get(0),
        ).ok();

        if best.is_some() || worst.is_some() || peak_hour.is_some() {
            conn.execute(
                "UPDATE daily_stats SET
                   best_route=COALESCE(?1, best_route),
                   worst_route=COALESCE(?2, worst_route),
                   peak_hour=COALESCE(?3, peak_hour)
                 WHERE date=?4",
                params![best, worst, peak_hour, today],
            )?;
        }
        Ok(())
    }

    // ── Get daily summary for reporting ───────────────────────────────────────

    pub async fn get_daily_summary(&self, date: &str) -> Result<Option<DailySummary>> {
        let conn = self.conn.lock().await;

        let row = conn.query_row(
            "SELECT date, total_trades, successful_trades, win_rate,
                    gross_profit_usd, gas_spent_usd, net_profit_usd,
                    cumulative_net_profit_usd, monthly_apy_on_100,
                    circuit_breaker_trips, uptime_hours, rpc_failover_events,
                    route_score_changes, best_route, worst_route,
                    peak_hour, total_scans
             FROM daily_stats WHERE date=?1",
            params![date],
            |row| Ok(DailySummary {
                date:                    row.get(0)?,
                total_trades:            row.get(1)?,
                successful_trades:       row.get(2)?,
                win_rate:                row.get(3)?,
                gross_profit_usd:        row.get(4)?,
                gas_spent_usd:           row.get(5)?,
                net_profit_usd:          row.get(6)?,
                cumulative_net_profit:   row.get(7)?,
                monthly_apy_on_100:      row.get(8)?,
                circuit_breaker_trips:   row.get(9)?,
                uptime_hours:            row.get(10)?,
                rpc_failover_events:     row.get(11)?,
                route_score_changes:     row.get(12)?,
                best_route:              row.get(13)?,
                worst_route:             row.get(14)?,
                peak_hour:               row.get(15)?,
                total_scans:             row.get(16)?,
            }),
        ).ok();

        Ok(row)
    }

    // ── 30-day overview ───────────────────────────────────────────────────────

    pub async fn get_30_day_overview(&self) -> Result<Vec<DailySummary>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            "SELECT date, total_trades, successful_trades, win_rate,
                    gross_profit_usd, gas_spent_usd, net_profit_usd,
                    cumulative_net_profit_usd, monthly_apy_on_100,
                    circuit_breaker_trips, uptime_hours, rpc_failover_events,
                    route_score_changes, best_route, worst_route,
                    peak_hour, total_scans
             FROM daily_stats
             ORDER BY date DESC LIMIT 30",
        )?;
        let rows = stmt.query_map([], |row| Ok(DailySummary {
            date:                    row.get(0)?,
            total_trades:            row.get(1)?,
            successful_trades:       row.get(2)?,
            win_rate:                row.get(3)?,
            gross_profit_usd:        row.get(4)?,
            gas_spent_usd:           row.get(5)?,
            net_profit_usd:          row.get(6)?,
            cumulative_net_profit:   row.get(7)?,
            monthly_apy_on_100:      row.get(8)?,
            circuit_breaker_trips:   row.get(9)?,
            uptime_hours:            row.get(10)?,
            rpc_failover_events:     row.get(11)?,
            route_score_changes:     row.get(12)?,
            best_route:              row.get(13)?,
            worst_route:             row.get(14)?,
            peak_hour:               row.get(15)?,
            total_scans:             row.get(16)?,
        }))?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ── Internal helper: ensure today's daily_stats row exists ───────────────

    fn ensure_daily_row_locked(&self, conn: &Connection, date: &str) -> Result<()> {
        conn.execute(
            "INSERT OR IGNORE INTO daily_stats (date) VALUES (?1)",
            params![date],
        )?;
        Ok(())
    }
}

// ─── Daily summary struct ─────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct DailySummary {
    pub date:                  String,
    pub total_trades:          i64,
    pub successful_trades:     i64,
    pub win_rate:              f64,
    pub gross_profit_usd:      f64,
    pub gas_spent_usd:         f64,
    pub net_profit_usd:        f64,
    pub cumulative_net_profit: f64,
    pub monthly_apy_on_100:    f64,
    pub circuit_breaker_trips: i64,
    pub uptime_hours:          f64,
    pub rpc_failover_events:   i64,
    pub route_score_changes:   i64,
    pub best_route:            Option<String>,
    pub worst_route:           Option<String>,
    pub peak_hour:             Option<i64>,
    pub total_scans:           i64,
}

impl DailySummary {
    /// Print a formatted daily report to the log
    pub fn print_report(&self) {
        let sep = "─".repeat(60);
        tracing::info!("{sep}");
        tracing::info!("  DAILY REPORT — {}", self.date);
        tracing::info!("{sep}");
        tracing::info!("  Scans          : {}", self.total_scans);
        tracing::info!("  Trades         : {} attempted, {} successful",
            self.total_trades, self.successful_trades);
        tracing::info!("  Win rate       : {:.1}%", self.win_rate);
        tracing::info!("  Gross profit   : ${:.4}", self.gross_profit_usd);
        tracing::info!("  Gas spent      : ${:.4}", self.gas_spent_usd);
        tracing::info!("  Net profit     : ${:.4}", self.net_profit_usd);
        tracing::info!("  Cumulative     : ${:.4}", self.cumulative_net_profit);
        tracing::info!("  Monthly APY    : {:.2}% on $100 capital", self.monthly_apy_on_100);
        tracing::info!("  Uptime         : {:.1}h", self.uptime_hours);
        tracing::info!("  Circuit trips  : {}", self.circuit_breaker_trips);
        tracing::info!("  RPC failovers  : {}", self.rpc_failover_events);
        tracing::info!("  Score changes  : {}", self.route_score_changes);
        tracing::info!("  Best route     : {}", self.best_route.as_deref().unwrap_or("none"));
        tracing::info!("  Worst route    : {}", self.worst_route.as_deref().unwrap_or("none"));
        tracing::info!("  Peak hour      : {}:00 UTC",
            self.peak_hour.map(|h| h.to_string()).as_deref().unwrap_or("unknown"));
        tracing::info!("{sep}");
    }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS trades (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp           TEXT    NOT NULL,
    tx_hash             TEXT,
    pair                TEXT,
    route_type          TEXT,
    trade_size_usd      REAL    DEFAULT 0,
    gross_profit_usd    REAL    DEFAULT 0,
    gas_cost_usd        REAL    DEFAULT 0,
    net_profit_usd      REAL    DEFAULT 0,
    execution_time_s    REAL    DEFAULT 0,
    success             INTEGER DEFAULT 0,
    failure_reason      TEXT,
    rpc_endpoint        TEXT,
    route_score         REAL    DEFAULT 0,
    gas_tier            INTEGER DEFAULT 0,
    block_number        INTEGER DEFAULT 0,
    network             TEXT,
    mode                TEXT
);

CREATE TABLE IF NOT EXISTS scans (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp           TEXT    NOT NULL,
    block_number        INTEGER DEFAULT 0,
    opportunities_found INTEGER DEFAULT 0,
    scan_duration_ms    REAL    DEFAULT 0,
    volatility_mode     TEXT,
    volatility_value    REAL    DEFAULT 0,
    rpc_used            TEXT
);

CREATE TABLE IF NOT EXISTS route_scores (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT    NOT NULL,
    route_key       TEXT    NOT NULL,
    score           REAL    DEFAULT 0,
    profit_last_usd REAL    DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_stats (
    date                        TEXT    PRIMARY KEY,
    total_trades                INTEGER DEFAULT 0,
    successful_trades           INTEGER DEFAULT 0,
    win_rate                    REAL    DEFAULT 0,
    gross_profit_usd            REAL    DEFAULT 0,
    gas_spent_usd               REAL    DEFAULT 0,
    net_profit_usd              REAL    DEFAULT 0,
    cumulative_net_profit_usd   REAL    DEFAULT 0,
    monthly_apy_on_100          REAL    DEFAULT 0,
    circuit_breaker_trips       INTEGER DEFAULT 0,
    uptime_hours                REAL    DEFAULT 0,
    rpc_failover_events         INTEGER DEFAULT 0,
    route_score_changes         INTEGER DEFAULT 0,
    best_route                  TEXT,
    worst_route                 TEXT,
    peak_hour                   INTEGER,
    total_scans                 INTEGER DEFAULT 0,
    jit_blocks                  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hourly_activity (
    date                TEXT    NOT NULL,
    hour                INTEGER NOT NULL,
    scan_count          INTEGER DEFAULT 0,
    opportunity_count   INTEGER DEFAULT 0,
    trade_count         INTEGER DEFAULT 0,
    PRIMARY KEY (date, hour)
);

CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT    NOT NULL,
    event_type  TEXT    NOT NULL,
    detail      TEXT    DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_trades_timestamp  ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_date       ON trades(DATE(timestamp));
CREATE INDEX IF NOT EXISTS idx_scans_timestamp   ON scans(timestamp);
CREATE INDEX IF NOT EXISTS idx_route_key         ON route_scores(route_key);
CREATE INDEX IF NOT EXISTS idx_events_type       ON events(event_type);
";

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn today_str() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

#[inline] fn r2(v: f64) -> f64 { (v * 100.0).round()       / 100.0 }
#[inline] fn r3(v: f64) -> f64 { (v * 1_000.0).round()     / 1_000.0 }
#[inline] fn r4(v: f64) -> f64 { (v * 10_000.0).round()    / 10_000.0 }
#[inline] fn r6(v: f64) -> f64 { (v * 1_000_000.0).round() / 1_000_000.0 }
