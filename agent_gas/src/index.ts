// Aetheris/agent_gas\src\index.ts

/**
 * index.ts — Aetheris Agent Gas entry point
 *
 * Starts:
 *   1. HTTP server (bundler RPC + paymaster RPC)
 *   2. Bundler loop (batches UserOps every 2s)
 *   3. Daily summary scheduler (midnight UTC)
 *   4. SIGTERM handler for clean PM2 shutdown
 */

import 'dotenv/config';
import express from 'express';

import { loadConfig } from './config';
import { AgentGasDB } from './db';
import { AlertSender } from './alerts';
import { Mempool } from './bundler/mempool';
import { UserOpValidator } from './bundler/validator';
import { BundleSubmitter } from './bundler/submitter';
import { BundlerLoop } from './bundler';
import { createBundlerRouter } from './bundler/rpc';
import {
  SponsorshipPolicy,
  PaymasterSigner,
  createPaymasterRouter,
} from './paymaster';
import { GasEstimator } from './gas/estimator';
import { GasPricer } from './gas/pricer';

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════');
  console.log('  Aetheris Agent Gas — ERC-4337 Bundler v0.1.0 ');
  console.log('  Network: Base Mainnet (Chain ID 8453)         ');
  console.log('═══════════════════════════════════════════════');

  // Load and validate configuration
  let config;
  try {
    config = loadConfig();
    console.log(`[Config] Loaded. Bundler: ${config.bundlerAddress}`);
    console.log(`[Config] Paymaster signer: ${config.paymasterSignerAddress}`);
    console.log(`[Config] EntryPoint: ${config.entryPointAddr}`);
  } catch (err) {
    console.error(`[Config] Error: ${err}`);
    console.error('Make sure .env is populated. See .env.example for required fields.');
    process.exit(1);
  }

  // Open database
  const db = new AgentGasDB(config.dbPath);

  // Build shared services
  const alerts = new AlertSender(config);
  const mempool = new Mempool();
  const pricer = new GasPricer(config);
  const estimator = new GasEstimator(config);
  const policy = new SponsorshipPolicy(config);
  const signer = new PaymasterSigner(config);
  const validator = new UserOpValidator(config);
  const submitter = new BundleSubmitter(config, pricer);

  // Build bundler loop
  const bundlerLoop = new BundlerLoop(config, mempool, validator, submitter, db, alerts);

  // Build Express app
  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    const stats = db.getTodayStats();
    res.json({
      status: 'ok',
      mempoolSize: mempool.size(),
      todayStats: stats,
    });
  });

  // ERC-4337 Bundler JSON-RPC endpoint (eth_* methods)
  app.use('/rpc', createBundlerRouter(config, mempool, db, alerts));

  // Paymaster JSON-RPC endpoint (pm_* methods)
  app.use('/paymaster', createPaymasterRouter(config, db, policy, signer, estimator, pricer));

  // Start HTTP server
  const server = app.listen(config.port, () => {
    console.log(`[Server] HTTP server listening on port ${config.port}`);
    console.log(`[Server] Bundler RPC: POST http://localhost:${config.port}/rpc`);
    console.log(`[Server] Paymaster:   POST http://localhost:${config.port}/paymaster`);
  });

  // Start bundler loop
  bundlerLoop.start();

  // Start daily summary scheduler
  scheduleDailySummary(db, alerts);

  // Notify startup
  await alerts.info(
    `🟢 Agent Gas started.\n` +
    `Bundler: ${config.bundlerAddress}\n` +
    `Paymaster signer: ${config.paymasterSignerAddress}\n` +
    `Port: ${config.port}`
  );

  // SIGTERM / SIGINT handler for clean PM2 shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[Shutdown] ${signal} received — stopping cleanly`);
    bundlerLoop.stop();
    server.close();
    await alerts.warning(`⚠️ Agent Gas shutting down (${signal} received)`);
    db.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

/**
 * Schedule the daily summary report at midnight UTC.
 * Uses setTimeout to recalculate the delay each day.
 */
function scheduleDailySummary(db: AgentGasDB, alerts: AlertSender): void {
  const scheduleNext = (): void => {
    const now = new Date();
    const nextMidnight = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0
    ));
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    setTimeout(async () => {
      const stats = db.getTodayStats();
      const message =
        `Date: ${stats.date}\n` +
        `Ops received: ${stats.opsReceived}\n` +
        `Ops sponsored: ${stats.opsSponsored}\n` +
        `Ops bundled: ${stats.opsBundled}\n` +
        `Ops failed: ${stats.opsFailed}\n` +
        `Total USDC fees: ${stats.totalUsdcFees / 1_000_000} USDC\n` +
        `Bundles submitted: ${stats.bundlesSubmitted}`;

      await alerts.dailySummary(message);

      // Schedule the next day's summary
      scheduleNext();
    }, msUntilMidnight);
  };

  scheduleNext();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
