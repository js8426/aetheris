// Aetheris\aetheris-frontend\hooks\useTransactions.ts

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { aetherisApi, type Transaction } from '@/lib/api';

export function useTransactions(limit = 20) {
  const { address, isConnected } = useAccount();

  const query = useQuery({
    queryKey: ['transactions', address, limit],
    queryFn: () => aetherisApi.getTransactions(address!, limit),
    enabled: !!address && isConnected,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const formatTx = (tx: Transaction) => ({
    ...tx,
    label: tx.type === 'DEPOSIT' ? 'Deposited' : tx.type === 'WITHDRAWAL' ? 'Withdrew' : 'Claimed Profit',
    sign:  tx.type === 'DEPOSIT' ? '+' : tx.type === 'WITHDRAWAL' ? '-' : '+',
    color: tx.type === 'WITHDRAWAL' ? 'text-red-400' : 'text-green-400',
  });

  return {
    ...query,
    transactions: (query.data?.transactions ?? []).map(formatTx),
    total: query.data?.total ?? 0,
  };
}