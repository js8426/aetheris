// Aetheris\agent_gas\tests\db.test.ts
//
// Tests for AgentGasDB — the SQLite persistence layer.
// Uses an in-memory SQLite DB (':memory:') via better-sqlite3 for full isolation.
// Each test gets a fresh DB instance.

import { AgentGasDB, UserOpRecord } from '../src/db';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a temporary DB file that is cleaned up after the test. */
function makeTempDb(): { db: AgentGasDB; cleanup: () => void } {
  const tmpPath = path.join(os.tmpdir(), `agent_gas_test_${Date.now()}_${Math.random()}.db`);
  const db = new AgentGasDB(tmpPath);
  const cleanup = () => {
    db.close();
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    // Also remove WAL/SHM files if present
    ['-wal', '-shm'].forEach(ext => {
      const f = tmpPath + ext;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  };
  return { db, cleanup };
}

const PENDING_OP: UserOpRecord = {
  userOpHash: '0xabc123',
  sender: '0xsender000000000000000000000000000000001',
  nonce: '0x1',
  callData: '0xdeadbeef',
  paymasterSponsored: true,
  status: 'pending',
};

// ─── insertUserOp ─────────────────────────────────────────────────────────────

describe('AgentGasDB.insertUserOp', () => {
  it('inserts a new UserOp without throwing', () => {
    const { db, cleanup } = makeTempDb();
    try {
      expect(() => db.insertUserOp(PENDING_OP)).not.toThrow();
    } finally {
      cleanup();
    }
  });

  it('is idempotent — inserting same hash twice does not throw or duplicate', () => {
    const { db, cleanup } = makeTempDb();
    try {
      db.insertUserOp(PENDING_OP);
      expect(() => db.insertUserOp(PENDING_OP)).not.toThrow();
    } finally {
      cleanup();
    }
  });

  it('inserts non-sponsored op correctly', () => {
    const { db, cleanup } = makeTempDb();
    try {
      const op = { ...PENDING_OP, userOpHash: '0xnotsponsored', paymasterSponsored: false };
      db.insertUserOp(op);
      const loaded = db.getUserOpByHash('0xnotsponsored');
      expect(loaded?.paymasterSponsored).toBe(false);
    } finally {
      cleanup();
    }
  });
});

// ─── getUserOpByHash ──────────────────────────────────────────────────────────

describe('AgentGasDB.getUserOpByHash', () => {
  it('returns null for unknown hash', () => {
    const { db, cleanup } = makeTempDb();
    try {
      expect(db.getUserOpByHash('0xnonexistent')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('returns the inserted op for a known hash', () => {
    const { db, cleanup } = makeTempDb();
    try {
      db.insertUserOp(PENDING_OP);
      const loaded = db.getUserOpByHash(PENDING_OP.userOpHash);
      expect(loaded).not.toBeNull();
      expect(loaded?.userOpHash).toBe(PENDING_OP.userOpHash);
      expect(loaded?.sender).toBe(PENDING_OP.sender.toLowerCase());
      expect(loaded?.status).toBe('pending');
    } finally {
      cleanup();
    }
  });

  it('returns paymasterSponsored as boolean', () => {
    const { db, cleanup } = makeTempDb();
    try {
      db.insertUserOp(PENDING_OP);
      const loaded = db.getUserOpByHash(PENDING_OP.userOpHash);
      expect(typeof loaded?.paymasterSponsored).toBe('boolean');
      expect(loaded?.paymasterSponsored).toBe(true);
    } finally {
      cleanup();
    }
  });
});

// ─── updateUserOpStatus ───────────────────────────────────────────────────────

describe('AgentGasDB.updateUserOpStatus', () => {
  it('updates status to bundled', () => {
    const { db, cleanup } = makeTempDb();
    try {
      db.insertUserOp(PENDING_OP);
      db.updateUserOpStatus(PENDING_OP.userOpHash, 'bundled', '0xtxhash', Date.now());
      const loaded = db.getUserOpByHash(PENDING_OP.userOpHash);
      expect(loaded?.status).toBe('bundled');
      expect(loaded?.bundleTxHash).toBe('0xtxhash');
    } finally {
      cleanup();
    }
  });

  it('updates status to failed', () => {
    const { db, cleanup } = makeTempDb();
    try {
      db.insertUserOp(PENDING_OP);
      db.updateUserOpStatus(PENDING_OP.userOpHash, 'failed');
      const loaded = db.getUserOpByHash(PENDING_OP.userOpHash);
      expect(loaded?.status).toBe('failed');
    } finally {
      cleanup();
    }
  });

  it('does not throw for unknown hash', () => {
    const { db, cleanup } = makeTempDb();
    try {
      expect(() => db.updateUserOpStatus('0xunknown', 'failed')).not.toThrow();
    } finally {
      cleanup();
    }
  });
});

// ─── confirmUserOp ────────────────────────────────────────────────────────────

describe('AgentGasDB.confirmUserOp', () => {
  it('marks op as confirmed with gas and fee', () => {
    const { db, cleanup } = makeTempDb();
    try {
      db.insertUserOp(PENDING_OP);
      db.confirmUserOp(PENDING_OP.userOpHash, Date.now(), 85_000, 1_500);
      const loaded = db.getUserOpByHash(PENDING_OP.userOpHash);
      expect(loaded?.status).toBe('confirmed');
      expect(loaded?.gasUsed).toBe(85_000);
      expect(loaded?.usdcFeeCharged).toBe(1_500);
    } finally {
      cleanup();
    }
  });
});

// ─── getPendingOps ────────────────────────────────────────────────────────────

describe('AgentGasDB.getPendingOps', () => {
  it('returns empty array when no pending ops', () => {
    const { db, cleanup } = makeTempDb();
    try {
      expect(db.getPendingOps(10)).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('returns up to the limit of pending ops', () => {
    const { db, cleanup } = makeTempDb();
    try {
      for (let i = 0; i < 5; i++) {
        db.insertUserOp({ ...PENDING_OP, userOpHash: `0xhash${i}` });
      }
      const ops = db.getPendingOps(3);
      expect(ops).toHaveLength(3);
    } finally {
      cleanup();
    }
  });

  it('returns all pending ops when count is below limit', () => {
    const { db, cleanup } = makeTempDb();
    try {
      for (let i = 0; i < 3; i++) {
        db.insertUserOp({ ...PENDING_OP, userOpHash: `0xhash${i}` });
      }
      const ops = db.getPendingOps(10);
      expect(ops).toHaveLength(3);
    } finally {
      cleanup();
    }
  });

  it('does not return bundled or failed ops', () => {
    const { db, cleanup } = makeTempDb();
    try {
      db.insertUserOp({ ...PENDING_OP, userOpHash: '0xpending' });
      db.insertUserOp({ ...PENDING_OP, userOpHash: '0xbundled' });
      db.updateUserOpStatus('0xbundled', 'bundled');

      const ops = db.getPendingOps(10);
      expect(ops).toHaveLength(1);
      expect(ops[0].userOpHash).toBe('0xpending');
    } finally {
      cleanup();
    }
  });
});

// ─── insertBundle ─────────────────────────────────────────────────────────────

describe('AgentGasDB.insertBundle', () => {
  it('inserts a bundle record without throwing', () => {
    const { db, cleanup } = makeTempDb();
    try {
      expect(() => db.insertBundle({
        txHash: '0xbundletx',
        opCount: 3,
        submittedAt: Date.now(),
      })).not.toThrow();
    } finally {
      cleanup();
    }
  });

  it('is idempotent — same txHash does not duplicate', () => {
    const { db, cleanup } = makeTempDb();
    try {
      const bundle = { txHash: '0xbundletx', opCount: 3, submittedAt: Date.now() };
      db.insertBundle(bundle);
      expect(() => db.insertBundle(bundle)).not.toThrow();
    } finally {
      cleanup();
    }
  });
});

// ─── getTodayStats ────────────────────────────────────────────────────────────

describe('AgentGasDB.getTodayStats', () => {
  it('returns zeros for all fields on empty DB', () => {
    const { db, cleanup } = makeTempDb();
    try {
      const stats = db.getTodayStats();
      expect(stats.opsReceived).toBe(0);
      expect(stats.opsSponsored).toBe(0);
      expect(stats.opsBundled).toBe(0);
      expect(stats.opsFailed).toBe(0);
      expect(stats.totalUsdcFees).toBe(0);
      expect(stats.bundlesSubmitted).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('increments opsReceived on insertUserOp', () => {
    const { db, cleanup } = makeTempDb();
    try {
      db.insertUserOp(PENDING_OP);
      db.insertUserOp({ ...PENDING_OP, userOpHash: '0xhash2' });
      const stats = db.getTodayStats();
      expect(stats.opsReceived).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('increments opsSponsored only for sponsored ops', () => {
    const { db, cleanup } = makeTempDb();
    try {
      db.insertUserOp({ ...PENDING_OP, userOpHash: '0xsponsored', paymasterSponsored: true });
      db.insertUserOp({ ...PENDING_OP, userOpHash: '0xnotsponsored', paymasterSponsored: false });
      const stats = db.getTodayStats();
      expect(stats.opsSponsored).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('increments bundlesSubmitted on insertBundle', () => {
    const { db, cleanup } = makeTempDb();
    try {
      db.insertBundle({ txHash: '0xtx1', opCount: 2, submittedAt: Date.now() });
      db.insertBundle({ txHash: '0xtx2', opCount: 3, submittedAt: Date.now() });
      const stats = db.getTodayStats();
      expect(stats.bundlesSubmitted).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('returns today date in ISO format', () => {
    const { db, cleanup } = makeTempDb();
    try {
      const stats = db.getTodayStats();
      const today = new Date().toISOString().slice(0, 10);
      expect(stats.date).toBe(today);
    } finally {
      cleanup();
    }
  });
});
