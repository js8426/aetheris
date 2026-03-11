// Aetheris\agent_gas\src\db\index.ts

/**
 * db/index.ts — SQLite database for Agent Gas
 *
 * Manages three tables:
 *   user_operations — Every UserOp received (lifecycle: pending → bundled → confirmed/failed)
 *   bundles         — Every bundle transaction submitted to EntryPoint
 *   daily_stats     — Per-day aggregated statistics
 *
 * Uses better-sqlite3 (synchronous API) — fast and simple, no connection pooling needed.
 * The caller manages concurrency at the application level.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export interface UserOpRecord {
  userOpHash: string;
  sender: string;
  nonce: string;
  callData: string;
  paymasterSponsored: boolean;
  status: 'pending' | 'bundled' | 'confirmed' | 'failed';
  bundleTxHash?: string;
  submittedAt?: number;
  confirmedAt?: number;
  gasUsed?: number;
  usdcFeeCharged?: number;
}

export interface BundleRecord {
  txHash: string;
  opCount: number;
  submittedAt: number;
  confirmedAt?: number;
  gasUsed?: number;
  success?: boolean;
}

export class AgentGasDB {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure parent directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    // WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.createTables();
    console.log(`[DB] Database ready at '${dbPath}'`);
  }

  /** Create all tables if they don't exist. */
  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_operations (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        user_op_hash          TEXT UNIQUE NOT NULL,
        sender                TEXT NOT NULL,
        nonce                 TEXT NOT NULL,
        call_data             TEXT NOT NULL,
        paymaster_sponsored   INTEGER DEFAULT 0,
        status                TEXT DEFAULT 'pending',
        bundle_tx_hash        TEXT,
        submitted_at          INTEGER,
        confirmed_at          INTEGER,
        gas_used              INTEGER,
        usdc_fee_charged      INTEGER
      );

      CREATE TABLE IF NOT EXISTS bundles (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_hash       TEXT UNIQUE,
        op_count      INTEGER,
        submitted_at  INTEGER,
        confirmed_at  INTEGER,
        gas_used      INTEGER,
        success       INTEGER
      );

      CREATE TABLE IF NOT EXISTS daily_stats (
        date              TEXT PRIMARY KEY,
        ops_received      INTEGER DEFAULT 0,
        ops_sponsored     INTEGER DEFAULT 0,
        ops_bundled       INTEGER DEFAULT 0,
        ops_failed        INTEGER DEFAULT 0,
        total_usdc_fees   INTEGER DEFAULT 0,
        bundles_submitted INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_ops_hash ON user_operations(user_op_hash);
      CREATE INDEX IF NOT EXISTS idx_ops_sender ON user_operations(sender);
      CREATE INDEX IF NOT EXISTS idx_ops_status ON user_operations(status);
    `);
  }

  /** Insert a new UserOperation into the pending pool. */
  insertUserOp(op: UserOpRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO user_operations
        (user_op_hash, sender, nonce, call_data, paymaster_sponsored, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);
    stmt.run(
      op.userOpHash,
      op.sender.toLowerCase(),
      op.nonce,
      op.callData,
      op.paymasterSponsored ? 1 : 0
    );
    this.incrementDailyStat('ops_received');
    if (op.paymasterSponsored) {
      this.incrementDailyStat('ops_sponsored');
    }
  }

  /** Update the status and optional bundle details for a UserOp. */
  updateUserOpStatus(
    userOpHash: string,
    status: UserOpRecord['status'],
    bundleTxHash?: string,
    submittedAt?: number
  ): void {
    this.db.prepare(`
      UPDATE user_operations
      SET status = ?, bundle_tx_hash = COALESCE(?, bundle_tx_hash),
          submitted_at = COALESCE(?, submitted_at)
      WHERE user_op_hash = ?
    `).run(status, bundleTxHash ?? null, submittedAt ?? null, userOpHash);

    if (status === 'failed') {
      this.incrementDailyStat('ops_failed');
    } else if (status === 'bundled') {
      this.incrementDailyStat('ops_bundled');
    }
  }

  /** Mark a UserOp as confirmed with gas and fee details. */
  confirmUserOp(
    userOpHash: string,
    confirmedAt: number,
    gasUsed: number,
    usdcFeeCharged: number
  ): void {
    this.db.prepare(`
      UPDATE user_operations
      SET status = 'confirmed', confirmed_at = ?, gas_used = ?, usdc_fee_charged = ?
      WHERE user_op_hash = ?
    `).run(confirmedAt, gasUsed, usdcFeeCharged, userOpHash);

    this.incrementDailyStat('total_usdc_fees', usdcFeeCharged);
  }

  /** Look up a UserOp by its hash. Returns null if not found. */
  getUserOpByHash(userOpHash: string): UserOpRecord | null {
    const row = this.db.prepare(
      'SELECT * FROM user_operations WHERE user_op_hash = ?'
    ).get(userOpHash) as any;

    if (!row) return null;
    return {
      userOpHash: row.user_op_hash,
      sender: row.sender,
      nonce: row.nonce,
      callData: row.call_data,
      paymasterSponsored: row.paymaster_sponsored === 1,
      status: row.status,
      bundleTxHash: row.bundle_tx_hash ?? undefined,
      submittedAt: row.submitted_at ?? undefined,
      confirmedAt: row.confirmed_at ?? undefined,
      gasUsed: row.gas_used ?? undefined,
      usdcFeeCharged: row.usdc_fee_charged ?? undefined,
    };
  }

  /** Insert a new bundle record. */
  insertBundle(bundle: BundleRecord): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO bundles (tx_hash, op_count, submitted_at)
      VALUES (?, ?, ?)
    `).run(bundle.txHash, bundle.opCount, bundle.submittedAt);
    this.incrementDailyStat('bundles_submitted');
  }

  /** Update a bundle with confirmation details. */
  updateBundle(
    txHash: string,
    confirmedAt: number,
    gasUsed: number,
    success: boolean
  ): void {
    this.db.prepare(`
      UPDATE bundles
      SET confirmed_at = ?, gas_used = ?, success = ?
      WHERE tx_hash = ?
    `).run(confirmedAt, gasUsed, success ? 1 : 0, txHash);
  }

  /** Get all pending UserOps for the next bundle. Ordered by insertion time. */
  getPendingOps(limit: number): UserOpRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM user_operations WHERE status = 'pending' ORDER BY id ASC LIMIT ?"
    ).all(limit) as any[];

    return rows.map(row => ({
      userOpHash: row.user_op_hash,
      sender: row.sender,
      nonce: row.nonce,
      callData: row.call_data,
      paymasterSponsored: row.paymaster_sponsored === 1,
      status: row.status,
    }));
  }

  /** Get today's daily stats. Returns zeroes if no record exists. */
  getTodayStats(): {
    date: string;
    opsReceived: number;
    opsSponsored: number;
    opsBundled: number;
    opsFailed: number;
    totalUsdcFees: number;
    bundlesSubmitted: number;
  } {
    const today = new Date().toISOString().slice(0, 10);
    const row = this.db.prepare(
      'SELECT * FROM daily_stats WHERE date = ?'
    ).get(today) as any;

    return {
      date: today,
      opsReceived: row?.ops_received ?? 0,
      opsSponsored: row?.ops_sponsored ?? 0,
      opsBundled: row?.ops_bundled ?? 0,
      opsFailed: row?.ops_failed ?? 0,
      totalUsdcFees: row?.total_usdc_fees ?? 0,
      bundlesSubmitted: row?.bundles_submitted ?? 0,
    };
  }

  /** Increment a counter column in today's daily_stats row. */
  private incrementDailyStat(column: string, amount = 1): void {
    const today = new Date().toISOString().slice(0, 10);
    this.db.prepare(`
      INSERT INTO daily_stats (date, ${column})
      VALUES (?, ?)
      ON CONFLICT(date) DO UPDATE SET ${column} = ${column} + ?
    `).run(today, amount, amount);
  }

  /** Close the database connection. Called on clean shutdown. */
  close(): void {
    this.db.close();
  }
}
