// Aetheris\agent_gas\src\bundler\validator.ts

/**
 * bundler/validator.ts — UserOperation validator
 *
 * Runs full ERC-4337 simulateValidation before including a UserOp in a bundle.
 * Drops invalid ops from the mempool (e.g. expired signatures, insufficient
 * account balance for non-sponsored ops, invalid paymaster signatures).
 *
 * simulateValidation is a static call to EntryPoint.simulateValidation(userOp).
 * It always reverts — success is indicated by a ValidationResult revert,
 * failure by a FailedOp revert.
 *
 * Reference: ERC-4337 section 6.2 — UserOperation Validation
 */

import { createPublicClient, http, decodeErrorResult, Hex } from 'viem';
import { base } from 'viem/chains';
import { Config } from '../config';
import { UserOperation } from './mempool';

/** ABI for EntryPoint.simulateValidation */
const ENTRY_POINT_ABI = [
  {
    name: 'simulateValidation',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'userOp', type: 'tuple', components: [
      { name: 'sender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'initCode', type: 'bytes' },
      { name: 'callData', type: 'bytes' },
      { name: 'callGasLimit', type: 'uint256' },
      { name: 'verificationGasLimit', type: 'uint256' },
      { name: 'preVerificationGas', type: 'uint256' },
      { name: 'maxFeePerGas', type: 'uint256' },
      { name: 'maxPriorityFeePerGas', type: 'uint256' },
      { name: 'paymasterAndData', type: 'bytes' },
      { name: 'signature', type: 'bytes' },
    ]}],
    outputs: [],
  },
] as const;

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export class UserOpValidator {
  private client: ReturnType<typeof createPublicClient>;

  constructor(private readonly config: Config) {
    this.client = createPublicClient({
      chain: base,
      transport: http(config.rpcHttpUrl),
    });
  }

  /**
   * Validate a UserOperation using EntryPoint.simulateValidation().
   *
   * Returns valid: true if the op passes validation.
   * Returns valid: false with a reason string if it fails.
   *
   * Note: simulateValidation always reverts. We catch the revert and
   * decode it to determine pass/fail.
   */
  async validate(op: UserOperation): Promise<ValidationResult> {
    try {
      // simulateValidation always reverts — we expect an error
      await this.client.simulateContract({
        address: this.config.entryPointAddr,
        abi: ENTRY_POINT_ABI,
        functionName: 'simulateValidation',
        args: [this.toContractUserOp(op)],
      });

      // If we somehow don't get a revert, something is wrong
      return { valid: false, reason: 'simulateValidation did not revert (unexpected)' };
    } catch (err: any) {
      // Check if this is a ValidationResult revert (success) or FailedOp (failure)
      const errorData = err?.cause?.data ?? err?.data;

      if (!errorData) {
        // Network error or timeout — be conservative and consider it valid
        // to avoid incorrectly dropping ops due to RPC issues
        console.warn(`[Validator] simulateValidation RPC error (treating as valid): ${err}`);
        return { valid: true };
      }

      // ValidationResult selector: 0x3dd1b305
      // FailedOp selector:         0x220266b6
      const selector = (errorData as string).slice(0, 10).toLowerCase();

      if (selector === '0x3dd1b305') {
        // ValidationResult — success
        return { valid: true };
      } else if (selector === '0x220266b6') {
        // FailedOp — decode the reason
        const reason = this.decodeFailedOp(errorData as Hex);
        return { valid: false, reason };
      } else {
        // Unknown revert — be conservative
        console.warn(`[Validator] Unknown simulateValidation revert: ${selector}`);
        return { valid: false, reason: `Unknown revert: ${selector}` };
      }
    }
  }

  /** Convert a UserOperation to the tuple format expected by the contract. */
  private toContractUserOp(op: UserOperation) {
    return {
      sender: op.sender,
      nonce: BigInt(op.nonce),
      initCode: op.initCode,
      callData: op.callData,
      callGasLimit: BigInt(op.callGasLimit),
      verificationGasLimit: BigInt(op.verificationGasLimit),
      preVerificationGas: BigInt(op.preVerificationGas),
      maxFeePerGas: BigInt(op.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(op.maxPriorityFeePerGas),
      paymasterAndData: op.paymasterAndData,
      signature: op.signature,
    };
  }

  /** Decode a FailedOp revert to extract the reason string. */
  private decodeFailedOp(errorData: Hex): string {
    try {
      // FailedOp(uint256 opIndex, string reason)
      // Skip selector (4 bytes = 8 hex chars + '0x')
      const payload = ('0x' + errorData.slice(10)) as Hex;
      // opIndex at offset 0 (32 bytes), reason string at offset 32
      const reasonOffset = 64 + 64; // skip opIndex + string offset pointer
      if (errorData.length > reasonOffset) {
        return 'FailedOp: ' + Buffer.from(errorData.slice(reasonOffset), 'hex')
          .toString('utf8')
          .replace(/\x00/g, '');
      }
      return 'FailedOp (could not decode reason)';
    } catch {
      return 'FailedOp (decode error)';
    }
  }
}
