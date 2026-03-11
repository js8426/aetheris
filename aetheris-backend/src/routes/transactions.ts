// Aetheris\aetheris-backend\src\routes\transactions.ts

import { Router, Request, Response, NextFunction } from 'express';
import { publicClient, CONTRACTS } from '../lib/viemClient';
import { isAddress, parseAbiItem } from 'viem';
import { AppError } from '../middleware/errorHandler';

export const transactionRouter = Router();

/**
 * GET /api/v1/transactions/:address?limit=20&page=1
 * Fetch recent transaction events for a user
 */
transactionRouter.get('/:address', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    if (!isAddress(address)) throw new AppError(400, 'Invalid address');

    // Get block range (last ~7 days on Base ~2s blocks = ~302400 blocks)
    const latestBlock = await publicClient.getBlockNumber();
    const fromBlock = latestBlock > 302400n ? latestBlock - 302400n : 0n;

    const addr = address as `0x${string}`;
    const txHistory: object[] = [];

    // Fetch deposit/withdrawal events from ProfitDistributor
    if (CONTRACTS.PROFIT_DISTRIBUTOR) {
      try {
        const depositLogs = await publicClient.getLogs({
          address: CONTRACTS.PROFIT_DISTRIBUTOR,
          event: parseAbiItem('event Deposited(address indexed user, uint256 amount)'),
          args: { user: addr },
          fromBlock,
          toBlock: 'latest',
        });

        const withdrawLogs = await publicClient.getLogs({
          address: CONTRACTS.PROFIT_DISTRIBUTOR,
          event: parseAbiItem('event Withdrawn(address indexed user, uint256 amount)'),
          args: { user: addr },
          fromBlock,
          toBlock: 'latest',
        });

        const claimLogs = await publicClient.getLogs({
          address: CONTRACTS.PROFIT_DISTRIBUTOR,
          event: parseAbiItem('event ProfitClaimed(address indexed user, uint256 amount)'),
          args: { user: addr },
          fromBlock,
          toBlock: 'latest',
        });

        for (const log of depositLogs) {
          txHistory.push({
            type: 'DEPOSIT',
            amount: ((log.args as any).amount / BigInt(1e6)).toString(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber?.toString(),
          });
        }
        for (const log of withdrawLogs) {
          txHistory.push({
            type: 'WITHDRAWAL',
            amount: ((log.args as any).amount / BigInt(1e6)).toString(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber?.toString(),
          });
        }
        for (const log of claimLogs) {
          txHistory.push({
            type: 'CLAIM',
            amount: ((log.args as any).amount / BigInt(1e6)).toString(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber?.toString(),
          });
        }
      } catch (_e) {
        // Contract not yet deployed, return empty
      }
    }

    // Sort by blockNumber desc and limit
    txHistory.sort((a: any, b: any) => Number(b.blockNumber) - Number(a.blockNumber));

    res.json({
      address,
      transactions: txHistory.slice(0, limit),
      total: txHistory.length,
    });
  } catch (err) {
    next(err);
  }
});