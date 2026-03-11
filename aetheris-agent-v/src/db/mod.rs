// Aetherisetheris-agent-v\src\db\mod.rs

/// db/mod.rs — SQLite persistence for Agent V
///
/// Manages three tables:
///   incidents      — Every detected threat (full context)
///   slot_snapshots — Latest known value for each watched slot (for restart recovery)
///   daily_summary  — Per-day aggregates for reporting
///
/// All writes are synchronous (rusqlite is sync-only). The caller wraps
/// this in Arc<Mutex<Database>> for async contexts.

use anyhow::{anyhow, Result};
use chrono::Utc;
use rusqlite::{params, Connection};
use tracing::info;

use crate::detector::ThreatReport;

pub struct Database {
    conn: Connection,
}

impl Database {
    /// Open (or create) the SQLite database at the given path.
    /// Creates all tables if they do not exist.
    pub fn open(db_path: &str) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = std::path::Path::new(db_path).parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| anyhow!("Failed to create DB directory '{}': {}", parent.display(), e))?;
        }

        let conn = Connection::open(db_path)
            .map_err(|e| anyhow!("Failed to open DB at '{}': {}", db_path, e))?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| anyhow!("Failed to set PRAGMA: {}", e))?;

        let db = Self { conn };
        db.create_tables()?;

        info!("Database opened at '{}'", db_path);
        Ok(db)
    }

    /// Create all tables if they don't exist.
    fn create_tables(&self) -> Result<()> {
        self.conn.execute_batch("
            CREATE TABLE IF NOT EXISTS incidents (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                block_number      INTEGER NOT NULL,
                timestamp         INTEGER NOT NULL,
                contract_address  TEXT NOT NULL,
                threat_level      TEXT NOT NULL,
                threat_type       TEXT NOT NULL,
                slot_key          TEXT,
                old_value         TEXT,
                new_value         TEXT,
                response_executed TEXT,
                tx_hash           TEXT,
                notes             TEXT
            );

            CREATE TABLE IF NOT EXISTS slot_snapshots (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                block_number     INTEGER NOT NULL,
                contract_address TEXT NOT NULL,
                slot_key         TEXT NOT NULL,
                slot_value       TEXT NOT NULL,
                recorded_at      INTEGER NOT NULL,
                UNIQUE(contract_address, slot_key) ON CONFLICT REPLACE
            );

            CREATE TABLE IF NOT EXISTS daily_summary (
                date                TEXT PRIMARY KEY,
                blocks_monitored    INTEGER DEFAULT 0,
                contracts_watched   INTEGER DEFAULT 0,
                threats_detected    INTEGER DEFAULT 0,
                critical_count      INTEGER DEFAULT 0,
                high_count          INTEGER DEFAULT 0,
                responses_executed  INTEGER DEFAULT 0,
                rpc_failures        INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_incidents_block ON incidents(block_number);
            CREATE INDEX IF NOT EXISTS idx_incidents_contract ON incidents(contract_address);
            CREATE INDEX IF NOT EXISTS idx_snapshots_contract_slot ON slot_snapshots(contract_address, slot_key);
        ").map_err(|e| anyhow!("Failed to create tables: {}", e))?;

        Ok(())
    }

    /// Insert a new incident record from a ThreatReport.
    pub fn insert_incident(&mut self, threat: &ThreatReport) -> Result<()> {
        self.conn.execute(
            "INSERT INTO incidents
             (block_number, timestamp, contract_address, threat_level, threat_type,
              slot_key, old_value, new_value, response_executed, tx_hash, notes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL, NULL)",
            params![
                threat.block_number as i64,
                threat.timestamp,
                threat.contract_address,
                threat.threat_level.label(),
                threat.threat_type.as_str(),
                threat.slot_key,
                threat.old_value,
                threat.new_value,
            ],
        )
        .map_err(|e| anyhow!("Failed to insert incident: {}", e))?;

        Ok(())
    }

    /// Update an incident with the response that was executed.
    pub fn update_incident_response(
        &mut self,
        block_number: u64,
        contract_address: &str,
        response_desc: &str,
        tx_hash: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE incidents SET response_executed = ?1, tx_hash = ?2
             WHERE id = (
                 SELECT id FROM incidents
                 WHERE block_number = ?3 AND contract_address = ?4
                 ORDER BY id DESC LIMIT 1
             )",
            params![
                response_desc,
                tx_hash,
                block_number as i64,
                contract_address,
            ],
        )
        .map_err(|e| anyhow!("Failed to update incident response: {}", e))?;

        Ok(())
    }

    /// Upsert a slot snapshot (latest value per contract+slot).
    pub fn upsert_snapshot(
        &self,
        block_number: u64,
        contract_address: &str,
        slot_key: &str,
        slot_value: &str,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO slot_snapshots
             (block_number, contract_address, slot_key, slot_value, recorded_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                block_number as i64,
                contract_address,
                slot_key,
                slot_value,
                Utc::now().timestamp(),
            ],
        )
        .map_err(|e| anyhow!("Failed to upsert snapshot: {}", e))?;

        Ok(())
    }

    /// Load the latest snapshot for all (contract, slot) pairs.
    /// Returns Vec<(contract_address, slot_key, slot_value)>.
    pub fn load_latest_snapshots(&self) -> Result<Vec<(String, String, String)>> {
        let mut stmt = self.conn.prepare(
            "SELECT contract_address, slot_key, slot_value FROM slot_snapshots"
        ).map_err(|e| anyhow!("Failed to prepare snapshot query: {}", e))?;

        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| anyhow!("Failed to query snapshots: {}", e))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| anyhow!("Row error: {}", e))?);
        }

        Ok(results)
    }

    /// Update the daily summary for the current UTC date.
    pub fn update_daily_summary(
        &mut self,
        _block_number: u64,
        contracts_watched: u32,
        threats_detected: u32,
        critical_count: u32,
        high_count: u32,
    ) -> Result<()> {
        let today = Utc::now().format("%Y-%m-%d").to_string();

        self.conn.execute(
            "INSERT INTO daily_summary (date, blocks_monitored, contracts_watched,
             threats_detected, critical_count, high_count, responses_executed, rpc_failures)
             VALUES (?1, 1, ?2, ?3, ?4, ?5, 0, 0)
             ON CONFLICT(date) DO UPDATE SET
               blocks_monitored  = blocks_monitored + 1,
               contracts_watched = ?2,
               threats_detected  = threats_detected + ?3,
               critical_count    = critical_count + ?4,
               high_count        = high_count + ?5",
            params![
                today,
                contracts_watched,
                threats_detected,
                critical_count,
                high_count,
            ],
        )
        .map_err(|e| anyhow!("Failed to update daily summary: {}", e))?;

        Ok(())
    }

    /// Record an RPC failure in today's daily summary.
    pub fn record_rpc_failure(&mut self, _block_number: u64) -> Result<()> {
        let today = Utc::now().format("%Y-%m-%d").to_string();

        self.conn.execute(
            "INSERT INTO daily_summary (date, rpc_failures)
             VALUES (?1, 1)
             ON CONFLICT(date) DO UPDATE SET rpc_failures = rpc_failures + 1",
            params![today],
        )
        .map_err(|e| anyhow!("Failed to record RPC failure: {}", e))?;

        Ok(())
    }

    /// Get today's summary for the daily report.
    pub fn get_today_summary(&self) -> Result<Option<DailySummaryRow>> {
        let today = Utc::now().format("%Y-%m-%d").to_string();

        let mut stmt = self.conn.prepare(
            "SELECT date, blocks_monitored, contracts_watched, threats_detected,
             critical_count, high_count, responses_executed, rpc_failures
             FROM daily_summary WHERE date = ?1"
        ).map_err(|e| anyhow!("Failed to prepare daily summary query: {}", e))?;

        let mut rows = stmt.query_map(params![today], |row| {
            Ok(DailySummaryRow {
                date: row.get(0)?,
                blocks_monitored: row.get(1)?,
                contracts_watched: row.get(2)?,
                threats_detected: row.get(3)?,
                critical_count: row.get(4)?,
                high_count: row.get(5)?,
                responses_executed: row.get(6)?,
                rpc_failures: row.get(7)?,
            })
        })
        .map_err(|e| anyhow!("Failed to query daily summary: {}", e))?;

        if let Some(row) = rows.next() {
            Ok(Some(row.map_err(|e| anyhow!("Row error: {}", e))?))
        } else {
            Ok(None)
        }
    }
}

/// A row from the daily_summary table.
#[derive(Debug)]
pub struct DailySummaryRow {
    pub date: String,
    pub blocks_monitored: i64,
    pub contracts_watched: i64,
    pub threats_detected: i64,
    pub critical_count: i64,
    pub high_count: i64,
    pub responses_executed: i64,
    pub rpc_failures: i64,
}
