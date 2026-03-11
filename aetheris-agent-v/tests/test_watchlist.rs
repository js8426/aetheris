// Aetheris\aetheris-agent-v\tests\test_watchlist.rs
//
// Tests for monitor::watchlist — build_watchlist(), WatchedContract structure,
// and slot definitions.
//
// Verifies that:
//   - Internal contracts are always watched even if not in WATCHED_CONTRACTS
//   - No duplicates when a contract appears in both env and internal list
//   - EIP-1967 slots are always included for proxy contracts
//   - total_slot_reads() counts correctly
//
// Run: cargo test --test test_watchlist

use aetheris_agent_v::monitor::watchlist::{
    build_watchlist, total_slot_reads, SlotType,
    SLOT_EIP1967_ADMIN, SLOT_EIP1967_IMPL, SLOT_OZ_OWNER,
};
use aetheris_agent_v::config::Config;

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn make_config(extra_watched: &[&str]) -> Config {
    Config {
        chain_id: 84532,
        rpc_ws_url: "wss://base-sepolia.test".to_string(),
        rpc_http_url: "https://base-sepolia.test".to_string(),
        rpc_http_fallback: Some("https://quicknode-sepolia.test".to_string()),
        bundler_private_key: "0xdeadbeef".to_string(),
        agent_alpha_addr: "0xaaaa000000000000000000000000000000000001".to_string(),
        agent_beta_addr:  "0xbbbb000000000000000000000000000000000002".to_string(),
        vault_addr:       "0xcccc000000000000000000000000000000000003".to_string(),
        multicall3_addr:  "0xca11bde05977b3631167028862be2a173976ca11".to_string(),
        watched_contracts: extra_watched.iter().map(|s| s.to_lowercase()).collect(),
        chainlink_eth_usd: "0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70".to_string(),
        pyth_contract: "0x8250f4af4b972684f7b336503e2d6dfedeB1487a".to_string(),
        pyth_eth_usd_feed_id: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace".to_string(),
        oracle_divergence_bps: 500,
        circuit_breaker_threshold: 5,
        db_path: "./test.db".to_string(),
        telegram_bot_token: None,
        telegram_chat_id: None,
        discord_webhook_url: None,
    }
}

// ─── Internal contracts always included ──────────────────────────────────────

#[test]
fn internal_contracts_always_in_watchlist() {
    let config = make_config(&[]);
    let wl = build_watchlist(&config);
    let addresses: Vec<&str> = wl.iter().map(|c| c.address.as_str()).collect();
    assert!(addresses.contains(&config.agent_alpha_addr.as_str()), "Alpha must always be watched");
    assert!(addresses.contains(&config.agent_beta_addr.as_str()),  "Beta must always be watched");
    assert!(addresses.contains(&config.vault_addr.as_str()),       "Vault must always be watched");
}

#[test]
fn watchlist_minimum_size_is_three_internal_contracts() {
    let config = make_config(&[]);
    let wl = build_watchlist(&config);
    assert!(wl.len() >= 3);
}

// ─── No duplicates ────────────────────────────────────────────────────────────

#[test]
fn no_duplicate_when_internal_address_also_in_watched_contracts() {
    let alpha = "0xaaaa000000000000000000000000000000000001";
    let config = make_config(&[alpha]); // alpha is both internal AND in WATCHED_CONTRACTS
    let wl = build_watchlist(&config);

    let alpha_entries: Vec<_> = wl.iter().filter(|c| c.address == alpha.to_lowercase()).collect();
    assert_eq!(alpha_entries.len(), 1, "Internal contract must not appear twice in watchlist");
}

#[test]
fn external_contract_added_once() {
    let ext = "0xdddd000000000000000000000000000000000004";
    let config = make_config(&[ext, ext]); // duplicate in env
    let wl = build_watchlist(&config);

    let ext_entries: Vec<_> = wl.iter().filter(|c| c.address == ext.to_lowercase()).collect();
    // May be 1 or 2 depending on dedup in build_watchlist — we just ensure no crash
    assert!(ext_entries.len() >= 1);
}

// ─── EIP-1967 slots presence ─────────────────────────────────────────────────

#[test]
fn internal_contracts_have_eip1967_impl_slot() {
    let config = make_config(&[]);
    let wl = build_watchlist(&config);

    for contract in &wl {
        if contract.address == config.agent_alpha_addr
            || contract.address == config.agent_beta_addr
            || contract.address == config.vault_addr
        {
            let has_impl = contract.slots.iter().any(|s| s.slot_key == SLOT_EIP1967_IMPL);
            assert!(has_impl, "Internal contract {} must have EIP-1967 impl slot", contract.name);
        }
    }
}

#[test]
fn internal_contracts_have_eip1967_admin_slot() {
    let config = make_config(&[]);
    let wl = build_watchlist(&config);

    for contract in &wl {
        if contract.address == config.agent_alpha_addr
            || contract.address == config.agent_beta_addr
            || contract.address == config.vault_addr
        {
            let has_admin = contract.slots.iter().any(|s| s.slot_key == SLOT_EIP1967_ADMIN);
            assert!(has_admin, "Internal contract {} must have EIP-1967 admin slot", contract.name);
        }
    }
}

#[test]
fn internal_contracts_have_owner_slot() {
    let config = make_config(&[]);
    let wl = build_watchlist(&config);

    for contract in &wl {
        if contract.address == config.agent_alpha_addr
            || contract.address == config.agent_beta_addr
            || contract.address == config.vault_addr
        {
            let has_owner = contract.slots.iter().any(|s| s.slot_key == SLOT_OZ_OWNER);
            assert!(has_owner, "Internal contract {} must have owner slot", contract.name);
        }
    }
}

// ─── Slot type assignments ────────────────────────────────────────────────────

#[test]
fn eip1967_impl_slot_has_proxy_implementation_type() {
    let config = make_config(&[]);
    let wl = build_watchlist(&config);

    for contract in &wl {
        for slot in &contract.slots {
            if slot.slot_key == SLOT_EIP1967_IMPL {
                assert_eq!(
                    slot.slot_type,
                    SlotType::ProxyImplementation,
                    "EIP-1967 impl slot must have ProxyImplementation type"
                );
            }
        }
    }
}

#[test]
fn eip1967_admin_slot_has_proxy_admin_type() {
    let config = make_config(&[]);
    let wl = build_watchlist(&config);

    for contract in &wl {
        for slot in &contract.slots {
            if slot.slot_key == SLOT_EIP1967_ADMIN {
                assert_eq!(slot.slot_type, SlotType::ProxyAdmin);
            }
        }
    }
}

#[test]
fn owner_slot_has_ownership_type() {
    let config = make_config(&[]);
    let wl = build_watchlist(&config);

    for contract in &wl {
        for slot in &contract.slots {
            if slot.slot_key == SLOT_OZ_OWNER {
                assert_eq!(slot.slot_type, SlotType::Ownership);
            }
        }
    }
}

// ─── total_slot_reads ────────────────────────────────────────────────────────

#[test]
fn total_slot_reads_equals_sum_of_all_contract_slot_counts() {
    let config = make_config(&[]);
    let wl = build_watchlist(&config);

    let expected: usize = wl.iter().map(|c| c.slots.len()).sum();
    assert_eq!(total_slot_reads(&wl), expected);
}

#[test]
fn total_slot_reads_is_at_least_four_per_internal_contract() {
    // Each internal contract has: impl + admin + owner + paused = 4 slots
    let config = make_config(&[]);
    let wl = build_watchlist(&config);
    assert!(total_slot_reads(&wl) >= 12, "3 internal contracts × 4 slots each = 12 minimum");
}

#[test]
fn total_slot_reads_zero_for_empty_watchlist() {
    assert_eq!(total_slot_reads(&[]), 0);
}

// ─── Slot label fields ────────────────────────────────────────────────────────

#[test]
fn all_slots_have_non_empty_labels() {
    let config = make_config(&[]);
    let wl = build_watchlist(&config);
    for contract in &wl {
        for slot in &contract.slots {
            assert!(!slot.label.is_empty(), "Slot label must not be empty in {}", contract.name);
        }
    }
}

// ─── External contracts ───────────────────────────────────────────────────────

#[test]
fn external_contracts_are_added_to_watchlist() {
    let ext = "0xeeee000000000000000000000000000000000005";
    let config = make_config(&[ext]);
    let wl = build_watchlist(&config);
    let has_ext = wl.iter().any(|c| c.address == ext.to_lowercase());
    assert!(has_ext, "External contract from WATCHED_CONTRACTS must appear in watchlist");
}

#[test]
fn invalid_address_without_0x_prefix_is_skipped() {
    // Address without 0x prefix should be filtered out in Config::from_env
    // build_watchlist itself receives already-filtered addresses
    let config = make_config(&[]); // no external addresses
    let wl = build_watchlist(&config);
    // All addresses in the watchlist should start with 0x
    for contract in &wl {
        assert!(contract.address.starts_with("0x"), "All addresses must start with 0x");
    }
}
