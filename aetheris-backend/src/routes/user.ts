// Aetheris\aetheris-backend\src\routes\user.ts

// Aetheris\aetheris-backend\src\routes\user.ts

import { Router, Request, Response, NextFunction } from 'express';
import { publicClient, CONTRACTS } from '../lib/viemClient';
import { isAddress, formatUnits } from 'viem';
import { AppError } from '../middleware/errorHandler';

export const userRouter = Router();

// ─── ABI fragments ────────────────────────────────────────────────────────────
// These EXACTLY match the deployed AetherisStaking.sol and ProfitDistributor.sol.
// Do not change function names without redeploying the contracts.

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * AetherisStaking.sol exposes three separate view functions for user data.
 * There is NO getStakingInfo() — that function does not exist on the contract.
 *
 * - stakedBalance(address)         → uint256  (AX, 18 decimals)
 * - getUserTier(address)           → uint8    (0=None,1=Bronze,2=Silver,3=Gold,4=Platinum)
 * - pendingRewards(address)        → uint256  (USDC, 6 decimals)
 * - getUserFeeDiscountBps(address) → uint256  (bps: 0/1000/2500/5000/10000)
 */
const STAKING_ABI = [
  {
    name: 'stakedBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getUserTier',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'pendingRewards',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getUserFeeDiscountBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * ProfitDistributor.sol — matches the contract exactly.
 */
const PROFIT_ABI = [
  {
    name: 'getUserInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'deposited',       type: 'uint256' },
      { name: 'claimableProfit', type: 'uint256' },
      { name: 'totalClaimed',    type: 'uint256' },
    ],
  },
  {
    name: 'userPoolShare',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'userAddr', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Tier enum from AetherisStaking.sol: None=0, Bronze=1, Silver=2, Gold=3, Platinum=4
const TIER_NAMES = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum'] as const;

function tierName(level: number): string {
  return TIER_NAMES[Math.min(Math.max(level, 0), TIER_NAMES.length - 1)];
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/user/:address/dashboard
 *
 * Fans out to 6 parallel contract reads and returns a single JSON object
 * matching the DashboardData interface in api.ts.
 */
userRouter.get('/:address/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    if (!isAddress(address)) throw new AppError(400, 'Invalid Ethereum address');

    const addr = address as `0x${string}`;

    const [
      axBalance,
      stakedAmount,
      tierLevel,
      pendingRewardsAmount,
      discountBps,
      userProfitInfo,
      poolShare,
    ] = await Promise.all([
      CONTRACTS.AX_TOKEN
        ? publicClient.readContract({
            address: CONTRACTS.AX_TOKEN,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [addr],
          })
        : Promise.resolve(0n),

      CONTRACTS.STAKING
        ? publicClient.readContract({
            address: CONTRACTS.STAKING,
            abi: STAKING_ABI,
            functionName: 'stakedBalance',
            args: [addr],
          })
        : Promise.resolve(0n),

      CONTRACTS.STAKING
        ? publicClient.readContract({
            address: CONTRACTS.STAKING,
            abi: STAKING_ABI,
            functionName: 'getUserTier',
            args: [addr],
          })
        : Promise.resolve(0),

      CONTRACTS.STAKING
        ? publicClient.readContract({
            address: CONTRACTS.STAKING,
            abi: STAKING_ABI,
            functionName: 'pendingRewards',
            args: [addr],
          })
        : Promise.resolve(0n),

      CONTRACTS.STAKING
        ? publicClient.readContract({
            address: CONTRACTS.STAKING,
            abi: STAKING_ABI,
            functionName: 'getUserFeeDiscountBps',
            args: [addr],
          })
        : Promise.resolve(0n),

      CONTRACTS.PROFIT_DISTRIBUTOR
        ? publicClient.readContract({
            address: CONTRACTS.PROFIT_DISTRIBUTOR,
            abi: PROFIT_ABI,
            functionName: 'getUserInfo',
            args: [addr],
          })
        : Promise.resolve([0n, 0n, 0n] as readonly [bigint, bigint, bigint]),

      CONTRACTS.PROFIT_DISTRIBUTOR
        ? publicClient.readContract({
            address: CONTRACTS.PROFIT_DISTRIBUTOR,
            abi: PROFIT_ABI,
            functionName: 'userPoolShare',
            args: [addr],
          })
        : Promise.resolve(0n),
    ]);

    const [deposited, claimableProfit, totalClaimed] =
      userProfitInfo as readonly [bigint, bigint, bigint];

    res.json({
      address,
      axToken: {
        balance:    formatUnits(axBalance as bigint, 18),
        balanceRaw: (axBalance as bigint).toString(),
      },
      staking: {
        stakedAmount:   formatUnits(stakedAmount as bigint, 18),
        tierLevel:      Number(tierLevel),
        tier:           tierName(Number(tierLevel)),
        pendingRewards: formatUnits(pendingRewardsAmount as bigint, 6),
        discountBps:    Number(discountBps),
      },
      profits: {
        deposited:    formatUnits(deposited,       6),
        claimable:    formatUnits(claimableProfit, 6),
        totalClaimed: formatUnits(totalClaimed,    6),
        poolShare:    formatUnits(poolShare as bigint, 18),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/user/:address/balance
 * Quick ETH balance check for gas estimation UI.
 */
userRouter.get('/:address/balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    if (!isAddress(address)) throw new AppError(400, 'Invalid Ethereum address');

    const ethBalance = await publicClient.getBalance({
      address: address as `0x${string}`,
    });

    res.json({
      address,
      ethBalance:    formatUnits(ethBalance, 18),
      ethBalanceWei: ethBalance.toString(),
    });
  } catch (err) {
    next(err);
  }
});