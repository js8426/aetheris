// Aetheris\aetheris-frontend\hooks\useAgentV.ts

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { aetherisApi } from '@/lib/api';

/**
 * Agent V is primarily an off-chain monitoring service.
 * We query status from the backend API, not directly on-chain.
 */
export function useAgentV() {
  const { address, isConnected } = useAccount();

  const { data: globalStatus, isLoading: globalLoading } = useQuery({
    queryKey: ['agent-v-global'],
    queryFn: aetherisApi.getGlobalAgentStatus,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: userStatus } = useQuery({
    queryKey: ['agent-v-user', address],
    queryFn: () => aetherisApi.getAgentStatus(address!),
    enabled: !!address && isConnected,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  return {
    // Global
    isActive:            globalStatus?.agentV?.active ?? false,
    threatLevel:         globalStatus?.agentV?.threatLevel ?? 'UNKNOWN',
    monitoredContracts:  globalStatus?.agentV?.monitoredContracts ?? 0,
    lastScan:            globalStatus?.agentV?.lastScanTimestamp ?? null,
    isLoading:           globalLoading,
    // Per-user
    isProtecting:        userStatus?.agentV?.active ?? false,
    protectedSince:      userStatus?.agentV?.protectedSince ?? null,
  };
}
