// Aetheris\aetheris-frontend\hooks\useAgentAlpha.ts

import { useAccount, useChainId, useWriteContract, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { getContracts, AGENT_ALPHA_ABI } from '@/lib/contracts';

export function useAgentAlpha() {
  const { address } = useAccount();
  const chainId = useChainId();
  const contracts = getContracts(chainId);
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();

  const [isToggling, setIsToggling] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const { data: isUserActive, refetch } = useReadContract({
    address: contracts.AGENT_ALPHA,
    abi: AGENT_ALPHA_ABI,
    functionName: 'isUserActive',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const { data: isGloballyActive } = useReadContract({
    address: contracts.AGENT_ALPHA,
    abi: AGENT_ALPHA_ABI,
    functionName: 'isActive',
    query: { refetchInterval: 30_000 },
  });

  const { data: totalProfit } = useReadContract({
    address: contracts.AGENT_ALPHA,
    abi: AGENT_ALPHA_ABI,
    functionName: 'getTotalArbitrageProfit',
    query: { staleTime: 60_000 },
  });

  const activate = useCallback(async () => {
    if (!address) return;
    setIsToggling(true);
    setTxError(null);
    try {
      await writeContractAsync({
        address: contracts.AGENT_ALPHA,
        abi: AGENT_ALPHA_ABI,
        functionName: 'activateForUser',
      });
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['aetheris-user', address] });
    } catch (err: any) {
      setTxError(err?.shortMessage || err?.message || 'Activation failed');
    } finally {
      setIsToggling(false);
    }
  }, [address, contracts, writeContractAsync, refetch, queryClient]);

  const deactivate = useCallback(async () => {
    if (!address) return;
    setIsToggling(true);
    setTxError(null);
    try {
      await writeContractAsync({
        address: contracts.AGENT_ALPHA,
        abi: AGENT_ALPHA_ABI,
        functionName: 'deactivateForUser',
      });
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['aetheris-user', address] });
    } catch (err: any) {
      setTxError(err?.shortMessage || err?.message || 'Deactivation failed');
    } finally {
      setIsToggling(false);
    }
  }, [address, contracts, writeContractAsync, refetch, queryClient]);

  const toggle = isUserActive ? deactivate : activate;

  return {
    isUserActive:      !!(isUserActive as boolean),
    isGloballyActive:  !!(isGloballyActive as boolean),
    totalProtocolProfit: totalProfit ? formatUnits(totalProfit as bigint, 6) : '0',
    activate,
    deactivate,
    toggle,
    isToggling,
    txError,
  };
}