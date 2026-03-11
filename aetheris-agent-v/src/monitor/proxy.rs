// Aetheris\aetheris-agent-v\src\monitor\proxy.rs

/// monitor/proxy.rs — EIP-1967 proxy slot monitoring
///
/// Reads and compares the EIP-1967 implementation and admin slots for
/// all watched proxy contracts. Any change is the highest-priority
/// security event Agent V can detect — a proxy swap is a rug pull.
///
/// The snapshot for each slot is carried forward from block to block in
/// monitor/state.rs. This module only performs the classification step:
/// given old value and new value for an EIP-1967 slot, emit a ThreatReport.

use crate::detector::{
    self, ThreatReport,
    threat::ThreatType,
};
use crate::monitor::watchlist::{SlotType, SLOT_EIP1967_ADMIN, SLOT_EIP1967_IMPL};
use crate::rpc::multicall::{extract_address_from_slot, is_zero_value};

/// Analyse a storage slot change on a proxy contract.
/// Returns Some(ThreatReport) if the change warrants classification,
/// or None if the change is from zero → some value on first observation
/// (normal initialisation pattern).
pub fn analyse_proxy_slot_change(
    block_number: u64,
    timestamp: i64,
    contract_address: &str,
    slot_key: &str,
    slot_type: &SlotType,
    old_value: &str,
    new_value: &str,
) -> Option<ThreatReport> {
    // Skip: slot going from zero to non-zero on first read is not a threat.
    // This happens during initial snapshot seeding.
    if is_zero_value(old_value) && !is_zero_value(new_value) {
        // Only skip if this looks like our very first reading (old is zero).
        // If old was actually set and is now non-zero → different case below.
        // For proxies, implementation must NEVER be zero after deployment,
        // so if old = 0, this is the first time we've seen it. Snapshot and move on.
        return None;
    }

    // Zero → Zero: no change at all
    if old_value == new_value {
        return None;
    }

    match slot_type {
        SlotType::ProxyImplementation => {
            // Extract the address portion from the bytes32 slot value
            let old_addr = extract_address_from_slot(old_value);
            let new_addr = extract_address_from_slot(new_value);

            // If the extracted addresses are different, this is a real swap
            if old_addr != new_addr {
                Some(detector::classify_proxy_swap(
                    block_number,
                    timestamp,
                    contract_address,
                    slot_key,
                    &old_addr,
                    &new_addr,
                ))
            } else {
                // Slot encoding changed but address is the same — not a swap
                None
            }
        }
        SlotType::ProxyAdmin => {
            let old_addr = extract_address_from_slot(old_value);
            let new_addr = extract_address_from_slot(new_value);

            if old_addr != new_addr {
                Some(detector::classify_proxy_admin_change(
                    block_number,
                    timestamp,
                    contract_address,
                    slot_key,
                    &old_addr,
                    &new_addr,
                ))
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Returns the well-known slot key for a given SlotType.
/// Used to look up the correct slot constant when building Multicall3 requests.
pub fn slot_key_for_type(slot_type: &SlotType) -> Option<&'static str> {
    match slot_type {
        SlotType::ProxyImplementation => Some(SLOT_EIP1967_IMPL),
        SlotType::ProxyAdmin => Some(SLOT_EIP1967_ADMIN),
        _ => None,
    }
}
