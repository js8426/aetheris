// Aetheris\aetheris-agent-v\src\lib.rs
//
// Library entry point — exposes all modules for integration tests.
// The binary (main.rs) uses `mod` declarations directly;
// tests reach the same code via `aetheris_agent_v::...`.

pub mod alerts;
pub mod config;
pub mod db;
pub mod detector;
pub mod monitor;
pub mod responder;
pub mod rpc;
