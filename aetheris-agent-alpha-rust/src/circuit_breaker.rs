/// Aetheris\aetheris-agent-alpha-rust\src\circuit_breaker.rs
///
/// Circuit breaker (Phase 1, carried into Rust).
/// Trips after CIRCUIT_BREAKER_THRESHOLD consecutive failures and pauses
/// all trading for CIRCUIT_BREAKER_PAUSE_S seconds.

use std::time::{Duration, Instant};
use tracing::warn;
use crate::config::*;

pub struct CircuitBreaker {
    threshold:  u32,
    pause_s:    u64,
    tripped_at: Option<Instant>,
}

impl CircuitBreaker {
    pub fn new() -> Self {
        Self {
            threshold:  CIRCUIT_BREAKER_THRESHOLD,
            pause_s:    CIRCUIT_BREAKER_PAUSE_S,
            tripped_at: None,
        }
    }

    /// Returns true if trading is currently paused.
    pub fn is_open(&mut self) -> bool {
        if let Some(tripped) = self.tripped_at {
            if tripped.elapsed() >= Duration::from_secs(self.pause_s) {
                tracing::info!("[CIRCUIT] Pause elapsed — resuming");
                self.tripped_at = None;
                return false;
            }
            let remaining = self.pause_s - tripped.elapsed().as_secs();
            tracing::info!("[CIRCUIT] Breaker open — {remaining}s remaining");
            return true;
        }
        false
    }

    /// Check failure count. Returns true if breaker was just tripped.
    pub fn check_and_trip(&mut self, consecutive_failures: u32) -> bool {
        if consecutive_failures >= self.threshold && self.tripped_at.is_none() {
            self.tripped_at = Some(Instant::now());
            warn!(
                "[CIRCUIT] Tripped after {consecutive_failures} consecutive failures. Pausing {}s.",
                self.pause_s
            );
            return true;
        }
        false
    }

    /// Legacy check method (does not return trip status).
    pub fn check(&mut self, consecutive_failures: u32) {
        self.check_and_trip(consecutive_failures);
    }
}
