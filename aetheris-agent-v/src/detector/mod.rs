// Aetheris\aetheris-agent-v\src\detector\mod.rs

/// detector/mod.rs — Threat classifier
///
/// Takes raw observations from the monitor modules (slot changes, oracle
/// divergences) and assigns a ThreatLevel based on what changed and where.
///
/// Classification rules:
///   ProxyImplementationSwap → always Critical (this IS a rug pull)
///   ProxyAdminChange        → High (precursor to implementation swap)
///   OwnershipTransfer       → High (loss of expected control)
///   HiddenFunctionActivation→ Medium (unusual state, not yet exploited)
///   OracleManipulation      → Medium or High depending on divergence
///   UnexpectedStateChange   → Low to Medium depending on contract class

pub mod threat;
pub use threat::{ThreatLevel, ThreatReport, ThreatType};

/// Classify a proxy implementation slot change.
/// Any change here is Critical — there is no legitimate reason for an
/// external actor to swap a proxy implementation between blocks.
pub fn classify_proxy_swap(
    block_number: u64,
    timestamp: i64,
    contract_address: &str,
    slot_key: &str,
    old_value: &str,
    new_value: &str,
) -> ThreatReport {
    ThreatReport::slot_change(
        block_number,
        timestamp,
        contract_address.to_string(),
        ThreatLevel::Critical,
        ThreatType::ProxyImplementationSwap,
        slot_key.to_string(),
        old_value.to_string(),
        new_value.to_string(),
        format!(
            "PROXY IMPLEMENTATION SWAPPED on {}. Old impl: {} → New impl: {}. \
             This is the primary rug-pull vector. Emergency response triggered.",
            contract_address, old_value, new_value
        ),
    )
}

/// Classify a proxy admin slot change.
/// High severity — admin can swap the implementation, so an unexpected admin
/// change is a direct precursor to a Critical event.
pub fn classify_proxy_admin_change(
    block_number: u64,
    timestamp: i64,
    contract_address: &str,
    slot_key: &str,
    old_value: &str,
    new_value: &str,
) -> ThreatReport {
    ThreatReport::slot_change(
        block_number,
        timestamp,
        contract_address.to_string(),
        ThreatLevel::High,
        ThreatType::ProxyAdminChange,
        slot_key.to_string(),
        old_value.to_string(),
        new_value.to_string(),
        format!(
            "Proxy admin changed on {}. Old admin: {} → New admin: {}. \
             New admin can swap implementation. Monitoring closely.",
            contract_address, old_value, new_value
        ),
    )
}

/// Classify an ownership transfer.
/// High severity — unexpected ownership enables privilege escalation.
pub fn classify_ownership_transfer(
    block_number: u64,
    timestamp: i64,
    contract_address: &str,
    slot_key: &str,
    old_owner: &str,
    new_owner: &str,
) -> ThreatReport {
    ThreatReport::slot_change(
        block_number,
        timestamp,
        contract_address.to_string(),
        ThreatLevel::High,
        ThreatType::OwnershipTransfer,
        slot_key.to_string(),
        old_owner.to_string(),
        new_owner.to_string(),
        format!(
            "Ownership transferred on {}. Old owner: {} → New owner: {}. \
             Unexpected transfer to unknown address.",
            contract_address, old_owner, new_owner
        ),
    )
}

/// Classify a hidden function activation (pause/freeze/drain flag).
/// Medium severity — indicates preparation for an attack, not the attack itself.
pub fn classify_hidden_function(
    block_number: u64,
    timestamp: i64,
    contract_address: &str,
    slot_key: &str,
    old_value: &str,
    new_value: &str,
) -> ThreatReport {
    ThreatReport::slot_change(
        block_number,
        timestamp,
        contract_address.to_string(),
        ThreatLevel::Medium,
        ThreatType::HiddenFunctionActivation,
        slot_key.to_string(),
        old_value.to_string(),
        new_value.to_string(),
        format!(
            "Hidden function state change on {}. Slot {} changed: {} → {}. \
             Possible activation of dormant admin capability.",
            contract_address, slot_key, old_value, new_value
        ),
    )
}

/// Classify oracle price divergence between Chainlink and Pyth.
/// Returns High if divergence > 2x threshold, Medium otherwise.
pub fn classify_oracle_divergence(
    block_number: u64,
    timestamp: i64,
    contract_address: &str,
    chainlink_price: u128,
    pyth_price: u128,
    divergence_bps: u64,
    threshold_bps: u64,
) -> ThreatReport {
    // Double the threshold → escalate to High (likely active manipulation)
    let level = if divergence_bps > threshold_bps * 2 {
        ThreatLevel::High
    } else {
        ThreatLevel::Medium
    };

    ThreatReport::oracle(
        block_number,
        timestamp,
        contract_address.to_string(),
        level,
        format!(
            "Oracle divergence: Chainlink={} Pyth={} divergence={}bps (threshold={}bps). \
             Possible flash loan price manipulation in progress.",
            chainlink_price, pyth_price, divergence_bps, threshold_bps
        ),
    )
}

/// Classify a general unexpected state change (catch-all).
/// Low-Medium depending on context. Used for watched slots that don't
/// match any specific threat pattern but have changed unexpectedly.
pub fn classify_unexpected_change(
    block_number: u64,
    timestamp: i64,
    contract_address: &str,
    slot_key: &str,
    old_value: &str,
    new_value: &str,
) -> ThreatReport {
    ThreatReport::slot_change(
        block_number,
        timestamp,
        contract_address.to_string(),
        ThreatLevel::Low,
        ThreatType::UnexpectedStateChange,
        slot_key.to_string(),
        old_value.to_string(),
        new_value.to_string(),
        format!(
            "Unexpected storage change on {}. Slot {} changed: {} → {}.",
            contract_address, slot_key, old_value, new_value
        ),
    )
}
