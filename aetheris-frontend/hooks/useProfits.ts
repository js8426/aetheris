// etheris\aetheris-frontend\hooks\useProfits.ts

import { useAccount, useChainId, useWriteContract, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { getContracts, PROFIT_DISTRIBUTOR_ABI } from '@/lib/contracts';

export function useProfits() {
  const { address } = useAccount();
  const chainId = useChainId();
  const contracts = getContracts(chainId);
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();

  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);

  const { data: userInfo, refetch } = useReadContract({
    address: contracts.PROFIT_DISTRIBUTOR,
    abi: PROFIT_DISTRIBUTOR_ABI,
    functionName: 'getUserInfo',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const { data: tvl } = useReadContract({
    address: contracts.PROFIT_DISTRIBUTOR,
    abi: PROFIT_DISTRIBUTOR_ABI,
    functionName: 'totalValueLocked',
    query: { staleTime: 60_000 },
  });

  const { data: totalDistributed } = useReadContract({
    address: contracts.PROFIT_DISTRIBUTOR,
    abi: PROFIT_DISTRIBUTOR_ABI,
    functionName: 'totalProfitDistributed',
    query: { staleTime: 60_000 },
  });

  const claim = useCallback(async () => {
    if (!address) return;
    setIsClaiming(true);
    setClaimError(null);
    setClaimSuccess(false);
    try {
      await writeContractAsync({
        address: contracts.PROFIT_DISTRIBUTOR,
        abi: PROFIT_DISTRIBUTOR_ABI,
        functionName: 'claimProfit',
      });
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['aetheris-user', address] });
      setClaimSuccess(true);
    } catch (err: any) {
      setClaimError(err?.shortMessage || err?.message || 'Claim failed');
    } finally {
      setIsClaiming(false);
    }
  }, [address, contracts, writeContractAsync, refetch, queryClient]);

  const [deposited, claimable, claimed] = userInfo
    ? (userInfo as [bigint, bigint, bigint])
    : [0n, 0n, 0n];

  return {
    deposited:        formatUnits(deposited,  6),
    claimable:        formatUnits(claimable,  6),
    totalClaimed:     formatUnits(claimed,    6),
    tvl:              tvl ? formatUnits(tvl as bigint, 6) : '0',
    totalDistributed: totalDistributed ? formatUnits(totalDistributed as bigint, 6) : '0',
    claim,
    isClaiming,
    claimError,
    claimSuccess,
    hasClaimable: claimable > 0n,
  };
}