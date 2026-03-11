/// Aetheris\aetheris-agent-alpha-rust\src\rpc\multicall.rs
///
/// Fetches ALL pool states (Uniswap V3 slot0 + liquidity, Aerodrome reserves)
/// in a SINGLE RPC call using Multicall3. One RPC call per block instead of ~24.

use alloy::{
    primitives::{Address, Uint},
    providers::{ProviderBuilder, RootProvider},
    sol,
    sol_types::SolCall,
    transports::http::{Client, Http},
};
use anyhow::{Context, Result};
use tracing::warn;

/// Concrete HTTP provider type — avoids generic boxing issues in alloy 0.9
pub type HttpProvider = RootProvider<Http<Client>>;

/// Build an HTTP provider from a URL string
pub fn make_http_provider(url: &str) -> Result<HttpProvider> {
    Ok(ProviderBuilder::new()
        .on_http(url.parse().context("Invalid RPC URL")?))
}

/// Convert a u32 fee value to alloy's Uint<24,1>.
/// All valid fee tiers (100, 500, 3000, 10000) are well within 24-bit range.
#[inline]
pub fn fee_to_u24(fee: u32) -> Uint<24, 1> {
    Uint::<24, 1>::from_limbs([fee as u64])
}

// ─── ABI definitions ─────────────────────────────────────────────────────────

sol! {
    struct Call3 {
        address target;
        bool    allowFailure;
        bytes   callData;
    }
    struct McResult {
        bool  success;
        bytes returnData;
    }

    #[sol(rpc)]
    interface IMulticall3 {
        function aggregate3(Call3[] calldata calls)
            external payable
            returns (McResult[] memory returnData);
    }

    #[sol(rpc)]
    interface IUniV3Pool {
        function slot0() external view returns (
            uint160 sqrtPriceX96,
            int24   tick,
            uint16  observationIndex,
            uint16  observationCardinality,
            uint16  observationCardinalityNext,
            uint8   feeProtocol,
            bool    unlocked
        );
        function liquidity() external view returns (uint128 liquidity);
    }

    #[sol(rpc)]
    interface IUniV3Factory {
        function getPool(
            address tokenA,
            address tokenB,
            uint24  fee
        ) external view returns (address pool);
    }

    #[sol(rpc)]
    interface IAeroPool {
        function getReserves() external view returns (
            uint256 reserve0,
            uint256 reserve1,
            uint256 blockTimestampLast
        );
    }

    #[sol(rpc)]
    interface IAeroFactory {
        function getPool(
            address tokenA,
            address tokenB,
            bool    stable
        ) external view returns (address pool);
    }
}

// ─── Data structures ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default)]
pub struct UniV3PoolState {
    pub address:        Address,
    pub token0:         Address,
    pub token1:         Address,
    pub fee_ppm:        u32,
    pub sqrt_price_x96: f64,
    pub liquidity:      f64,
    pub tick:           i32,
    pub valid:          bool,
}

#[derive(Debug, Clone, Default)]
pub struct AeroPoolState {
    pub address:  Address,
    pub token0:   Address,
    pub token1:   Address,
    pub reserve0: f64,
    pub reserve1: f64,
    pub fee_ppm:  u32,
    pub stable:   bool,
    pub valid:    bool,
}

#[derive(Debug, Clone)]
pub struct PoolDescriptor {
    pub address: Address,
    pub token0:  Address,
    pub token1:  Address,
    pub fee_ppm: u32,
    pub is_aero: bool,
    pub stable:  bool,
}

// ─── Pool discovery (called once at startup) ──────────────────────────────────

pub async fn discover_uni_v3_pools(
    provider:  &HttpProvider,
    factory:   Address,
    pairs:     &[(Address, Address)],
    fee_tiers: &[u32],
) -> Vec<PoolDescriptor> {
    let mut descriptors = Vec::new();

    for &(ta, tb) in pairs {
        let (token0, token1) = if ta.lt(&tb) { (ta, tb) } else { (tb, ta) };

        for &fee in fee_tiers {
            let factory_contract = IUniV3Factory::new(factory, provider);
            match factory_contract
                .getPool(token0, token1, fee_to_u24(fee))
                .call()
                .await
            {
                Ok(ret) => {
                    if ret.pool == Address::ZERO {
                        continue;
                    }
                    descriptors.push(PoolDescriptor {
                        address: ret.pool,
                        token0,
                        token1,
                        fee_ppm: fee,
                        is_aero: false,
                        stable:  false,
                    });
                    tracing::debug!("V3 pool {}/{} fee={}: {}", token0, token1, fee, ret.pool);
                }
                Err(e) => {
                    warn!("V3 factory.getPool({token0},{token1},{fee}) failed: {e}");
                }
            }
        }
    }
    descriptors
}

pub async fn discover_aero_pools(
    provider:     &HttpProvider,
    aero_factory: Address,
    pairs:        &[(Address, Address)],
) -> Vec<PoolDescriptor> {
    let mut descriptors = Vec::new();
    let factory = IAeroFactory::new(aero_factory, provider);

    for &(ta, tb) in pairs {
        let (token0, token1) = if ta.lt(&tb) { (ta, tb) } else { (tb, ta) };

        for stable in [false, true] {
            match factory.getPool(token0, token1, stable).call().await {
                Ok(ret) => {
                    if ret.pool == Address::ZERO {
                        continue;
                    }
                    let fee_ppm = if stable { 500 } else { 3000 };
                    descriptors.push(PoolDescriptor {
                        address: ret.pool,
                        token0,
                        token1,
                        fee_ppm,
                        is_aero: true,
                        stable,
                    });
                    tracing::debug!(
                        "Aero pool {}/{} stable={}: {}", token0, token1, stable, ret.pool
                    );
                }
                Err(e) => {
                    warn!("Aero factory.getPool({token0},{token1},{stable}) failed: {e}");
                }
            }
        }
    }
    descriptors
}

// ─── Per-block batch fetch via Multicall3 ─────────────────────────────────────

pub async fn fetch_all_pool_states(
    provider:    &HttpProvider,
    mc3_address: Address,
    uni_pools:   &[PoolDescriptor],
    aero_pools:  &[PoolDescriptor],
) -> Result<(Vec<UniV3PoolState>, Vec<AeroPoolState>)> {
    let mut calls: Vec<Call3> = Vec::new();

    // UniV3 slot0 calls
    for pool in uni_pools {
        calls.push(Call3 {
            target:       pool.address,
            allowFailure: true,
            callData:     IUniV3Pool::slot0Call {}.abi_encode().into(),
        });
    }
    // UniV3 liquidity calls
    for pool in uni_pools {
        calls.push(Call3 {
            target:       pool.address,
            allowFailure: true,
            callData:     IUniV3Pool::liquidityCall {}.abi_encode().into(),
        });
    }
    // Aerodrome getReserves calls
    for pool in aero_pools {
        calls.push(Call3 {
            target:       pool.address,
            allowFailure: true,
            callData:     IAeroPool::getReservesCall {}.abi_encode().into(),
        });
    }

    if calls.is_empty() {
        return Ok((vec![], vec![]));
    }

    let mc3     = IMulticall3::new(mc3_address, provider);
    let results = mc3
        .aggregate3(calls)
        .call()
        .await
        .context("Multicall3 aggregate3 failed")?
        .returnData;

    let n_uni  = uni_pools.len();
    let n_aero = aero_pools.len();

    anyhow::ensure!(
        results.len() == 2 * n_uni + n_aero,
        "Multicall3 returned {} results, expected {}",
        results.len(),
        2 * n_uni + n_aero,
    );

    // ── Parse UniV3 states ────────────────────────────────────────────────────
    let mut uni_states = Vec::with_capacity(n_uni);

    for (i, pool) in uni_pools.iter().enumerate() {
        let slot0_res = &results[i];
        let liq_res   = &results[n_uni + i];

        if !slot0_res.success || !liq_res.success {
            uni_states.push(UniV3PoolState { address: pool.address, ..Default::default() });
            continue;
        }

        let slot0 = match IUniV3Pool::slot0Call::abi_decode_returns(&slot0_res.returnData, false) {
            Ok(v)  => v,
            Err(e) => {
                warn!("slot0 decode error for {}: {e}", pool.address);
                uni_states.push(UniV3PoolState { address: pool.address, ..Default::default() });
                continue;
            }
        };

        let liq = match IUniV3Pool::liquidityCall::abi_decode_returns(&liq_res.returnData, false) {
            Ok(v)  => v,
            Err(e) => {
                warn!("liquidity decode error for {}: {e}", pool.address);
                uni_states.push(UniV3PoolState { address: pool.address, ..Default::default() });
                continue;
            }
        };

        // sqrtPriceX96 is Uint<160,3>. Cast lower 128 bits to f64.
        // Safe for all realistic prices on Base Sepolia.
        let sqrt_f64 = slot0.sqrtPriceX96.to::<u128>() as f64;
        let liq_f64  = liq.liquidity as f64;

        // int24 tick: extract sign + magnitude separately
        let tick_i32 = {
            let mag = slot0.tick.unsigned_abs().to::<u32>() as i32;
            if slot0.tick.is_negative() { -mag } else { mag }
        };

        uni_states.push(UniV3PoolState {
            address:        pool.address,
            token0:         pool.token0,
            token1:         pool.token1,
            fee_ppm:        pool.fee_ppm,
            sqrt_price_x96: sqrt_f64,
            liquidity:      liq_f64,
            tick:           tick_i32,
            valid:          sqrt_f64 > 0.0 && liq_f64 > 0.0,
        });
    }

    // ── Parse Aerodrome states ────────────────────────────────────────────────
    let mut aero_states = Vec::with_capacity(n_aero);

    for (i, pool) in aero_pools.iter().enumerate() {
        let res = &results[2 * n_uni + i];

        if !res.success {
            aero_states.push(AeroPoolState { address: pool.address, ..Default::default() });
            continue;
        }

        let reserves = match IAeroPool::getReservesCall::abi_decode_returns(&res.returnData, false) {
            Ok(v)  => v,
            Err(e) => {
                warn!("getReserves decode error for {}: {e}", pool.address);
                aero_states.push(AeroPoolState { address: pool.address, ..Default::default() });
                continue;
            }
        };

        let r0 = reserves.reserve0.to::<u128>() as f64;
        let r1 = reserves.reserve1.to::<u128>() as f64;

        aero_states.push(AeroPoolState {
            address:  pool.address,
            token0:   pool.token0,
            token1:   pool.token1,
            reserve0: r0,
            reserve1: r1,
            fee_ppm:  pool.fee_ppm,
            stable:   pool.stable,
            valid:    r0 > 0.0 && r1 > 0.0,
        });
    }

    Ok((uni_states, aero_states))
}
