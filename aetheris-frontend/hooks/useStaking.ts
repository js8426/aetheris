// Aetheris\aetheris-frontend\hooks\useStaking.ts
// Fixed to match AetherisStaking.sol's actual function signatures.
// The contract has NO getStakingInfo(). Reads use three separate calls.

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useAccount, useChainId } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { getContracts, STAKING_ABI, AX_TOKEN_ABI } from '@/lib/contracts';
import { useState } from 'react';

// Tier enum mirrors AetherisStaking.sol: None=0, Bronze=1, Silver=2, Gold=3, Platinum=4
export const TIER_NAMES   = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum'] as const;
export const TIER_LABELS  = ['BASE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;

export type TierName = typeof TIER_NAMES[number];

export function useStaking() {
  const { address } = useAccount();
  const chainId     = useChainId();
  const contracts   = getContracts(chainId);

  const commonArgs = {
    address: contracts.STAKING,
    enabled: !!address,
  } as const;

  // ── Read: staked balance ──────────────────────────────────────────────────
  const { data: stakedRaw, refetch: refetchStaked } = useReadContract({
    ...commonArgs,
    abi:          STAKING_ABI,
    functionName: 'stakedBalance',
    args:         address ? [address] : undefined,
  });

  // ── Read: tier (uint8 enum) ───────────────────────────────────────────────
  const { data: tierRaw, refetch: refetchTier } = useReadContract({
    ...commonArgs,
    abi:          STAKING_ABI,
    functionName: 'getUserTier',
    args:         address ? [address] : undefined,
  });

  // ── Read: pending USDC rewards ────────────────────────────────────────────
  const { data: rewardsRaw, refetch: refetchRewards } = useReadContract({
    ...commonArgs,
    abi:          STAKING_ABI,
    functionName: 'pendingRewards',
    args:         address ? [address] : undefined,
  });

  // ── Read: fee discount in basis points ────────────────────────────────────
  const { data: discountBpsRaw } = useReadContract({
    ...commonArgs,
    abi:          STAKING_ABI,
    functionName: 'getUserFeeDiscountBps',
    args:         address ? [address] : undefined,
  });

  // ── Read: AX token allowance for staking contract ────────────────────────
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address:      contracts.AX_TOKEN,
    abi:          AX_TOKEN_ABI,
    functionName: 'allowance',
    args:         address ? [address, contracts.STAKING] : undefined,
    enabled:      !!address,
  });

  // ── Write ─────────────────────────────────────────────────────────────────
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  function refetchAll() {
    refetchStaked();
    refetchTier();
    refetchRewards();
    refetchAllowance();
  }

  // ── Approve AX for staking ────────────────────────────────────────────────
  async function approve(amount: string) {
    const hash = await writeContractAsync({
      address:      contracts.AX_TOKEN,
      abi:          AX_TOKEN_ABI,
      functionName: 'approve',
      args:         [contracts.STAKING, parseUnits(amount, 18)],
    });
    setTxHash(hash);
    return hash;
  }

  // ── Stake ─────────────────────────────────────────────────────────────────
  async function stake(amount: string) {
    const hash = await writeContractAsync({
      address:      contracts.STAKING,
      abi:          STAKING_ABI,
      functionName: 'stake',
      args:         [parseUnits(amount, 18)],
    });
    setTxHash(hash);
    return hash;
  }

  // ── Unstake ───────────────────────────────────────────────────────────────
  async function unstake(amount: string) {
    const hash = await writeContractAsync({
      address:      contracts.STAKING,
      abi:          STAKING_ABI,
      functionName: 'unstake',
      args:         [parseUnits(amount, 18)],
    });
    setTxHash(hash);
    return hash;
  }

  // ── Claim rewards ─────────────────────────────────────────────────────────
  async function claimRewards() {
    const hash = await writeContractAsync({
      address:      contracts.STAKING,
      abi:          STAKING_ABI,
      functionName: 'claimRewards',
    });
    setTxHash(hash);
    return hash;
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const tierLevel    = Number(tierRaw ?? 0);                              // 0–4
  const tierName     = TIER_NAMES[tierLevel]  ?? 'None';
  const tierLabel    = TIER_LABELS[tierLevel] ?? 'BASE';
  const stakedAmount = stakedRaw ? formatUnits(stakedRaw as bigint, 18) : '0';
  const pendingRewards = rewardsRaw ? formatUnits(rewardsRaw as bigint, 6) : '0';
  const discountBps  = Number(discountBpsRaw ?? 0);
  const allowance    = allowanceRaw as bigint ?? 0n;

  return {
    // Data
    stakedAmount,
    tierLevel,
    tierName,
    tierLabel,
    pendingRewards,
    discountBps,
    allowance,

    // Actions
    approve,
    stake,
    unstake,
    claimRewards,
    refetchAll,

    // TX state
    isWritePending,
    isConfirming,
    isConfirmed,
    txHash,
  };
}