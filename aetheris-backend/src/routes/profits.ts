// Aetheris\aetheris-backend\src\routes\profits.ts

import { Router, Request, Response, NextFunction } from 'express';
import { publicClient, CONTRACTS } from '../lib/viemClient';
import { isAddress, formatUnits } from 'viem';
import { AppError } from '../middleware/errorHandler';

export const profitRouter = Router();

const PROFIT_ABI = [
  { name: 'getUserInfo', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'deposited', type: 'uint256' },
      { name: 'claimableProfit', type: 'uint256' },
      { name: 'totalClaimed', type: 'uint256' },
    ] },
  { name: 'totalValueLocked', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalProfitDistributed', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

/**
 * GET /api/v1/profits/:address
 */
profitRouter.get('/:address', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    if (!isAddress(address)) throw new AppError(400, 'Invalid address');

    const addr = address as `0x${string}`;

    if (!CONTRACTS.PROFIT_DISTRIBUTOR) {
      return res.json({ address, deposited: '0', claimable: '0', totalClaimed: '0' });
    }

    const result = await publicClient.readContract({
      address: CONTRACTS.PROFIT_DISTRIBUTOR,
      abi: PROFIT_ABI,
      functionName: 'getUserInfo',
      args: [addr],
    }) as [bigint, bigint, bigint];

    res.json({
      address,
      deposited: formatUnits(result[0], 6),
      claimable: formatUnits(result[1], 6),
      totalClaimed: formatUnits(result[2], 6),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/profits/protocol/stats
 */
profitRouter.get('/protocol/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!CONTRACTS.PROFIT_DISTRIBUTOR) {
      return res.json({ tvl: '0', totalDistributed: '0' });
    }

    const [tvl, distributed] = await Promise.all([
      publicClient.readContract({ address: CONTRACTS.PROFIT_DISTRIBUTOR, abi: PROFIT_ABI, functionName: 'totalValueLocked' }),
      publicClient.readContract({ address: CONTRACTS.PROFIT_DISTRIBUTOR, abi: PROFIT_ABI, functionName: 'totalProfitDistributed' }),
    ]);

    res.json({
      tvl: formatUnits(tvl as bigint, 6),
      totalDistributed: formatUnits(distributed as bigint, 6),
    });
  } catch (err) {
    next(err);
  }
});