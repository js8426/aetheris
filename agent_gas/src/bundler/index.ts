// Aetheris\agent_gas\src\bundler\index.ts

/**
 * bundler/index.ts — Main bundler loop
 *
 * Runs on a configurable interval (default: every 2 seconds on Base L2).
 * Each cycle:
 *   1. Pull up to maxBundleSize pending ops from the mempool
 *   2. Run simulateValidation on each — drop invalid ops
 *   3. Submit valid ops as a bundle to EntryPoint.handleOps()
 *   4. Update DB records with bundle status
 *   5. Alert on failures
 *
 * The bundler loop runs independently of the HTTP RPC server.
 */

import { Config } from '../config';
import { Mempool, UserOperation } from './mempool';
import { UserOpValidator } from './validator';
import { BundleSubmitter } from './submitter';
import { AgentGasDB } from '../db';
import { AlertSender } from '../alerts';

export class BundlerLoop {
  private running = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    private readonly config: Config,
    private readonly mempool: Mempool,
    private readonly validator: UserOpValidator,
    private readonly submitter: BundleSubmitter,
    private readonly db: AgentGasDB,
    private readonly alerts: AlertSender
  ) {}

  /**
   * Start the bundler loop.
   * Runs every config.bundleIntervalMs milliseconds.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => this.runCycle(), this.config.bundleIntervalMs);
    console.log(`[Bundler] Loop started: interval=${this.config.bundleIntervalMs}ms maxSize=${this.config.maxBundleSize}`);
  }

  /** Stop the bundler loop cleanly. */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.log('[Bundler] Loop stopped');
  }

  /**
   * Run a single bundle cycle.
   * Errors are caught and logged — they never crash the loop.
   */
  private async runCycle(): Promise<void> {
    try {
      const pending = this.mempool.peek(this.config.maxBundleSize);

      if (pending.length === 0) {
        // Nothing to bundle — common case, don't log at info level
        return;
      }

      console.log(`[Bundler] Cycle: ${pending.length} ops in mempool`);

      // Validate each op via simulateValidation
      const validOps: UserOperation[] = [];
      for (const entry of pending) {
        const result = await this.validator.validate(entry.op);
        if (result.valid) {
          validOps.push(entry.op);
          this.mempool.markValidated(entry.hash);
        } else {
          console.warn(`[Bundler] Dropping invalid op ${entry.hash}: ${result.reason}`);
          this.mempool.remove(entry.hash);
          this.db.updateUserOpStatus(entry.hash, 'failed');
        }
      }

      if (validOps.length === 0) {
        console.log('[Bundler] No valid ops to bundle this cycle');
        return;
      }

      console.log(`[Bundler] Submitting bundle: ${validOps.length} ops`);

      // Submit the bundle
      const submitResult = await this.submitter.submit(validOps);

      if (submitResult.success && submitResult.txHash) {
        // Record the bundle
        this.db.insertBundle({
          txHash: submitResult.txHash,
          opCount: validOps.length,
          submittedAt: Date.now(),
        });

        // Update all bundled ops
        for (const op of validOps) {
          const hash = this.mempool.computeHash(op, this.config.chainId);
          this.mempool.remove(hash);
          this.db.updateUserOpStatus(hash, 'bundled', submitResult.txHash, Date.now());
        }

        console.log(`[Bundler] Bundle successful: ${submitResult.txHash}`);
      } else {
        const err = submitResult.error ?? 'Unknown error';
        console.error(`[Bundler] Bundle failed: ${err}`);
        await this.alerts.error(`Bundle submission failed: ${err}\nOps: ${validOps.length}`);

        // Return ops to pending state (they stay in mempool for next cycle)
      }
    } catch (err) {
      console.error(`[Bundler] Cycle error: ${err}`);
    }
  }
}
