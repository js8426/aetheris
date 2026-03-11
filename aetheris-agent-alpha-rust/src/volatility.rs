/// Aetheris\aetheris-agent-alpha-rust\src\volatility.rs
///
/// Rolling volatility tracker (Phase 2 U5).
/// Maintains a deque of recent price samples and computes rolling std-dev.
/// Mode: AGGRESSIVE / NORMAL / CONSERVATION drives scan behaviour.

use std::collections::VecDeque;
use crate::config::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VolMode {
    Aggressive,
    Normal,
    Conservation,
}

impl VolMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            VolMode::Aggressive   => "AGGRESSIVE",
            VolMode::Normal       => "NORMAL",
            VolMode::Conservation => "CONSERVATION",
        }
    }
}

pub struct VolatilityTracker {
    window:  usize,
    high:    f64,
    low:     f64,
    samples: VecDeque<f64>,
    pub mode: VolMode,
    pub value: f64,
}

impl VolatilityTracker {
    pub fn new() -> Self {
        Self {
            window:  VOLATILITY_WINDOW,
            high:    VOLATILITY_HIGH,
            low:     VOLATILITY_LOW,
            samples: VecDeque::with_capacity(VOLATILITY_WINDOW + 1),
            mode:    VolMode::Normal,
            value:   0.0,
        }
    }

    /// Add a new price sample (e.g. ETH price in USDC).
    pub fn update(&mut self, price: f64) {
        if self.samples.len() >= self.window {
            self.samples.pop_front();
        }
        self.samples.push_back(price);

        if self.samples.len() < 2 {
            return;
        }

        // Compute rolling std-dev of pct moves
        let moves: Vec<f64> = self.samples
            .iter()
            .zip(self.samples.iter().skip(1))
            .map(|(a, b)| (b - a).abs() / a)
            .collect();

        let mean = moves.iter().sum::<f64>() / moves.len() as f64;
        let var  = moves.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / moves.len() as f64;
        self.value = var.sqrt();

        self.mode = if self.value >= self.high {
            VolMode::Aggressive
        } else if self.value <= self.low {
            VolMode::Conservation
        } else {
            VolMode::Normal
        };
    }

    /// Returns the effective minimum profit threshold adjusted for volatility mode.
    /// In AGGRESSIVE mode we accept smaller profits; in CONSERVATION we demand more.
    pub fn adjusted_min_profit(&self, base_min: f64) -> f64 {
        match self.mode {
            VolMode::Aggressive   => base_min * 0.7,
            VolMode::Normal       => base_min,
            VolMode::Conservation => base_min * 1.5,
        }
    }
}
