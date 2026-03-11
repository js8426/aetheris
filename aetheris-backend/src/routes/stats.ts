// Aetheris\aetheris-backend\src\routes\stats.ts

import { Router, Request, Response, NextFunction } from 'express';
import { publicClient } from '../lib/viemClient';
import { logger } from '../utils/logger';

export const statsRouter = Router();

// Simple in-memory cache (use Redis in production)
let cachedStats: object | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * GET /api/v1/stats/protocol
 * Protocol-wide statistics for the homepage
 */
statsRouter.get('/protocol', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = Date.now();

    if (cachedStats && now - cacheTimestamp < CACHE_TTL) {
      return res.json(cachedStats);
    }

    const [blockNumber, chainId] = await Promise.all([
      publicClient.getBlockNumber(),
      publicClient.getChainId(),
    ]);

    const stats = {
      blockchain: {
        network: chainId === 8453 ? 'Base Mainnet' : 'Base Sepolia Testnet',
        chainId,
        latestBlock: blockNumber.toString(),
        rpcStatus: 'online',
      },
      protocol: {
        totalUsers: 0,          // Will be populated post-deployment
        tvlUSDC: '0',
        totalArbitrageProfit: '0',
        totalTransactions: 0,
        uptimePercent: 99.9,
      },
      timestamp: new Date().toISOString(),
    };

    cachedStats = stats;
    cacheTimestamp = now;

    res.json(stats);
  } catch (err) {
    logger.error('Stats fetch failed:', err);
    next(err);
  }
});