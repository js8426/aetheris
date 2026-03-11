// Aetheris\aetheris-agent-v\src\detector\threat.rs

/// detector/threat.rs — Threat classification types
///
/// Defines the canonical ThreatLevel enum and ThreatReport struct used
/// throughout Agent V. Every detected anomaly produces a ThreatReport which
/// flows from the monitor → detector → responder pipeline.

use serde::{Deserialize, Serialize};

/// Severity classification for detected threats.
///
/// Maps directly to response behavior in responder/mod.rs:
/// - None    → no action
/// - Low     → log only
/// - Medium  → alert only
/// - High    → alert + increase monitoring frequency
/// - Critical → alert + execute all emergency responses immediately
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ThreatLevel {
    None,
    Low,
    Medium,
    High,
    Critical,
}

impl ThreatLevel {
    /// Human-readable label for use in alerts and DB records.
    pub fn label(&self) -> &'static str {
        match self {
            ThreatLevel::None => "None",
            ThreatLevel::Low => "Low",
            ThreatLevel::Medium => "Medium",
            ThreatLevel::High => "High",
            ThreatLevel::Critical => "Critical",
        }
    }

    /// Emoji prefix for Telegram/Discord alert messages.
    pub fn emoji(&self) -> &'static str {
        match self {
            ThreatLevel::None => "✅",
            ThreatLevel::Low => "🔵",
            ThreatLevel::Medium => "🟡",
            ThreatLevel::High => "🟠",
            ThreatLevel::Critical => "🚨",
        }
    }
}

impl std::fmt::Display for ThreatLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.label())
    }
}

/// The category of threat detected.
/// Used for routing response logic and grouping incidents in the DB.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThreatType {
    /// EIP-1967 proxy implementation slot changed — most critical rug vector
    ProxyImplementationSwap,
    /// EIP-1967 admin slot changed
    ProxyAdminChange,
    /// owner() or DEFAULT_ADMIN_ROLE transferred to unknown address
    OwnershipTransfer,
    /// Dormant admin function activated (pause, freeze, drain flag set)
    HiddenFunctionActivation,
    /// Chainlink vs Pyth price divergence exceeded threshold
    OracleManipulationPrecursor,
    /// General unexpected storage slot change
    UnexpectedStateChange,
}

impl ThreatType {
    /// Short string identifier for DB storage.
    pub fn as_str(&self) -> &'static str {
        match self {
            ThreatType::ProxyImplementationSwap => "ProxySwap",
            ThreatType::ProxyAdminChange => "ProxyAdminChange",
            ThreatType::OwnershipTransfer => "OwnershipTransfer",
            ThreatType::HiddenFunctionActivation => "HiddenFunctionActivation",
            ThreatType::OracleManipulationPrecursor => "OracleManipulationPrecursor",
            ThreatType::UnexpectedStateChange => "UnexpectedStateChange",
        }
    }
}

impl std::fmt::Display for ThreatType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Complete description of a detected threat.
/// Produced by the monitor modules and consumed by the detector classifier
/// and responder.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatReport {
    /// Block number in which the change was detected
    pub block_number: u64,
    /// Unix timestamp (seconds)
    pub timestamp: i64,
    /// The contract address where the anomaly was detected
    pub contract_address: String,
    /// Severity level determined by the detector
    pub threat_level: ThreatLevel,
    /// Category of threat
    pub threat_type: ThreatType,
    /// The storage slot key that changed (if applicable)
    pub slot_key: Option<String>,
    /// Previous value (hex), None if this is a new observation
    pub old_value: Option<String>,
    /// New value (hex) observed in this block
    pub new_value: Option<String>,
    /// Human-readable description for alert messages and logs
    pub description: String,
}

impl ThreatReport {
    /// Construct a new threat report for a storage slot change.
    pub fn slot_change(
        block_number: u64,
        timestamp: i64,
        contract_address: String,
        threat_level: ThreatLevel,
        threat_type: ThreatType,
        slot_key: String,
        old_value: String,
        new_value: String,
        description: String,
    ) -> Self {
        Self {
            block_number,
            timestamp,
            contract_address,
            threat_level,
            threat_type,
            slot_key: Some(slot_key),
            old_value: Some(old_value),
            new_value: Some(new_value),
            description,
        }
    }

    /// Construct a threat report that doesn't involve a specific slot (e.g. oracle divergence).
    pub fn oracle(
        block_number: u64,
        timestamp: i64,
        contract_address: String,
        threat_level: ThreatLevel,
        description: String,
    ) -> Self {
        Self {
            block_number,
            timestamp,
            contract_address,
            threat_level,
            threat_type: ThreatType::OracleManipulationPrecursor,
            slot_key: None,
            old_value: None,
            new_value: None,
            description,
        }
    }
}
