// Aetherisgent_gas\src\gas\estimator.ts

/**
 * gas/estimator.ts — UserOperation gas estimation
 *
 * Estimates the gas limits for a UserOperation:
 *   - callGasLimit          — gas needed for the inner call execution
 *   - verificationGasLimit  — gas for account signature verification
 *   - preVerificationGas    — fixed overhead for bundler processing
 *
 * Uses eth_estimateUserOperationGas via the permissionless library where
 * possible, falling back to conservative static estimates for Phase 1.
 *
 * ERC-4337 gas breakdown:
 *   Total gas = preVerificationGas + verificationGasLimit + callGasLimit
 *   Actual cost = (verification + execution gas) * gasPrice
 */

import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { Config } from '../config';
import { UserOperation } from '../bundler/mempool';

/** Gas limits for a UserOperation. */
export interface UserOpGasLimits {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
}

/** Conservative static gas limits used when simulation is unavailable. */
const STATIC_ESTIMATES: UserOpGasLimits = {
  // ~100k for typical vault/staking calls
  callGasLimit: 100_000n,
  // ~150k for ERC-4337 account verification (includes signature check)
  verificationGasLimit: 150_000n,
  // ~50k pre-verification gas (bundler overhead, calldata encoding cost)
  preVerificationGas: 50_000n,
};

export class GasEstimator {
  private client: any;

  constructor(private readonly config: Config) {
    const chain = config.chainId === 8453 ? base : baseSepolia;
    this.client = createPublicClient({
      chain,
      transport: http(config.rpcHttpUrl),
    });
  }

  /**
   * Estimate gas limits for a UserOperation.
   *
   * Attempts to use eth_estimateUserOperationGas via the bundler RPC.
   * Falls back to conservative static estimates if estimation fails.
   * Always applies the configured overhead buffer to all estimates.
   */
  async estimateGas(op: Partial<UserOperation>): Promise<UserOpGasLimits> {
    try {
      // Call eth_estimateUserOperationGas on the local bundler endpoint
      // (this is the standard ERC-4337 estimation method)
      const result = await this.client.request({
        method: 'eth_estimateUserOperationGas' as any,
        params: [op, this.config.entryPointAddr] as any,
      }) as any;

      const callGasLimit = BigInt(result.callGasLimit ?? STATIC_ESTIMATES.callGasLimit);
      const verificationGasLimit = BigInt(result.verificationGasLimit ?? STATIC_ESTIMATES.verificationGasLimit);
      const preVerificationGas = BigInt(result.preVerificationGas ?? STATIC_ESTIMATES.preVerificationGas);

      // Apply overhead buffer
      return this.applyBuffer({ callGasLimit, verificationGasLimit, preVerificationGas });
    } catch (err) {
      // Estimation failed — use static estimates
      console.warn(`[GasEstimator] eth_estimateUserOperationGas failed: ${err}. Using static estimates.`);
      return this.applyBuffer(STATIC_ESTIMATES);
    }
  }

  /**
   * Apply the configured overhead buffer (e.g. 10%) to all gas limits.
   * This provides safety margin for gas estimation inaccuracies.
   */
  private applyBuffer(limits: UserOpGasLimits): UserOpGasLimits {
    const pct = BigInt(this.config.gasOverheadPct);
    const apply = (v: bigint) => v + (v * pct) / 100n;
    return {
      callGasLimit: apply(limits.callGasLimit),
      verificationGasLimit: apply(limits.verificationGasLimit),
      preVerificationGas: apply(limits.preVerificationGas),
    };
  }
}
