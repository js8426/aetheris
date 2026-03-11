// Aetheris\aetheris-agent-v\src\monitor\watchlist.rs

/// monitor/watchlist.rs — Watchlist definition
///
/// For each watched contract, specifies:
///   - Which EIP-1967 slots to check (proxy contracts only)
///   - Which ownership slots to check
///   - Which additional state slots to snapshot
///   - The contract's classification (Proxy, Ownable, Oracle, etc.)
///
/// The watchlist is built from Config at startup and handed to the monitor
/// loop. The multicall module reads all slots in a single Multicall3 call.

use crate::config::Config;

/// EIP-1967 implementation slot.
/// keccak256("eip1967.proxy.implementation") - 1
pub const SLOT_EIP1967_IMPL: &str =
    "0x360894a13ba1a3210667c828492db98dca3e2076883f8ad8be6ea30d4b3741f3";

/// EIP-1967 admin slot.
/// keccak256("eip1967.proxy.admin") - 1
pub const SLOT_EIP1967_ADMIN: &str =
    "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

/// OpenZeppelin Ownable v4: owner stored at slot 0
pub const SLOT_OZ_OWNER: &str =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

/// Common "paused" boolean — slot 0 for simple contracts, varies for complex ones
pub const SLOT_PAUSED: &str =
    "0x0000000000000000000000000000000000000000000000000000000000000001";

/// Classification of a watched contract — determines which slots to monitor
/// and how to interpret changes.
#[derive(Debug, Clone, PartialEq)]
pub enum ContractClass {
    /// UUPS or Transparent proxy with EIP-1967 slots
    Proxy,
    /// Ownable contract (has owner() at slot 0 or similar)
    Ownable,
    /// Price oracle (Chainlink aggregator or Pyth)
    Oracle,
    /// Aetheris-internal contract (our own — extra scrutiny)
    Internal,
}

/// A single watched slot on a watched contract.
#[derive(Debug, Clone)]
pub struct WatchedSlot {
    /// Storage slot key (hex bytes32)
    pub slot_key: String,
    /// Human-readable label for logs and alerts
    pub label: String,
    /// How to classify a change on this slot (passed to detector)
    pub slot_type: SlotType,
}

/// Determines which detector classifier is invoked for a slot change.
#[derive(Debug, Clone, PartialEq)]
pub enum SlotType {
    ProxyImplementation,
    ProxyAdmin,
    Ownership,
    HiddenFunction,
    GeneralState,
}

/// A single contract entry in the watchlist.
#[derive(Debug, Clone)]
pub struct WatchedContract {
    /// Address (lowercase hex with 0x prefix)
    pub address: String,
    /// Human-readable name for alerts
    pub name: String,
    /// Contract classification
    pub class: ContractClass,
    /// Slots to monitor. All are read every block via Multicall3.
    pub slots: Vec<WatchedSlot>,
}

impl WatchedContract {
    /// Construct a proxy contract watch entry (monitors impl + admin slots).
    fn proxy(address: String, name: &str) -> Self {
        Self {
            address,
            name: name.to_string(),
            class: ContractClass::Proxy,
            slots: vec![
                WatchedSlot {
                    slot_key: SLOT_EIP1967_IMPL.to_string(),
                    label: "EIP-1967 Implementation".to_string(),
                    slot_type: SlotType::ProxyImplementation,
                },
                WatchedSlot {
                    slot_key: SLOT_EIP1967_ADMIN.to_string(),
                    label: "EIP-1967 Admin".to_string(),
                    slot_type: SlotType::ProxyAdmin,
                },
            ],
        }
    }

    /// Construct an ownable contract watch entry (monitors owner slot).
    fn ownable(address: String, name: &str) -> Self {
        Self {
            address,
            name: name.to_string(),
            class: ContractClass::Ownable,
            slots: vec![WatchedSlot {
                slot_key: SLOT_OZ_OWNER.to_string(),
                label: "Owner (slot 0)".to_string(),
                slot_type: SlotType::Ownership,
            }],
        }
    }

    /// Construct an internal Aetheris contract entry.
    /// Monitors proxy slots + owner + paused flag.
    fn internal(address: String, name: &str) -> Self {
        Self {
            address,
            name: name.to_string(),
            class: ContractClass::Internal,
            slots: vec![
                WatchedSlot {
                    slot_key: SLOT_EIP1967_IMPL.to_string(),
                    label: "EIP-1967 Implementation".to_string(),
                    slot_type: SlotType::ProxyImplementation,
                },
                WatchedSlot {
                    slot_key: SLOT_EIP1967_ADMIN.to_string(),
                    label: "EIP-1967 Admin".to_string(),
                    slot_type: SlotType::ProxyAdmin,
                },
                WatchedSlot {
                    slot_key: SLOT_OZ_OWNER.to_string(),
                    label: "Owner (slot 0)".to_string(),
                    slot_type: SlotType::Ownership,
                },
                WatchedSlot {
                    slot_key: SLOT_PAUSED.to_string(),
                    label: "Paused flag (slot 1)".to_string(),
                    slot_type: SlotType::HiddenFunction,
                },
            ],
        }
    }
}

/// Build the full watchlist from Config.
///
/// Returns the list of WatchedContract entries. This is called once at
/// startup. If a WATCHED_CONTRACTS address is not recognized, it gets a
/// default proxy+ownable watch profile (monitors impl, admin, and owner).
pub fn build_watchlist(config: &Config) -> Vec<WatchedContract> {
    let mut list: Vec<WatchedContract> = Vec::new();

    // Always include our own contracts with full internal monitoring
    list.push(WatchedContract::internal(
        config.agent_alpha_addr.clone(),
        "AgentAlpha",
    ));
    list.push(WatchedContract::internal(
        config.agent_beta_addr.clone(),
        "AgentBeta",
    ));
    list.push(WatchedContract::internal(
        config.vault_addr.clone(),
        "AetherisVault",
    ));

    // Add externally configured watched contracts with proxy+ownable profile
    for addr in &config.watched_contracts {
        // Skip if already added above
        if addr == &config.agent_alpha_addr
            || addr == &config.agent_beta_addr
            || addr == &config.vault_addr
        {
            continue;
        }

        // Default: treat as proxy+ownable (catches most external contracts)
        let mut entry = WatchedContract {
            address: addr.clone(),
            name: format!("External:{}", &addr[..10]),
            class: ContractClass::Proxy,
            slots: vec![
                WatchedSlot {
                    slot_key: SLOT_EIP1967_IMPL.to_string(),
                    label: "EIP-1967 Implementation".to_string(),
                    slot_type: SlotType::ProxyImplementation,
                },
                WatchedSlot {
                    slot_key: SLOT_EIP1967_ADMIN.to_string(),
                    label: "EIP-1967 Admin".to_string(),
                    slot_type: SlotType::ProxyAdmin,
                },
                WatchedSlot {
                    slot_key: SLOT_OZ_OWNER.to_string(),
                    label: "Owner (slot 0)".to_string(),
                    slot_type: SlotType::Ownership,
                },
            ],
        };

        // Known contracts get named properly
        entry.name = name_for_known_address(addr).unwrap_or(entry.name);
        list.push(entry);
    }

    list
}

/// Returns a human-readable name for well-known Base mainnet addresses.
/// Returns None for unknown addresses.
fn name_for_known_address(addr: &str) -> Option<String> {
    match addr {
        // Aave V3 Pool on Base
        "0xa238dd80c259a72e81d7e4664a9801593f98d1c5" => Some("Aave V3 Pool".to_string()),
        // Uniswap V3 Router on Base
        "0x2626664c2603336e57b271c5c0b26f421741e481" => Some("Uniswap V3 Router".to_string()),
        // Aerodrome Router on Base
        "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43" => Some("Aerodrome Router".to_string()),
        _ => None,
    }
}

/// Returns the total number of (contract, slot) pairs that will be read
/// every block. Used for logging and Multicall3 batch planning.
pub fn total_slot_reads(watchlist: &[WatchedContract]) -> usize {
    watchlist.iter().map(|c| c.slots.len()).sum()
}
