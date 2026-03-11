// Aetheris\aetheris-agent-v\src\monitor\state.rs

/// monitor/state.rs — Storage slot snapshot store and diff detection
///
/// Maintains an in-memory map of (contract_address, slot_key) → last_known_value.
/// After each block's Multicall3 batch read, compare new values against the
/// snapshot. Any change is passed to the appropriate classifier in the
/// detector module.
///
/// The snapshot is also periodically flushed to SQLite (db/mod.rs) so that
/// Agent V recovers correctly after restart without false-positives on
/// first-run initialisation.

use std::collections::HashMap;
use tracing::{debug, info};

/// Composite key for the snapshot map.
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct SlotKey {
    pub contract_address: String,
    pub slot_key: String,
}

/// The in-memory snapshot of all watched storage slots.
/// Seeded from the DB on startup, then updated each block.
pub struct SlotSnapshot {
    /// Maps (contract, slot) → most recently observed value (normalised hex)
    data: HashMap<SlotKey, String>,
    /// Total number of diff detections across the lifetime of this snapshot
    pub total_diffs_detected: u64,
}

/// Result of comparing old vs new slot values.
#[derive(Debug, Clone)]
pub struct SlotDiff {
    pub contract_address: String,
    pub slot_key: String,
    pub old_value: String,
    pub new_value: String,
}

impl SlotSnapshot {
    /// Create an empty snapshot. Typically seeded from DB after construction.
    pub fn new() -> Self {
        Self {
            data: HashMap::new(),
            total_diffs_detected: 0,
        }
    }

    /// Seed the snapshot from saved data (e.g. DB records on startup).
    /// This prevents false-positive diffs on the very first block after restart.
    pub fn seed(&mut self, contract_address: &str, slot_key: &str, value: &str) {
        self.data.insert(
            SlotKey {
                contract_address: contract_address.to_string(),
                slot_key: slot_key.to_string(),
            },
            value.to_string(),
        );
    }

    /// Get the last known value for a (contract, slot) pair.
    /// Returns None if we've never seen this slot before (first block after startup).
    pub fn get(&self, contract_address: &str, slot_key: &str) -> Option<&String> {
        self.data.get(&SlotKey {
            contract_address: contract_address.to_string(),
            slot_key: slot_key.to_string(),
        })
    }

    /// Update the snapshot with a new value.
    pub fn update(&mut self, contract_address: &str, slot_key: &str, value: &str) {
        self.data.insert(
            SlotKey {
                contract_address: contract_address.to_string(),
                slot_key: slot_key.to_string(),
            },
            value.to_string(),
        );
    }

    /// Given a list of (contract, slot, new_value) tuples from the current block's
    /// batch read, return all slots whose values differ from the snapshot.
    ///
    /// Also updates the snapshot for all provided slots.
    ///
    /// # Important
    /// Slots not present in the snapshot (first observation) are NOT reported
    /// as diffs — they are simply initialised in the snapshot. This prevents
    /// false-positives on startup.
    pub fn diff_and_update(
        &mut self,
        reads: &[(String, String, String)], // (contract_address, slot_key, new_value)
    ) -> Vec<SlotDiff> {
        let mut diffs = Vec::new();

        for (contract_address, slot_key, new_value) in reads {
            let key = SlotKey {
                contract_address: contract_address.clone(),
                slot_key: slot_key.clone(),
            };

            match self.data.get(&key) {
                None => {
                    // First observation — seed the snapshot, no diff
                    debug!(
                        "Seeding snapshot: contract={} slot={} value={}",
                        &contract_address[..10],
                        &slot_key[..10],
                        &new_value[..10]
                    );
                    self.data.insert(key, new_value.clone());
                }
                Some(old_value) => {
                    if old_value != new_value {
                        debug!(
                            "DIFF DETECTED: contract={} slot={} old={} new={}",
                            contract_address, slot_key, old_value, new_value
                        );
                        diffs.push(SlotDiff {
                            contract_address: contract_address.clone(),
                            slot_key: slot_key.clone(),
                            old_value: old_value.clone(),
                            new_value: new_value.clone(),
                        });
                        self.total_diffs_detected += 1;
                        // Update snapshot to the new value
                        self.data.insert(key, new_value.clone());
                    }
                }
            }
        }

        if !diffs.is_empty() {
            info!(
                "Block diff: {} slot changes detected across {} contracts",
                diffs.len(),
                diffs.iter().map(|d| &d.contract_address).collect::<std::collections::HashSet<_>>().len()
            );
        }

        diffs
    }

    /// Total number of (contract, slot) entries in the snapshot.
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// All current snapshot entries as an iterator for DB persistence.
    pub fn entries(&self) -> impl Iterator<Item = (&SlotKey, &String)> {
        self.data.iter()
    }
}
