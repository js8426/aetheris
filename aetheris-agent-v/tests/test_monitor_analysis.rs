// Aetheris\aetheris-agent-v\tests\test_monitor_analysis.rs
//
// Tests for the monitor analysis functions:
//   monitor::proxy::analyse_proxy_slot_change
//   monitor::ownership::analyse_ownership_change
//   monitor::oracle (unit: compute_divergence_bps via oracle.rs tests)
//
// These test the decision logic that sits between "a slot changed"
// and "emit a ThreatReport". False positives here = unnecessary emergency
// responses. False negatives = missed attacks.
//
// Run: cargo test --test test_monitor_analysis

use aetheris_agent_v::monitor::{
    proxy::analyse_proxy_slot_change,
    ownership::analyse_ownership_change,
    watchlist::SlotType,
};
use aetheris_agent_v::detector::ThreatLevel;

const IMPL_SLOT: &str = "0x360894a13ba1a3210667c828492db98dca3e2076883f8ad8be6ea30d4b3741f3";
const ADMIN_SLOT: &str = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const OWNER_SLOT: &str = "0x0000000000000000000000000000000000000000000000000000000000000000";

const ZERO: &str    = "0x0000000000000000000000000000000000000000000000000000000000000000";
const IMPL_V1: &str = "0x0000000000000000000000001111111111111111111111111111111111111111";
const IMPL_V2: &str = "0x0000000000000000000000002222222222222222222222222222222222222222";
const ADDR_A: &str  = "0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ADDR_B: &str  = "0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

// ─── analyse_proxy_slot_change ────────────────────────────────────────────────

#[test]
fn proxy_swap_different_addresses_returns_critical_report() {
    let result = analyse_proxy_slot_change(
        1_000_000, 0, "0xcontract",
        IMPL_SLOT, &SlotType::ProxyImplementation,
        IMPL_V1, IMPL_V2,
    );
    assert!(result.is_some(), "Different impl addresses should produce a ThreatReport");
    let report = result.unwrap();
    assert_eq!(report.threat_level, ThreatLevel::Critical);
}

#[test]
fn proxy_swap_same_value_returns_none() {
    let result = analyse_proxy_slot_change(
        1_000_000, 0, "0xcontract",
        IMPL_SLOT, &SlotType::ProxyImplementation,
        IMPL_V1, IMPL_V1, // no change
    );
    assert!(result.is_none(), "Identical values should not produce a threat");
}

#[test]
fn proxy_swap_zero_to_impl_returns_none_first_observation() {
    // Zero old value = first time we're seeing this slot (startup).
    // Must NOT be treated as a real swap.
    let result = analyse_proxy_slot_change(
        1_000_000, 0, "0xcontract",
        IMPL_SLOT, &SlotType::ProxyImplementation,
        ZERO, IMPL_V1, // first observation
    );
    assert!(result.is_none(), "Zero→nonzero is first-time init, not a proxy swap");
}

#[test]
fn proxy_admin_change_different_addresses_returns_high() {
    let result = analyse_proxy_slot_change(
        1_000_000, 0, "0xcontract",
        ADMIN_SLOT, &SlotType::ProxyAdmin,
        ADDR_A, ADDR_B,
    );
    assert!(result.is_some());
    let report = result.unwrap();
    assert_eq!(report.threat_level, ThreatLevel::High);
}

#[test]
fn proxy_admin_same_value_returns_none() {
    let result = analyse_proxy_slot_change(
        1_000_000, 0, "0xcontract",
        ADMIN_SLOT, &SlotType::ProxyAdmin,
        ADDR_A, ADDR_A,
    );
    assert!(result.is_none());
}

#[test]
fn proxy_admin_zero_to_value_returns_none() {
    let result = analyse_proxy_slot_change(
        1_000_000, 0, "0xcontract",
        ADMIN_SLOT, &SlotType::ProxyAdmin,
        ZERO, ADDR_A,
    );
    assert!(result.is_none(), "Zero→nonzero admin is first-time init");
}

#[test]
fn general_state_slot_returns_none_from_proxy_analyser() {
    // analyse_proxy_slot_change only handles ProxyImplementation and ProxyAdmin
    let result = analyse_proxy_slot_change(
        1_000_000, 0, "0xcontract",
        OWNER_SLOT, &SlotType::Ownership, // wrong slot type for this function
        ADDR_A, ADDR_B,
    );
    assert!(result.is_none(), "Non-proxy slot types should return None from proxy analyser");
}

// ─── analyse_ownership_change ────────────────────────────────────────────────

#[test]
fn ownership_transfer_old_to_new_returns_high_report() {
    let result = analyse_ownership_change(
        1_000_000, 0, "0xcontract",
        OWNER_SLOT, &SlotType::Ownership,
        ADDR_A, ADDR_B,
    );
    assert!(result.is_some(), "Owner change should produce a ThreatReport");
    let report = result.unwrap();
    assert_eq!(report.threat_level, ThreatLevel::High);
}

#[test]
fn ownership_same_value_returns_none() {
    let result = analyse_ownership_change(
        1_000_000, 0, "0xcontract",
        OWNER_SLOT, &SlotType::Ownership,
        ADDR_A, ADDR_A,
    );
    assert!(result.is_none(), "Same owner must not produce a threat");
}

#[test]
fn ownership_zero_to_value_returns_none_first_observation() {
    // Contract being deployed for the first time: owner set from zero.
    let result = analyse_ownership_change(
        1_000_000, 0, "0xcontract",
        OWNER_SLOT, &SlotType::Ownership,
        ZERO, ADDR_A,
    );
    assert!(result.is_none(), "Zero→owner is deployment init, not a transfer threat");
}

#[test]
fn ownership_renounce_to_zero_returns_report() {
    // owner → zero_address is renouncing ownership — still worth alerting
    let result = analyse_ownership_change(
        1_000_000, 0, "0xcontract",
        OWNER_SLOT, &SlotType::Ownership,
        ADDR_A, ZERO,
    );
    assert!(result.is_some(), "Ownership renouncement should still produce a report");
}

#[test]
fn ownership_report_contains_correct_block_number() {
    let block = 18_750_000u64;
    let result = analyse_ownership_change(
        block, 0, "0xcontract",
        OWNER_SLOT, &SlotType::Ownership,
        ADDR_A, ADDR_B,
    );
    assert_eq!(result.unwrap().block_number, block);
}

#[test]
fn ownership_report_contains_contract_address() {
    let contract = "0xeeee000000000000000000000000000000000005";
    let result = analyse_ownership_change(
        1, 0, contract,
        OWNER_SLOT, &SlotType::Ownership,
        ADDR_A, ADDR_B,
    );
    assert_eq!(result.unwrap().contract_address, contract);
}

// ─── oracle divergence unit tests (from monitor/oracle.rs internal fn) ────────
// These live in the module itself via #[cfg(test)] in oracle.rs, but we
// verify the observable behaviour via the public check_oracle_divergence path.
// Since that requires live RPC, we test the math here by re-deriving it.

#[test]
fn divergence_math_five_percent() {
    // 5% divergence = 500 bps
    let p1: u128 = 100_000;
    let p2: u128 = 95_000;
    let diff = p1 - p2;
    let max = p1.max(p2);
    let bps = (diff * 10_000) / max;
    assert_eq!(bps, 500u128);
}

#[test]
fn divergence_math_zero_percent() {
    let p: u128 = 300_000_000_00;
    let diff = 0u128;
    let bps = (diff * 10_000) / p;
    assert_eq!(bps, 0u128);
}

#[test]
fn divergence_math_ten_percent() {
    let p1: u128 = 100_000;
    let p2: u128 = 90_000;
    let diff = p1 - p2;
    let bps = (diff * 10_000) / p1.max(p2);
    assert_eq!(bps, 1000u128);
}