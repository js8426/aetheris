// Aetheris\aetheris-agent-v\tests\test_slot_snapshot.rs
//
// Tests for monitor::state::SlotSnapshot — the per-block diff engine.
// This is the most critical data structure in Agent V: a wrong diff
// means either a missed threat or a false-positive emergency response.
//
// Run: cargo test --test test_slot_snapshot

use aetheris_agent_v::monitor::state::SlotSnapshot;

const CONTRACT_A: &str = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CONTRACT_B: &str = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SLOT_IMPL:  &str = "0x360894a13ba1a3210667c828492db98dca3e2076883f8ad8be6ea30d4b3741f3";
const SLOT_OWNER: &str = "0x0000000000000000000000000000000000000000000000000000000000000000";

const VAL_ZERO:    &str = "0x0000000000000000000000000000000000000000000000000000000000000000";
const VAL_IMPL_V1: &str = "0x000000000000000000000000aaaa111111111111111111111111111111111111";
const VAL_IMPL_V2: &str = "0x000000000000000000000000bbbb222222222222222222222222222222222222";
const VAL_OWNER_A: &str = "0x000000000000000000000000cccc333333333333333333333333333333333333";
const VAL_OWNER_B: &str = "0x000000000000000000000000dddd444444444444444444444444444444444444";

// ─── New snapshot starts empty ────────────────────────────────────────────────

#[test]
fn new_snapshot_has_zero_entries() {
    let snap = SlotSnapshot::new();
    assert_eq!(snap.len(), 0);
    assert_eq!(snap.total_diffs_detected, 0);
}

#[test]
fn get_on_empty_snapshot_returns_none() {
    let snap = SlotSnapshot::new();
    assert!(snap.get(CONTRACT_A, SLOT_IMPL).is_none());
}

// ─── Seed (startup / restart recovery) ───────────────────────────────────────

#[test]
fn seed_populates_snapshot() {
    let mut snap = SlotSnapshot::new();
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1);
    assert_eq!(snap.get(CONTRACT_A, SLOT_IMPL), Some(&VAL_IMPL_V1.to_string()));
    assert_eq!(snap.len(), 1);
}

#[test]
fn seed_multiple_contracts_and_slots() {
    let mut snap = SlotSnapshot::new();
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1);
    snap.seed(CONTRACT_A, SLOT_OWNER, VAL_OWNER_A);
    snap.seed(CONTRACT_B, SLOT_IMPL, VAL_IMPL_V1);
    assert_eq!(snap.len(), 3);
}

#[test]
fn seed_overrides_existing_value() {
    let mut snap = SlotSnapshot::new();
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1);
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V2); // overwrite
    assert_eq!(snap.get(CONTRACT_A, SLOT_IMPL), Some(&VAL_IMPL_V2.to_string()));
    assert_eq!(snap.len(), 1); // still one entry
}

// ─── First observation — must NOT produce a diff ─────────────────────────────

#[test]
fn first_observation_of_slot_does_not_produce_diff() {
    // This is the critical startup safety property: seeing a slot for the first
    // time must never trigger a threat, because we don't know the "before" state.
    let mut snap = SlotSnapshot::new();
    let reads = vec![
        (CONTRACT_A.to_string(), SLOT_IMPL.to_string(), VAL_IMPL_V1.to_string()),
    ];
    let diffs = snap.diff_and_update(&reads);
    assert!(diffs.is_empty(), "First observation must never produce a diff");
    assert_eq!(snap.total_diffs_detected, 0);
}

#[test]
fn first_observation_seeds_snapshot_for_next_block() {
    let mut snap = SlotSnapshot::new();
    let reads = vec![
        (CONTRACT_A.to_string(), SLOT_IMPL.to_string(), VAL_IMPL_V1.to_string()),
    ];
    snap.diff_and_update(&reads);
    // Now the snapshot should contain the value
    assert_eq!(snap.get(CONTRACT_A, SLOT_IMPL), Some(&VAL_IMPL_V1.to_string()));
}

// ─── No change — must NOT produce a diff ─────────────────────────────────────

#[test]
fn same_value_in_consecutive_blocks_produces_no_diff() {
    let mut snap = SlotSnapshot::new();
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1);

    // Block N: same value
    let reads = vec![
        (CONTRACT_A.to_string(), SLOT_IMPL.to_string(), VAL_IMPL_V1.to_string()),
    ];
    let diffs = snap.diff_and_update(&reads);
    assert!(diffs.is_empty());
    assert_eq!(snap.total_diffs_detected, 0);
}

#[test]
fn hundred_blocks_with_no_change_produces_no_diffs() {
    let mut snap = SlotSnapshot::new();
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1);

    for _ in 0..100 {
        let reads = vec![
            (CONTRACT_A.to_string(), SLOT_IMPL.to_string(), VAL_IMPL_V1.to_string()),
        ];
        let diffs = snap.diff_and_update(&reads);
        assert!(diffs.is_empty());
    }
    assert_eq!(snap.total_diffs_detected, 0);
}

// ─── Change detected ─────────────────────────────────────────────────────────

#[test]
fn changed_slot_produces_exactly_one_diff() {
    let mut snap = SlotSnapshot::new();
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1);

    let reads = vec![
        (CONTRACT_A.to_string(), SLOT_IMPL.to_string(), VAL_IMPL_V2.to_string()),
    ];
    let diffs = snap.diff_and_update(&reads);
    assert_eq!(diffs.len(), 1);
    assert_eq!(diffs[0].contract_address, CONTRACT_A);
    assert_eq!(diffs[0].slot_key, SLOT_IMPL);
    assert_eq!(diffs[0].old_value, VAL_IMPL_V1);
    assert_eq!(diffs[0].new_value, VAL_IMPL_V2);
    assert_eq!(snap.total_diffs_detected, 1);
}

#[test]
fn diff_updates_snapshot_to_new_value() {
    let mut snap = SlotSnapshot::new();
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1);

    let reads = vec![
        (CONTRACT_A.to_string(), SLOT_IMPL.to_string(), VAL_IMPL_V2.to_string()),
    ];
    snap.diff_and_update(&reads);

    // Subsequent block with V2 should NOT produce a diff
    let reads2 = vec![
        (CONTRACT_A.to_string(), SLOT_IMPL.to_string(), VAL_IMPL_V2.to_string()),
    ];
    let diffs2 = snap.diff_and_update(&reads2);
    assert!(diffs2.is_empty(), "After snapshot updates, same value should not re-diff");
}

#[test]
fn multiple_slots_changing_in_same_block_all_reported() {
    let mut snap = SlotSnapshot::new();
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1);
    snap.seed(CONTRACT_A, SLOT_OWNER, VAL_OWNER_A);
    snap.seed(CONTRACT_B, SLOT_IMPL, VAL_IMPL_V1);

    let reads = vec![
        (CONTRACT_A.to_string(), SLOT_IMPL.to_string(),  VAL_IMPL_V2.to_string()),  // changed
        (CONTRACT_A.to_string(), SLOT_OWNER.to_string(), VAL_OWNER_A.to_string()),   // unchanged
        (CONTRACT_B.to_string(), SLOT_IMPL.to_string(),  VAL_IMPL_V2.to_string()),  // changed
    ];
    let diffs = snap.diff_and_update(&reads);
    assert_eq!(diffs.len(), 2, "Two slots changed, should get two diffs");
    assert_eq!(snap.total_diffs_detected, 2);
}

#[test]
fn only_changed_slots_appear_in_diffs() {
    let mut snap = SlotSnapshot::new();
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1);
    snap.seed(CONTRACT_A, SLOT_OWNER, VAL_OWNER_A);

    let reads = vec![
        (CONTRACT_A.to_string(), SLOT_IMPL.to_string(),  VAL_IMPL_V1.to_string()),  // no change
        (CONTRACT_A.to_string(), SLOT_OWNER.to_string(), VAL_OWNER_B.to_string()),  // changed
    ];
    let diffs = snap.diff_and_update(&reads);
    assert_eq!(diffs.len(), 1);
    assert_eq!(diffs[0].slot_key, SLOT_OWNER);
}

// ─── Mixed first-observation + change in same batch ──────────────────────────

#[test]
fn batch_with_new_slot_and_changed_slot_only_reports_the_change() {
    let mut snap = SlotSnapshot::new();
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1); // known slot

    let reads = vec![
        (CONTRACT_A.to_string(), SLOT_IMPL.to_string(),  VAL_IMPL_V2.to_string()),  // changed
        (CONTRACT_B.to_string(), SLOT_IMPL.to_string(),  VAL_IMPL_V1.to_string()),  // first observation
    ];
    let diffs = snap.diff_and_update(&reads);
    assert_eq!(diffs.len(), 1, "Only the known-slot change should be diffed");
    assert_eq!(diffs[0].contract_address, CONTRACT_A);
}

// ─── update() direct ─────────────────────────────────────────────────────────

#[test]
fn update_sets_new_value_without_diff() {
    let mut snap = SlotSnapshot::new();
    snap.update(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1);
    assert_eq!(snap.get(CONTRACT_A, SLOT_IMPL), Some(&VAL_IMPL_V1.to_string()));
}

// ─── entries() iterator ──────────────────────────────────────────────────────

#[test]
fn entries_iterator_returns_all_seeded_slots() {
    let mut snap = SlotSnapshot::new();
    snap.seed(CONTRACT_A, SLOT_IMPL, VAL_IMPL_V1);
    snap.seed(CONTRACT_B, SLOT_OWNER, VAL_OWNER_A);

    let entries: Vec<_> = snap.entries().collect();
    assert_eq!(entries.len(), 2);
}