// Aetherisgent_gas\src\paymaster\policy.ts

/**
 * paymaster/policy.ts — Paymaster sponsorship policy
 *
 * Decides whether a given UserOperation should be sponsored (gas paid in USDC).
 *
 * Phase 1 sponsorship rules:
 *   SPONSOR:    vault.deposit(), vault.withdraw(), vault.redeem(),
 *               staking.stake(), staking.unstake(), staking.claimRewards()
 *   DON'T SPONSOR: arbitrary calldata, unknown contracts,
 *                  ops exceeding $5 gas equivalent
 *
 * The policy is intentionally conservative for Phase 1. It can be relaxed
 * as the protocol matures and gas balance grows.
 */

import { Address, Hex } from 'viem';
import { Config } from '../config';
import { UserOperation } from '../bundler/mempool';

/** Result of the policy check. */
export interface PolicyDecision {
  shouldSponsor: boolean;
  reason: string;
}

/**
 * ABI-encode function selectors for the sponsored functions.
 * selector = first 4 bytes of keccak256(functionSignature)
 *
 * Pre-computed to avoid runtime keccak overhead.
 * These MUST match the actual function signatures in the contracts.
 */
const SPONSORED_SELECTORS: Record<string, string> = {
  // AetherisVault
  'vault.deposit':   '0x47e7ef24', // deposit(uint256)
  'vault.withdraw':  '0x2e1a7d4d', // withdraw(uint256)
  'vault.redeem':    '0xdb006a75', // redeem(uint256)
  // AetherisStaking
  'staking.stake':         '0xa694fc3a', // stake(uint256)
  'staking.unstake':       '0x2def6620', // unstake(uint256)
  'staking.claimRewards':  '0x372500ab', // claimRewards()
};

/** All allowed target contracts for sponsored calls. */
function getAllowedTargets(config: Config): Set<string> {
  return new Set([
    config.vaultAddr.toLowerCase(),
    config.stakingAddr.toLowerCase(),
  ]);
}

/** All allowed function selectors (first 4 bytes of callData). */
function getAllowedSelectors(): Set<string> {
  return new Set(Object.values(SPONSORED_SELECTORS));
}

export class SponsorshipPolicy {
  private readonly allowedTargets: Set<string>;
  private readonly allowedSelectors: Set<string>;

  constructor(private readonly config: Config) {
    this.allowedTargets = getAllowedTargets(config);
    this.allowedSelectors = getAllowedSelectors();
  }

  /**
   * Evaluate whether a UserOperation should be sponsored.
   *
   * Checks in order:
   *   1. callData must be present and at least 4 bytes
   *   2. The call target must be a known Aetheris contract
   *   3. The function selector must be in the sponsored list
   *   4. Estimated gas cost must be within the USDC budget
   *
   * @param op The UserOperation to evaluate
   * @param estimatedGasCostUsdc Estimated gas cost in USDC units (6 decimals)
   */
  evaluate(op: Partial<UserOperation>, estimatedGasCostUsdc: bigint): PolicyDecision {
    // Must have callData
    if (!op.callData || op.callData.length < 10) {
      return { shouldSponsor: false, reason: 'No callData or too short' };
    }

    // Parse the inner call from the smart account's execute() call
    // AetherisAccount.execute(address target, uint256 value, bytes callData)
    // selector = execute(address,uint256,bytes) → 0xb61d27f6
    const EXECUTE_SELECTOR = '0xb61d27f6';
    const outerSelector = op.callData.slice(0, 10).toLowerCase();

    if (outerSelector !== EXECUTE_SELECTOR) {
      return { shouldSponsor: false, reason: `Unsupported outer call selector: ${outerSelector}` };
    }

    // Decode inner target from callData (first 32 bytes after selector = address, right-aligned)
    const innerTargetHex = '0x' + op.callData.slice(34, 74); // bytes 4..24 of params
    const innerTarget = ('0x' + innerTargetHex.slice(-40)).toLowerCase();

    if (!this.allowedTargets.has(innerTarget)) {
      return { shouldSponsor: false, reason: `Target ${innerTarget} not in allowed list` };
    }

    // Decode inner callData selector (starts at byte 4+32+32+32 of the outer callData = offset 196)
    // ABI encoding: target(32) + value(32) + calldata_offset(32) + calldata_length(32) + calldata_content
    if (op.callData.length < 266) {
      return { shouldSponsor: false, reason: 'callData too short to decode inner call' };
    }

    const innerSelector = ('0x' + op.callData.slice(266, 274)).toLowerCase();

    if (!this.allowedSelectors.has(innerSelector)) {
      return {
        shouldSponsor: false,
        reason: `Inner function selector ${innerSelector} not in sponsored list`,
      };
    }

    // Check gas cost budget
    if (estimatedGasCostUsdc > this.config.maxSponsoredGasUsdc) {
      return {
        shouldSponsor: false,
        reason: `Estimated gas cost ${estimatedGasCostUsdc} exceeds max ${this.config.maxSponsoredGasUsdc} USDC`,
      };
    }

    return {
      shouldSponsor: true,
      reason: `Approved: inner call to ${innerTarget} selector ${innerSelector}`,
    };
  }
}
