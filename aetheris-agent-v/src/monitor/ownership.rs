// Aetheris\aetheris-agent-v\src\monitor\ownership.rs

/// monitor/ownership.rs — Ownership slot monitoring
///
/// Detects unexpected transfers of owner() or DEFAULT_ADMIN_ROLE.
/// Watches slot 0 (OpenZeppelin Ownable v4 owner) and similar ownership
/// storage patterns.
///
/// An unexpected ownership transfer to an unrecognised address is a High
/// threat — the new owner could immediately perform privileged actions.

use crate::detector::{self, ThreatReport};
use crate::monitor::watchlist::SlotType;
use crate::rpc::multicall::{extract_address_from_slot, is_zero_value};

/// Analyse a change in an ownership slot.
///
/// Returns Some(ThreatReport) if a real ownership transfer is detected,
/// None if this is first-time initialisation (zero → address) or no change.
pub fn analyse_ownership_change(
    block_number: u64,
    timestamp: i64,
    contract_address: &str,
    slot_key: &str,
    slot_type: &SlotType,
    old_value: &str,
    new_value: &str,
) -> Option<ThreatReport> {
    if old_value == new_value {
        return None;
    }

    // First-time initialisation: owner being set from zero is normal at deployment.
    // Only care about transfers FROM a known address TO a new one.
    if is_zero_value(old_value) {
        return None;
    }

    // Extract address from bytes32 slot value
    let old_owner = extract_address_from_slot(old_value);
    let new_owner = extract_address_from_slot(new_value);

    if old_owner == new_owner {
        return None;
    }

    // Transferring to zero address = renouncing ownership
    // This is often intentional but still worth alerting on.
    if is_zero_value(new_value) {
        return Some(detector::classify_ownership_transfer(
            block_number,
            timestamp,
            contract_address,
            slot_key,
            &old_owner,
            "0x0000000000000000000000000000000000000000 (renounced)",
        ));
    }

    Some(detector::classify_ownership_transfer(
        block_number,
        timestamp,
        contract_address,
        slot_key,
        &old_owner,
        &new_owner,
    ))
}
