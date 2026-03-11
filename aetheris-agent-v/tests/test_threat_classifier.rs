// Aetheris\aetheris-agent-v\tests\test_threat_classifier.rs
//
// Tests for the detector module: ThreatLevel ordering, ThreatReport
// construction, and all six classifier functions.
//
// Run: cargo test --test test_threat_classifier

use aetheris_agent_v::detector::{
    classify_hidden_function, classify_oracle_divergence, classify_ownership_transfer,
    classify_proxy_admin_change, classify_proxy_swap, classify_unexpected_change,
    ThreatLevel, ThreatReport,
    threat::ThreatType,
};

// ─── ThreatLevel ──────────────────────────────────────────────────────────────

#[test]
fn threat_level_ordering_is_correct() {
    // None < Low < Medium < High < Critical
    assert!(ThreatLevel::None < ThreatLevel::Low);
    assert!(ThreatLevel::Low < ThreatLevel::Medium);
    assert!(ThreatLevel::Medium < ThreatLevel::High);
    assert!(ThreatLevel::High < ThreatLevel::Critical);
}

#[test]
fn threat_level_equality() {
    assert_eq!(ThreatLevel::Critical, ThreatLevel::Critical);
    assert_ne!(ThreatLevel::High, ThreatLevel::Critical);
}

#[test]
fn threat_level_labels_are_non_empty() {
    for level in [
        ThreatLevel::None,
        ThreatLevel::Low,
        ThreatLevel::Medium,
        ThreatLevel::High,
        ThreatLevel::Critical,
    ] {
        assert!(!level.label().is_empty(), "label() should never be empty");
        assert!(!level.emoji().is_empty(), "emoji() should never be empty");
    }
}

#[test]
fn threat_level_display_matches_label() {
    assert_eq!(format!("{}", ThreatLevel::Critical), "Critical");
    assert_eq!(format!("{}", ThreatLevel::High), "High");
    assert_eq!(format!("{}", ThreatLevel::None), "None");
}

// ─── classify_proxy_swap ──────────────────────────────────────────────────────

#[test]
fn proxy_swap_is_always_critical() {
    let report = make_proxy_swap(
        "0xaaaa",
        "0x0000000000000000000000001111111111111111111111111111111111111111",
        "0x0000000000000000000000002222222222222222222222222222222222222222",
    );
    assert_eq!(report.threat_level, ThreatLevel::Critical);
    assert_eq!(report.threat_type, ThreatType::ProxyImplementationSwap);
}

#[test]
fn proxy_swap_report_contains_contract_address() {
    let addr = "0xdeadbeef00000000000000000000000000000001";
    let report = make_proxy_swap(addr, "0xold", "0xnew");
    assert_eq!(report.contract_address, addr);
}

#[test]
fn proxy_swap_report_contains_old_and_new_values() {
    let old = "0x0000000000000000000000001111111111111111111111111111111111111111";
    let new = "0x0000000000000000000000002222222222222222222222222222222222222222";
    let report = make_proxy_swap("0xcontract", old, new);
    assert_eq!(report.old_value.as_deref(), Some(old));
    assert_eq!(report.new_value.as_deref(), Some(new));
}

#[test]
fn proxy_swap_description_is_non_empty() {
    let report = make_proxy_swap("0xcontract", "0xold", "0xnew");
    assert!(!report.description.is_empty());
    // Description should mention the contract
    assert!(report.description.contains("0xcontract"));
}

// ─── classify_proxy_admin_change ─────────────────────────────────────────────

#[test]
fn proxy_admin_change_is_high_severity() {
    let report = make_proxy_admin_change("0xcontract", "0xold_admin", "0xnew_admin");
    assert_eq!(report.threat_level, ThreatLevel::High);
    assert_eq!(report.threat_type, ThreatType::ProxyAdminChange);
}

#[test]
fn proxy_admin_change_captures_slot_key() {
    let report = make_proxy_admin_change("0xcontract", "0xold", "0xnew");
    assert!(report.slot_key.is_some(), "slot_key should be set for admin change");
}

// ─── classify_ownership_transfer ─────────────────────────────────────────────

#[test]
fn ownership_transfer_is_high_severity() {
    let report = classify_ownership_transfer(
        1_000_000,
        1_700_000_000,
        "0xcontract",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0xold_owner",
        "0xnew_owner",
    );
    assert_eq!(report.threat_level, ThreatLevel::High);
    assert_eq!(report.threat_type, ThreatType::OwnershipTransfer);
}

#[test]
fn ownership_transfer_description_mentions_new_owner() {
    let new_owner = "0xdeadbeef00000000000000000000000000000099";
    let report = classify_ownership_transfer(
        1,
        0,
        "0xcontract",
        "0x00",
        "0xold",
        new_owner,
    );
    assert!(report.description.contains(new_owner));
}

// ─── classify_hidden_function ────────────────────────────────────────────────

#[test]
fn hidden_function_is_medium_severity() {
    let report = classify_hidden_function(
        999,
        0,
        "0xcontract",
        "0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
    assert_eq!(report.threat_level, ThreatLevel::Medium);
    assert_eq!(report.threat_type, ThreatType::HiddenFunctionActivation);
}

// ─── classify_oracle_divergence ──────────────────────────────────────────────

#[test]
fn oracle_divergence_below_threshold_would_not_be_called() {
    // This function is only called when divergence IS above threshold.
    // Verify it produces the right type.
    let report = classify_oracle_divergence(
        100,
        0,
        "0xchainlink",
        300_000_000_00,  // $3000.00 with 8 decimals
        285_000_000_00,  // $2850.00 — 5% lower
        500,
        500,
    );
    assert_eq!(report.threat_type, ThreatType::OracleManipulationPrecursor);
    // 5% divergence at threshold → Medium
    assert_eq!(report.threat_level, ThreatLevel::Medium);
}

#[test]
fn oracle_divergence_double_threshold_is_high() {
    // 1100 bps divergence with 500 bps threshold → 1100 > 1000 → High
    let report = classify_oracle_divergence(
        100,
        0,
        "0xchainlink",
        300_000_000_00,
        267_000_000_00,  // ~11% lower
        1100,            // 1100 bps divergence — strictly > 2x threshold (1000)
        500,             // threshold 500 bps
    );
    assert_eq!(report.threat_level, ThreatLevel::High);
}

#[test]
fn oracle_report_has_no_slot_key() {
    let report = classify_oracle_divergence(100, 0, "0xaddr", 100, 90, 1000, 500);
    assert!(report.slot_key.is_none(), "oracle reports have no slot key");
    assert!(report.old_value.is_none());
    assert!(report.new_value.is_none());
}

// ─── classify_unexpected_change ──────────────────────────────────────────────

#[test]
fn unexpected_change_is_low_severity() {
    let report = classify_unexpected_change(
        50,
        0,
        "0xcontract",
        "0xslot",
        "0xold",
        "0xnew",
    );
    assert_eq!(report.threat_level, ThreatLevel::Low);
    assert_eq!(report.threat_type, ThreatType::UnexpectedStateChange);
}

// ─── ThreatReport block and timestamp ────────────────────────────────────────

#[test]
fn threat_report_preserves_block_number_and_timestamp() {
    let block = 18_500_000u64;
    let ts = 1_700_000_000i64;
    let report = classify_proxy_swap(
        block, ts, "0xcontract", "0xslot", "0xold", "0xnew",
    );
    assert_eq!(report.block_number, block);
    assert_eq!(report.timestamp, ts);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn make_proxy_swap(contract: &str, old: &str, new: &str) -> ThreatReport {
    classify_proxy_swap(
        1_000_000,
        1_700_000_000,
        contract,
        "0x360894a13ba1a3210667c828492db98dca3e2076883f8ad8be6ea30d4b3741f3",
        old,
        new,
    )
}

fn make_proxy_admin_change(contract: &str, old: &str, new: &str) -> ThreatReport {
    classify_proxy_admin_change(
        1_000_000,
        1_700_000_000,
        contract,
        "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
        old,
        new,
    )
}
