// Aetheris\agent_gas\tests\mempool.test.ts
//
// Tests for the Mempool class — in-memory UserOperation pool.
// The mempool is the gatekeeper for all UserOps before bundling.
// Critical properties: deduplication, structural validation, size limit,
// correct pending-only semantics.

import { Mempool, UserOperation } from '../src/bundler/mempool';
import { Address } from 'viem';

const CHAIN_ID = 8453;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a valid 20-byte hex address from an integer. */
function addr(n: number): Address {
  return `0x${n.toString(16).padStart(40, '0')}` as Address;
}

const SENDER = addr(1); // 0x0000000000000000000000000000000000000001

function makeValidOp(overrides: Partial<UserOperation> = {}): Partial<UserOperation> {
  return {
    sender: SENDER,
    nonce: '0x1',
    initCode: '0x',
    callData: '0xb61d27f600000000000000000000000000000000000000000000000000000000',
    callGasLimit: '0x186a0',
    verificationGasLimit: '0x249f0',
    preVerificationGas: '0xc350',
    maxFeePerGas: '0x3b9aca00',
    maxPriorityFeePerGas: '0x3b9aca00',
    paymasterAndData: '0x',
    signature: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
    ...overrides,
  };
}

// ─── add() ────────────────────────────────────────────────────────────────────

describe('Mempool.add', () => {
  it('accepts a valid UserOperation and returns success with a hash', () => {
    const pool = new Mempool();
    const result = pool.add(makeValidOp(), CHAIN_ID);
    expect(result.success).toBe(true);
    expect(result.hash).toBeDefined();
    expect(result.hash).toMatch(/^0x[0-9a-f]+/i);
  });

  it('rejects op with missing sender', () => {
    const pool = new Mempool();
    const result = pool.add(makeValidOp({ sender: undefined as any }), CHAIN_ID);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects op with invalid sender address format', () => {
    const pool = new Mempool();
    const result = pool.add(makeValidOp({ sender: 'not-an-address' as any }), CHAIN_ID);
    expect(result.success).toBe(false);
  });

  it('rejects op with missing callData', () => {
    const pool = new Mempool();
    const result = pool.add(makeValidOp({ callData: undefined as any }), CHAIN_ID);
    expect(result.success).toBe(false);
  });

  it('rejects op with missing signature', () => {
    const pool = new Mempool();
    const result = pool.add(makeValidOp({ signature: undefined as any }), CHAIN_ID);
    expect(result.success).toBe(false);
  });

  it('rejects op with too-short signature', () => {
    const pool = new Mempool();
    const result = pool.add(makeValidOp({ signature: '0x12' as any }), CHAIN_ID);
    expect(result.success).toBe(false);
  });

  it('rejects op with missing maxFeePerGas', () => {
    const pool = new Mempool();
    const result = pool.add(makeValidOp({ maxFeePerGas: undefined as any }), CHAIN_ID);
    expect(result.success).toBe(false);
  });

  it('is idempotent — adding the same op twice returns same hash, no size increase', () => {
    const pool = new Mempool();
    const op = makeValidOp();
    const r1 = pool.add(op, CHAIN_ID);
    const r2 = pool.add(op, CHAIN_ID);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r1.hash).toBe(r2.hash);
    expect(pool.size()).toBe(1); // not 2
  });

  it('accepts multiple different ops', () => {
    const pool = new Mempool();
    for (let i = 1; i <= 5; i++) {
      const result = pool.add(makeValidOp({ sender: addr(i) }), CHAIN_ID);
      expect(result.success).toBe(true);
    }
    expect(pool.size()).toBe(5);
  });
});

// ─── computeHash ─────────────────────────────────────────────────────────────

describe('Mempool.computeHash', () => {
  it('returns a hex string starting with 0x', () => {
    const pool = new Mempool();
    const hash = pool.computeHash(makeValidOp(), CHAIN_ID);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it('same op produces same hash (deterministic)', () => {
    const pool = new Mempool();
    const op = makeValidOp();
    expect(pool.computeHash(op, CHAIN_ID)).toBe(pool.computeHash(op, CHAIN_ID));
  });

  it('different senders produce different hashes', () => {
    const pool = new Mempool();
    const op1 = makeValidOp({ sender: addr(1) });
    const op2 = makeValidOp({ sender: addr(2) });
    expect(pool.computeHash(op1, CHAIN_ID)).not.toBe(pool.computeHash(op2, CHAIN_ID));
  });

  it('different chain IDs produce different hashes', () => {
    const pool = new Mempool();
    const op = makeValidOp();
    expect(pool.computeHash(op, 8453)).not.toBe(pool.computeHash(op, 1));
  });
});

// ─── get() ────────────────────────────────────────────────────────────────────

describe('Mempool.get', () => {
  it('returns null for unknown hash', () => {
    const pool = new Mempool();
    expect(pool.get('0xunknown')).toBeNull();
  });

  it('returns the op for a known hash', () => {
    const pool = new Mempool();
    const op = makeValidOp();
    const { hash } = pool.add(op, CHAIN_ID);
    const retrieved = pool.get(hash!);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.sender.toLowerCase()).toBe((op.sender as string).toLowerCase());
  });
});

// ─── peek() ───────────────────────────────────────────────────────────────────

describe('Mempool.peek', () => {
  it('returns empty array when pool is empty', () => {
    const pool = new Mempool();
    expect(pool.peek(10)).toHaveLength(0);
  });

  it('returns up to the requested count', () => {
    const pool = new Mempool();
    for (let i = 1; i <= 8; i++) {
      pool.add(makeValidOp({ sender: addr(i) }), CHAIN_ID);
    }
    expect(pool.peek(5)).toHaveLength(5);
  });

  it('returns all ops when count exceeds pool size', () => {
    const pool = new Mempool();
    for (let i = 1; i <= 3; i++) {
      pool.add(makeValidOp({ sender: addr(i) }), CHAIN_ID);
    }
    expect(pool.peek(10)).toHaveLength(3);
  });

  it('does not remove ops from pool', () => {
    const pool = new Mempool();
    pool.add(makeValidOp(), CHAIN_ID);
    pool.peek(10);
    expect(pool.size()).toBe(1);
  });
});

// ─── remove() ────────────────────────────────────────────────────────────────

describe('Mempool.remove', () => {
  it('returns true and removes an existing op', () => {
    const pool = new Mempool();
    const { hash } = pool.add(makeValidOp(), CHAIN_ID);
    expect(pool.remove(hash!)).toBe(true);
    expect(pool.size()).toBe(0);
  });

  it('returns false for unknown hash', () => {
    const pool = new Mempool();
    expect(pool.remove('0xunknown')).toBe(false);
  });

  it('op is not retrievable after removal', () => {
    const pool = new Mempool();
    const { hash } = pool.add(makeValidOp(), CHAIN_ID);
    pool.remove(hash!);
    expect(pool.get(hash!)).toBeNull();
  });
});

// ─── markValidated() ─────────────────────────────────────────────────────────

describe('Mempool.markValidated', () => {
  it('does not throw for unknown hash', () => {
    const pool = new Mempool();
    expect(() => pool.markValidated('0xunknown')).not.toThrow();
  });

  it('can mark a known op as validated', () => {
    const pool = new Mempool();
    const { hash } = pool.add(makeValidOp(), CHAIN_ID);
    expect(() => pool.markValidated(hash!)).not.toThrow();
  });
});

// ─── size() ───────────────────────────────────────────────────────────────────

describe('Mempool.size', () => {
  it('starts at zero', () => {
    expect(new Mempool().size()).toBe(0);
  });

  it('increments on add', () => {
    const pool = new Mempool();
    pool.add(makeValidOp(), CHAIN_ID);
    expect(pool.size()).toBe(1);
  });

  it('decrements on remove', () => {
    const pool = new Mempool();
    const { hash } = pool.add(makeValidOp(), CHAIN_ID);
    pool.remove(hash!);
    expect(pool.size()).toBe(0);
  });
});
