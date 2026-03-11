// Aetheris\aetheris-agent-v\tests\test_multicall_utils.rs
//
// Tests for rpc::multicall utility functions:
//   normalise_slot_value    — pads/lowercases bytes32 hex
//   is_zero_value           — detects all-zero slots
//   extract_address_from_slot — pulls the rightmost 20 bytes as an address
//
// These are pure functions with no network dependency — fast and deterministic.
//
// Run: cargo test --test test_multicall_utils

use aetheris_agent_v::rpc::multicall::{
    extract_address_from_slot, is_zero_value, normalise_slot_value,
};

// ─── normalise_slot_value ─────────────────────────────────────────────────────

#[test]
fn normalise_adds_0x_prefix() {
    let result = normalise_slot_value("0000000000000000000000000000000000000000000000000000000000000001");
    assert!(result.starts_with("0x"));
}

#[test]
fn normalise_strips_existing_0x_and_lowercases() {
    let result = normalise_slot_value("0xABCDEF");
    assert_eq!(result, "0x0000000000000000000000000000000000000000000000000000000000abcdef");
}

#[test]
fn normalise_pads_short_value_to_64_hex_chars() {
    let result = normalise_slot_value("0x1");
    // Should be 0x + 64 hex chars
    let hex_part = result.strip_prefix("0x").unwrap();
    assert_eq!(hex_part.len(), 64);
    assert!(hex_part.ends_with('1'));
    assert!(hex_part.starts_with("000000000000000000000000000000000000000000000000000000000000000"));
}

#[test]
fn normalise_full_length_value_unchanged_after_lowercase() {
    let input = "0xaabbccdd00000000000000000000000000000000000000000000000000001234";
    let result = normalise_slot_value(input);
    assert_eq!(result, input);
}

#[test]
fn normalise_uppercase_input_is_lowercased() {
    let result = normalise_slot_value("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
    assert_eq!(
        result,
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );
}

#[test]
fn normalise_empty_input_produces_zero_bytes32() {
    let result = normalise_slot_value("0x");
    assert_eq!(
        result,
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
}

// ─── is_zero_value ────────────────────────────────────────────────────────────

#[test]
fn all_zeros_is_zero_value() {
    assert!(is_zero_value(
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    ));
}

#[test]
fn zero_without_prefix_is_zero_value() {
    assert!(is_zero_value(
        "0000000000000000000000000000000000000000000000000000000000000000"
    ));
}

#[test]
fn short_zero_is_zero_value() {
    assert!(is_zero_value("0x0"));
    assert!(is_zero_value("0x00"));
    assert!(is_zero_value("0x"));
}

#[test]
fn non_zero_value_is_not_zero() {
    assert!(!is_zero_value(
        "0x0000000000000000000000001234567890abcdef1234567890abcdef12345678"
    ));
    assert!(!is_zero_value("0x1"));
    assert!(!is_zero_value("0xff"));
}

#[test]
fn value_with_only_trailing_nonzero_byte_is_not_zero() {
    // Common for small integers stored in slots
    assert!(!is_zero_value(
        "0x0000000000000000000000000000000000000000000000000000000000000001"
    ));
}

// ─── extract_address_from_slot ────────────────────────────────────────────────

#[test]
fn extract_address_from_standard_ownable_slot() {
    // Typical: address stored left-padded to 32 bytes
    let slot = "0x000000000000000000000000742d35Cc6634C0532925a3b844Bc454e4438f44e";
    let addr = extract_address_from_slot(slot);
    assert_eq!(addr.to_lowercase(), "0x742d35cc6634c0532925a3b844bc454e4438f44e");
}

#[test]
fn extract_address_always_starts_with_0x() {
    let slot = "0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let addr = extract_address_from_slot(slot);
    assert!(addr.starts_with("0x"));
}

#[test]
fn extract_address_is_40_hex_chars_after_0x() {
    let slot = "0x000000000000000000000000742d35Cc6634C0532925a3b844Bc454e4438f44e";
    let addr = extract_address_from_slot(slot);
    let hex = addr.strip_prefix("0x").unwrap();
    assert_eq!(hex.len(), 40, "Address should be 20 bytes = 40 hex chars");
}

#[test]
fn extract_address_from_zero_slot_gives_zero_address() {
    let slot = "0x0000000000000000000000000000000000000000000000000000000000000000";
    let addr = extract_address_from_slot(slot);
    assert_eq!(addr, "0x0000000000000000000000000000000000000000");
}

#[test]
fn extract_address_ignores_upper_12_bytes() {
    // The upper 12 bytes (padding) should be stripped
    let slot = "0xdeadbeefcafebabe000000001234567890abcdef1234567890abcdef12345678";
    let addr = extract_address_from_slot(slot);
    // Only the last 20 bytes matter
    assert_eq!(addr, "0x1234567890abcdef1234567890abcdef12345678");
}

#[test]
fn extract_address_from_eip1967_style_slot() {
    // Simulates a real proxy implementation slot value
    let impl_slot = "0x0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3";
    let addr = extract_address_from_slot(impl_slot);
    assert_eq!(addr, "0x5fbdb2315678afecb367f032d93f642f64180aa3");
}
