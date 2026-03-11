// Aetheris\aetheris-agent-v\tests\test_db.rs
//
// Tests for db::Database — SQLite persistence layer.
// Uses tempfile to create a fresh DB per test so tests are fully isolated.
//
// Run: cargo test --test test_db

use aetheris_agent_v::db::Database;
use aetheris_agent_v::detector::{ThreatLevel, ThreatReport, threat::ThreatType};
use tempfile::NamedTempFile;

// ─── Helper: create a temporary DB that is deleted after the test ─────────────

fn temp_db() -> (Database, NamedTempFile) {
    let file = NamedTempFile::new().expect("Failed to create temp file");
    let db = Database::open(file.path().to_str().unwrap())
        .expect("Failed to open test DB");
    (db, file)
}

fn make_critical_report() -> ThreatReport {
    ThreatReport::slot_change(
        18_500_000,
        1_700_000_000,
        "0xaaaa000000000000000000000000000000000001".to_string(),
        ThreatLevel::Critical,
        ThreatType::ProxyImplementationSwap,
        "0x360894a13ba1a3210667c828492db98dca3e2076883f8ad8be6ea30d4b3741f3".to_string(),
        "0x000000000000000000000000old_impl_address_padding_here_000000000".to_string(),
        "0x000000000000000000000000new_impl_address_padding_here_000000000".to_string(),
        "Test proxy swap".to_string(),
    )
}

fn make_high_report(contract: &str, block: u64) -> ThreatReport {
    ThreatReport::slot_change(
        block,
        1_700_000_000,
        contract.to_string(),
        ThreatLevel::High,
        ThreatType::OwnershipTransfer,
        "0x0000000000000000000000000000000000000000000000000000000000000000".to_string(),
        "0xold_owner".to_string(),
        "0xnew_owner".to_string(),
        "Test ownership transfer".to_string(),
    )
}

// ─── open() ──────────────────────────────────────────────────────────────────

#[test]
fn open_creates_db_file_and_tables() {
    let (_db, _file) = temp_db(); // just check it doesn't panic
}

#[test]
fn open_is_idempotent_on_existing_db() {
    let file = NamedTempFile::new().unwrap();
    let path = file.path().to_str().unwrap();
    let _db1 = Database::open(path).expect("First open failed");
    let _db2 = Database::open(path).expect("Second open (idempotent) failed");
}

// ─── insert_incident ─────────────────────────────────────────────────────────

#[test]
fn insert_incident_does_not_error() {
    let (mut db, _file) = temp_db();
    let report = make_critical_report();
    db.insert_incident(&report).expect("insert_incident should succeed");
}

#[test]
fn insert_multiple_incidents_succeeds() {
    let (mut db, _file) = temp_db();
    for i in 0..10 {
        let report = make_high_report(
            "0xbbbb000000000000000000000000000000000002",
            18_500_000 + i,
        );
        db.insert_incident(&report).expect("insert_incident failed");
    }
}

#[test]
fn insert_oracle_incident_with_no_slot_succeeds() {
    let (mut db, _file) = temp_db();
    let report = ThreatReport::oracle(
        18_500_001,
        1_700_000_001,
        "0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70".to_string(),
        ThreatLevel::Medium,
        "Chainlink vs Pyth divergence 600 bps".to_string(),
    );
    db.insert_incident(&report).expect("Oracle incident insert failed");
}

// ─── upsert_snapshot / load_latest_snapshots ─────────────────────────────────

#[test]
fn load_latest_snapshots_empty_on_new_db() {
    let (db, _file) = temp_db();
    let snapshots = db.load_latest_snapshots().expect("load failed");
    assert!(snapshots.is_empty());
}

#[test]
fn upsert_snapshot_then_load_returns_it() {
    let (db, _file) = temp_db();
    db.upsert_snapshot(
        18_500_000,
        "0xaaaa000000000000000000000000000000000001",
        "0x360894a13ba1a3210667c828492db98dca3e2076883f8ad8be6ea30d4b3741f3",
        "0x000000000000000000000000impl_addr_here00000000000000000000000000",
    ).expect("upsert failed");

    let snapshots = db.load_latest_snapshots().expect("load failed");
    assert_eq!(snapshots.len(), 1);
    assert_eq!(snapshots[0].0, "0xaaaa000000000000000000000000000000000001");
}

#[test]
fn upsert_snapshot_same_slot_overwrites() {
    let (db, _file) = temp_db();
    let contract = "0xaaaa000000000000000000000000000000000001";
    let slot = "0x0000000000000000000000000000000000000000000000000000000000000000";

    db.upsert_snapshot(18_500_000, contract, slot, "0xvalue_one").expect("first upsert failed");
    db.upsert_snapshot(18_500_001, contract, slot, "0xvalue_two").expect("second upsert failed");

    let snapshots = db.load_latest_snapshots().expect("load failed");
    // Should still be 1 entry (UNIQUE on contract+slot → REPLACE)
    assert_eq!(snapshots.len(), 1, "Same slot should overwrite, not duplicate");
    assert_eq!(snapshots[0].2, "0xvalue_two", "Should have the newer value");
}

#[test]
fn multiple_contracts_multiple_slots_all_stored() {
    let (db, _file) = temp_db();
    let entries = vec![
        ("0xaaaa000000000000000000000000000000000001", "0xslot_impl", "0xval1"),
        ("0xaaaa000000000000000000000000000000000001", "0xslot_owner", "0xval2"),
        ("0xbbbb000000000000000000000000000000000002", "0xslot_impl", "0xval3"),
    ];
    for (contract, slot, value) in &entries {
        db.upsert_snapshot(1, contract, slot, value).unwrap();
    }
    let loaded = db.load_latest_snapshots().unwrap();
    assert_eq!(loaded.len(), 3);
}

// ─── update_daily_summary ────────────────────────────────────────────────────

#[test]
fn update_daily_summary_does_not_error_on_first_call() {
    let (mut db, _file) = temp_db();
    db.update_daily_summary(18_500_000, 7, 0, 0, 0)
        .expect("update_daily_summary should succeed");
}

#[test]
fn update_daily_summary_accumulates_block_count() {
    let (mut db, _file) = temp_db();
    // Simulate 5 blocks
    for i in 0..5 {
        db.update_daily_summary(18_500_000 + i, 7, 0, 0, 0).unwrap();
    }
    let summary = db.get_today_summary().unwrap();
    assert!(summary.is_some());
    let s = summary.unwrap();
    assert_eq!(s.blocks_monitored, 5);
    assert_eq!(s.contracts_watched, 7);
}

#[test]
fn update_daily_summary_accumulates_threat_counts() {
    let (mut db, _file) = temp_db();
    // Block 1: 1 critical threat
    db.update_daily_summary(1, 5, 1, 1, 0).unwrap();
    // Block 2: 1 high threat
    db.update_daily_summary(2, 5, 1, 0, 1).unwrap();

    let summary = db.get_today_summary().unwrap().unwrap();
    assert_eq!(summary.threats_detected, 2);
    assert_eq!(summary.critical_count, 1);
    assert_eq!(summary.high_count, 1);
}

// ─── record_rpc_failure ──────────────────────────────────────────────────────

#[test]
fn record_rpc_failure_accumulates() {
    let (mut db, _file) = temp_db();
    for _ in 0..3 {
        db.record_rpc_failure(18_500_000).unwrap();
    }
    let summary = db.get_today_summary().unwrap().unwrap();
    assert_eq!(summary.rpc_failures, 3);
}

// ─── get_today_summary ────────────────────────────────────────────────────────

#[test]
fn get_today_summary_returns_none_when_no_data() {
    let (db, _file) = temp_db();
    let result = db.get_today_summary().unwrap();
    assert!(result.is_none());
}

// ─── update_incident_response ────────────────────────────────────────────────

#[test]
fn update_incident_response_does_not_error() {
    let (mut db, _file) = temp_db();
    let report = make_critical_report();
    db.insert_incident(&report).unwrap();
    db.update_incident_response(
        report.block_number,
        &report.contract_address,
        "Alpha.pause=0xtxhash, Vault.pause=0xtxhash2",
        Some("0xtxhash"),
    ).expect("update_incident_response should succeed");
}