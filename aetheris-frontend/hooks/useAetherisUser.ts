// Aetheris\aetheris-frontend\hooks\useAetherisUser.ts

import { useAccount, useChainId } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { aetherisApi, type DashboardData } from '@/lib/api';

/**
 * Master hook — fetches all user data in one shot from the backend.
 * Use this on the main dashboard page.
 */
export function useAetherisUser() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const query = useQuery<DashboardData, Error>({
    queryKey: ['aetheris-user', address, chainId],
    queryFn: () => aetherisApi.getUserDashboard(address!),
    enabled: !!address && isConnected,
    staleTime: 30_000,
    refetchInterval: 60_000, // auto-refresh every minute
  });

  return {
    ...query,
    address,
    isConnected,
    // Convenience accessors
    axBalance:       query.data?.axToken.balance       ?? '0',
    stakingTier:     query.data?.staking.tier          ?? 'Base',
    stakedAmount:    query.data?.staking.stakedAmount  ?? '0',
    stakingRewards:  query.data?.staking.pendingRewards ?? '0',
    depositedUSDC:   query.data?.profits.deposited     ?? '0',
    claimableProfit: query.data?.profits.claimable     ?? '0',
    totalClaimed:    query.data?.profits.totalClaimed  ?? '0',
  };
}