/// Aetheris\aetheris-agent-alpha-rust\src\tx\mod.rs
///
/// Transaction builder for AgentAlpha.executeArbitrage.
/// Pipeline: build calldata → JIT simulation (U7) → gas estimation →
///           gas ladder (U8) → sign + send → return result including real gas cost

use alloy::{
    network::EthereumWallet,
    primitives::{Address, Bytes, FixedBytes, U256, keccak256},
    providers::{Provider, ProviderBuilder},
    rpc::types::TransactionRequest,
    signers::local::PrivateKeySigner,
    sol,
    sol_types::SolCall,
};
use anyhow::{Context, Result};
use std::str::FromStr;
use tracing::{debug, info, warn};

use crate::{
    arb::detector::ArbOpportunity,
    config::*,
    rpc::multicall::fee_to_u24,
};

// ─── AgentAlpha ABI ──────────────────────────────────────────────────────────

sol! {
    #[sol(rpc)]
    interface IAgentAlpha {
        struct SwapStep {
            address dex;
            uint8   dexType;
            address tokenIn;
            address tokenOut;
            uint24  fee;
            uint256 minOut;
            bytes32 poolId;
        }
        struct TradeParams {
            bytes32    tradeId;
            address    flashToken;
            uint256    flashAmount;
            SwapStep[] path;
            uint256    minProfit;
            uint256    deadline;
        }
        function executeArbitrage(TradeParams calldata params) external;
        function isActive()                              external view returns (bool);
        function isUserActive(address user)              external view returns (bool);
        function maxFlashLoanAmount()                    external view returns (uint256);
        function getTotalArbitrageProfit()               external view returns (uint256);
    }
}

// ─── Execution result ─────────────────────────────────────────────────────────

/// Full result of a trade execution attempt.
pub struct ExecResult {
    pub tx_hash:      Option<String>,
    pub success:      bool,
    pub gas_cost_usd: f64,   // real gas cost from receipt (0 if not sent)
    pub gas_tier:     u32,
}

// ─── Gas Ladder (U8) ─────────────────────────────────────────────────────────

pub fn select_gas_tier(net_profit_usdc: f64) -> (u128, u32) {
    let (gwei, tier) = if net_profit_usdc <= GAS_TIER1_MAX_PROFIT {
        (GAS_TIER1_PRIORITY_GWEI, 1u32)
    } else if net_profit_usdc <= GAS_TIER2_MAX_PROFIT {
        (GAS_TIER2_PRIORITY_GWEI, 2u32)
    } else {
        (GAS_TIER3_PRIORITY_GWEI, 3u32)
    };
    let wei = (gwei * 1e9) as u128;
    debug!("[U8] Gas tier {tier} (profit=${net_profit_usdc:.2}): {gwei} gwei priority");
    (wei, tier)
}

// ─── Transaction executor ────────────────────────────────────────────────────

pub struct TxExecutor {
    wallet:      EthereumWallet,
    signer_addr: Address,
}

impl TxExecutor {
    pub fn new(private_key: &str) -> Result<Self> {
        let signer = PrivateKeySigner::from_str(private_key)
            .context("Invalid PRIVATE_KEY in .env")?;
        let signer_addr = signer.address();
        let wallet      = EthereumWallet::from(signer);
        Ok(Self { wallet, signer_addr })
    }

    pub fn signer_address(&self) -> Address {
        self.signer_addr
    }

    pub async fn execute(
        &self,
        opp:            &ArbOpportunity,
        cfg:            &crate::config::AppConfig,
        rpc_url:        &str,
        block_number:   u64,
        mode:           &str,
        eth_price_usdc: f64,
    ) -> Result<ExecResult> {
        let provider = ProviderBuilder::new()
            .with_chain_id(CHAIN_ID)
            .wallet(self.wallet.clone())
            .on_http(rpc_url.parse().context("Invalid RPC URL")?);

        let calldata = self.build_calldata(opp, cfg, block_number)?;
        let agent    = cfg.agent_alpha;

        let tx_req = TransactionRequest::default()
            .to(agent)
            .input(calldata.clone().into());

        // ── JIT simulation (U7) ───────────────────────────────────────────────
        info!("[U7] Running JIT simulation for route {}", opp.route_key);
        if let Err(e) = provider.call(&tx_req).await {
            warn!("[U7] Simulation FAILED for {}: {e}", opp.route_key);
            return Ok(ExecResult {
                tx_hash: None, success: false, gas_cost_usd: 0.0, gas_tier: 0,
            });
        }
        info!("[U7] Simulation passed ✓");

        // ── Simulate mode: log and return ─────────────────────────────────────
        if mode == "simulate" {
            let (_, tier) = select_gas_tier(opp.net_profit_usdc);
            info!(
                "[SIM] Route={} profit=${:.4} size={:.2} {}",
                opp.route_key, opp.net_profit_usdc,
                opp.amount_in / 10f64.powi(opp.start_token.decimals() as i32),
                opp.start_token.name(),
            );
            return Ok(ExecResult {
                tx_hash: None, success: false, gas_cost_usd: 0.0, gas_tier: tier,
            });
        }

        // ── Gas estimation ────────────────────────────────────────────────────
        let gas_estimate = provider
            .estimate_gas(&tx_req)
            .await
            .unwrap_or(GAS_FALLBACK_UNITS);
        let gas_limit = (gas_estimate as f64 * GAS_BUFFER_MULTIPLIER) as u64;

        // ── Gas ladder ────────────────────────────────────────────────────────
        let (priority_fee_wei, tier) = select_gas_tier(opp.net_profit_usdc);
        let base_fee = provider.get_gas_price().await.unwrap_or(1_000_000_000u128);
        let max_fee  = base_fee + priority_fee_wei;

        info!(
            "[U8] Tier {tier}: priority={:.4} gwei, limit={gas_limit}",
            priority_fee_wei as f64 / 1e9,
        );

        let nonce = provider.get_transaction_count(self.signer_addr).await.unwrap_or(0);

        // ── Send ──────────────────────────────────────────────────────────────
        let final_tx = TransactionRequest::default()
            .to(agent)
            .input(calldata.into())
            .gas_limit(gas_limit)
            .max_fee_per_gas(max_fee)
            .max_priority_fee_per_gas(priority_fee_wei)
            .nonce(nonce);

        let pending = provider
            .send_transaction(final_tx)
            .await
            .context("Failed to send transaction")?;

        let hash = format!("{:?}", pending.tx_hash());

        match pending.get_receipt().await {
            Ok(receipt) => {
                let success = receipt.status();

                // ── Real gas cost from receipt ────────────────────────────────
                // gas_used * effective_gas_price = cost in wei
                // cost_in_eth = cost_in_wei / 1e18
                // cost_in_usd = cost_in_eth * eth_price_usdc
                let gas_used     = receipt.gas_used as f64;
                let eff_gas_price = receipt.effective_gas_price as f64;
                let cost_wei     = gas_used * eff_gas_price;
                let cost_eth     = cost_wei / 1e18;
                let gas_cost_usd = cost_eth * eth_price_usdc;

                if success {
                    info!("[TRADE] ✅ Confirmed: {hash}  gas=${gas_cost_usd:.4}");
                } else {
                    warn!("[TRADE] ❌ Reverted: {hash}  gas=${gas_cost_usd:.4}");
                }

                Ok(ExecResult {
                    tx_hash: Some(hash),
                    success,
                    gas_cost_usd,
                    gas_tier: tier,
                })
            }
            Err(e) => {
                warn!("[TRADE] Receipt error: {e}. Hash: {hash}");
                Ok(ExecResult {
                    tx_hash: Some(hash),
                    success: false,
                    gas_cost_usd: 0.0,
                    gas_tier: tier,
                })
            }
        }
    }

    fn build_calldata(
        &self,
        opp:          &ArbOpportunity,
        cfg:          &crate::config::AppConfig,
        block_number: u64,
    ) -> Result<Bytes> {
        let trade_id = keccak256(
            format!("{}-{}-{}", opp.route_key, block_number, opp.amount_in as u64).as_bytes(),
        );

        let path: Vec<IAgentAlpha::SwapStep> = opp.legs_summary.iter().map(|leg| {
            let dex_type: u8 = match leg.dex {
                crate::arb::routes::Dex::UniswapV3 { .. } => 0,
                crate::arb::routes::Dex::Aerodrome  { .. } => 1,
            };
            let min_out = apply_slippage(leg.amount_out as u128, SLIPPAGE_BPS);
            IAgentAlpha::SwapStep {
                dex:      leg.pool_addr.unwrap_or(Address::ZERO),
                dexType:  dex_type,
                tokenIn:  leg.token_in.address(cfg),
                tokenOut: leg.token_out.address(cfg),
                fee:      fee_to_u24(leg.dex.fee_ppm()),
                minOut:   U256::from(min_out),
                poolId:   FixedBytes::ZERO,
            }
        }).collect();

        let params = IAgentAlpha::TradeParams {
            tradeId:     trade_id,
            flashToken:  opp.start_token.address(cfg),
            flashAmount: U256::from(opp.amount_in as u128),
            path,
            minProfit:   U256::from(
                (opp.net_profit_usdc * 10f64.powi(USDC_DECIMALS as i32) * 0.9) as u128
            ),
            deadline:    U256::from(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() + 60,
            ),
        };

        Ok(Bytes::from(IAgentAlpha::executeArbitrageCall { params }.abi_encode()))
    }
}

fn apply_slippage(amount: u128, slippage_bps: u64) -> u128 {
    amount * (10_000 - slippage_bps) as u128 / 10_000
}
