// Aetheris\agent_gas\src\bundler\mempool.ts

/**
 * bundler/mempool.ts — In-memory UserOperation mempool
 *
 * Stores pending UserOperations received via eth_sendUserOperation.
 * Validates basic structural requirements before accepting.
 * The validator module (validator.ts) runs full simulateValidation.
 *
 * ERC-4337 UserOperation fields (EntryPoint v0.6):
 *   sender              — Smart account address
 *   nonce               — Account nonce from EntryPoint.getNonce()
 *   initCode            — Account factory call for counterfactual deployment (or '0x')
 *   callData            — Inner call(s) to execute
 *   callGasLimit        — Gas for inner execution
 *   verificationGasLimit— Gas for account/paymaster validation
 *   preVerificationGas  — Bundler overhead gas
 *   maxFeePerGas        — EIP-1559 max fee
 *   maxPriorityFeePerGas— EIP-1559 priority fee
 *   paymasterAndData    — Paymaster address + data (or '0x')
 *   signature           — Account signature over the UserOpHash
 */

import { Hex, Address, keccak256, encodePacked } from 'viem';

/** Complete ERC-4337 UserOperation (v0.6 EntryPoint format). */
export interface UserOperation {
  sender: Address;
  nonce: Hex;
  initCode: Hex;
  callData: Hex;
  callGasLimit: Hex;
  verificationGasLimit: Hex;
  preVerificationGas: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  paymasterAndData: Hex;
  signature: Hex;
}

/** A UserOp entry in the mempool, with metadata. */
interface MempoolEntry {
  op: UserOperation;
  hash: string;
  receivedAt: number;
  validated: boolean;
}

/** Result of adding a UserOp to the mempool. */
export interface AddResult {
  success: boolean;
  hash?: string;
  error?: string;
}

export class Mempool {
  /** Map from userOpHash → entry. Ordered by insertion. */
  private entries: Map<string, MempoolEntry> = new Map();

  /** Maximum number of ops to hold in the mempool at once. */
  private readonly MAX_SIZE = 1000;

  /**
   * Compute the ERC-4337 UserOperation hash.
   *
   * In production this should call EntryPoint.getUserOpHash(). For Phase 1
   * we compute a deterministic hash locally to avoid an extra RPC call per
   * incoming op. The hash is used only for deduplication in the mempool.
   */
  computeHash(op: Partial<UserOperation>, chainId: number): string {
    return keccak256(
      encodePacked(
        ['address', 'bytes32', 'bytes32', 'uint256'],
        [
          op.sender ?? '0x0000000000000000000000000000000000000000',
          keccak256(op.callData as Hex ?? '0x'),
          keccak256(op.paymasterAndData as Hex ?? '0x'),
          BigInt(chainId),
        ]
      )
    );
  }

  /**
   * Add a UserOperation to the mempool.
   * Performs basic structural validation before accepting.
   */
  add(op: Partial<UserOperation>, chainId: number): AddResult {
    // Basic structural validation
    const validationError = this.validateStructure(op);
    if (validationError) {
      return { success: false, error: validationError };
    }

    if (this.entries.size >= this.MAX_SIZE) {
      return { success: false, error: 'Mempool is full. Try again later.' };
    }

    const hash = this.computeHash(op, chainId);

    // Deduplicate by hash
    if (this.entries.has(hash)) {
      return { success: true, hash }; // Idempotent — already have it
    }

    this.entries.set(hash, {
      op: op as UserOperation,
      hash,
      receivedAt: Date.now(),
      validated: false,
    });

    return { success: true, hash };
  }

  /**
   * Pop up to `count` ops from the mempool for bundling.
   * Returns the oldest validated (or pending) ops.
   * Does NOT remove them from the mempool yet — call remove() after bundling.
   */
  peek(count: number): MempoolEntry[] {
    const result: MempoolEntry[] = [];
    for (const entry of this.entries.values()) {
      if (result.length >= count) break;
      result.push(entry);
    }
    return result;
  }

  /** Remove a UserOp from the mempool (after successful bundling or validation failure). */
  remove(hash: string): boolean {
    return this.entries.delete(hash);
  }

  /** Mark a UserOp as validated (simulateValidation passed). */
  markValidated(hash: string): void {
    const entry = this.entries.get(hash);
    if (entry) entry.validated = true;
  }

  /** Get a UserOp by hash. Returns null if not in mempool. */
  get(hash: string): UserOperation | null {
    return this.entries.get(hash)?.op ?? null;
  }

  /** Current size of the mempool. */
  size(): number {
    return this.entries.size;
  }

  /**
   * Basic structural validation.
   * Returns an error string if invalid, or null if valid.
   */
  private validateStructure(op: Partial<UserOperation>): string | null {
    if (!op.sender || !/^0x[0-9a-fA-F]{40}$/.test(op.sender)) {
      return 'Invalid sender address';
    }
    if (!op.nonce) {
      return 'Missing nonce';
    }
    if (!op.callData) {
      return 'Missing callData';
    }
    if (!op.signature || op.signature.length < 10) {
      return 'Missing or invalid signature';
    }
    if (!op.maxFeePerGas) {
      return 'Missing maxFeePerGas';
    }
    if (!op.maxPriorityFeePerGas) {
      return 'Missing maxPriorityFeePerGas';
    }
    return null;
  }
}
