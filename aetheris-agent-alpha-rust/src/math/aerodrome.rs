/// Aetheris\aetheris-agent-alpha-rust\src\math\aerodrome.rs
///
/// Local Aerodrome volatile-pool math (constant product x*y=k, same as UniV2).
/// Stable pool (stableswap) formula is also included for completeness but the
/// volatile formula is what matters for USDC/WETH and WETH/cbBTC arb.
///
/// Aerodrome volatile fee: 30 bps (3000 ppm) for most pairs.

/// Compute amountOut for a volatile (x*y=k) Aerodrome pool.
///
/// # Parameters
/// - `reserve_in`:  pool reserves of the token we are selling (raw units)
/// - `reserve_out`: pool reserves of the token we are buying
/// - `amount_in`:   raw units of tokenIn (before fee)
/// - `fee_ppm`:     pool fee in parts-per-million (typically 3000 for 0.3%)
#[inline]
pub fn volatile_amount_out(
    reserve_in: f64,
    reserve_out: f64,
    amount_in: f64,
    fee_ppm: u32,
) -> f64 {
    if reserve_in == 0.0 || reserve_out == 0.0 || amount_in == 0.0 {
        return 0.0;
    }
    let amount_in_adj = amount_in * (1_000_000.0 - fee_ppm as f64) / 1_000_000.0;
    // Uniswap V2 formula: out = amountIn_adj * reserveOut / (reserveIn + amountIn_adj)
    amount_in_adj * reserve_out / (reserve_in + amount_in_adj)
}

/// Compute amountOut for an Aerodrome **stable** pool.
/// Uses the Solidly invariant: x^3*y + y^3*x = k
///
/// This Newton's-method based solver follows the Solidly/Velodrome reference.
/// For stable pools, fee is typically 5 bps (500 ppm).
#[allow(clippy::many_single_char_names)]
pub fn stable_amount_out(
    reserve_in: f64,
    reserve_out: f64,
    amount_in: f64,
    fee_ppm: u32,
    decimals_in: u32,
    decimals_out: u32,
) -> f64 {
    if reserve_in == 0.0 || reserve_out == 0.0 {
        return 0.0;
    }
    let amount_in_adj = amount_in * (1_000_000.0 - fee_ppm as f64) / 1_000_000.0;

    // Normalise to 1e18 scale for the invariant
    let scale_in  = 10f64.powi(18 - decimals_in  as i32);
    let scale_out = 10f64.powi(18 - decimals_out as i32);

    let x = reserve_in  * scale_in;
    let y = reserve_out * scale_out;
    let dx = amount_in_adj * scale_in;

    // Solidly invariant: f(x,y) = x^3*y + x*y^3
    let k = x * x * x * y + x * y * y * y;

    // Solve for y_new: f(x + dx, y_new) = k using Newton's method
    let mut y_new = y;
    for _ in 0..255 {
        let f  = (x + dx).powi(3) * y_new + (x + dx) * y_new.powi(3) - k;
        let df = (x + dx).powi(3) + 3.0 * (x + dx) * y_new.powi(2);
        if df == 0.0 { break; }
        let step = f / df;
        let y_next = y_new - step;
        if (y_next - y_new).abs() < 1.0 { break; }
        y_new = y_next.max(0.0);
    }

    let dy = y - y_new; // token_out amount (normalised)
    dy / scale_out      // de-normalise
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_volatile_basic() {
        // 1000 USDC in, reserves 100_000 USDC / 33 WETH, fee 0.3%
        let out = volatile_amount_out(100_000e6, 33e18, 1_000e6, 3000);
        // Expected: ~0.3267 WETH (roughly 0.33 * 0.997)
        let out_human = out / 1e18;
        assert!((0.30..0.35).contains(&out_human), "got {out_human}");
    }

    #[test]
    fn test_empty_pool() {
        assert_eq!(volatile_amount_out(0.0, 1e18, 1000.0, 3000), 0.0);
    }
}
