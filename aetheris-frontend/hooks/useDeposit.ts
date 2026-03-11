// Aetheris\aetheris-frontend\hooks\useDeposit.ts

import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits } from 'viem';
import { useState, useCallback } from 'react';
import { getContracts, USDC_ABI, PROFIT_DISTRIBUTOR_ABI } from '@/lib/contracts';
import { useQueryClient } from '@tanstack/react-query';

export type DepositStep = 'idle' | 'approving' | 'approval-pending' | 'depositing' | 'deposit-pending' | 'success' | 'error';

/**
 * Two-step USDC deposit flow:
 *   1. Approve USDC spend
 *   2. Deposit into ProfitDistributor
 */
export function useDeposit() {
  const { address } = useAccount();
  const chainId = useChainId();
  const contracts = getContracts(chainId);
  const queryClient = useQueryClient();

  const [step, setStep] = useState<DepositStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  // Read current USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: contracts.USDC,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: address ? [address, contracts.PROFIT_DISTRIBUTOR] : undefined,
    query: { enabled: !!address },
  });

  // Read USDC balance
  const { data: usdcBalance } = useReadContract({
    address: contracts.USDC,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync } = useWriteContract();

  const deposit = useCallback(async (depositAmount: string) => {
    if (!address) return;
    setError(null);
    setAmount(depositAmount);

    try {
      const amountParsed = parseUnits(depositAmount, 6); // USDC = 6 decimals
      const currentAllowance = (allowance as bigint) ?? 0n;

      // Step 1: Approve if needed
      if (currentAllowance < amountParsed) {
        setStep('approving');
        const approveTx = await writeContractAsync({
          address: contracts.USDC,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [contracts.PROFIT_DISTRIBUTOR, amountParsed],
        });
        setStep('approval-pending');
        // Wait for approval to be mined (handled by UI using approvalHash)
        void approveTx;
        await refetchAllowance();
      }

      // Step 2: Deposit
      setStep('depositing');
      await writeContractAsync({
        address: contracts.PROFIT_DISTRIBUTOR,
        abi: PROFIT_DISTRIBUTOR_ABI,
        functionName: 'deposit',
        args: [amountParsed],
      });

      setStep('deposit-pending');

      // Invalidate dashboard cache so it refreshes
      await queryClient.invalidateQueries({ queryKey: ['aetheris-user', address] });
      setStep('success');
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || 'Transaction failed');
      setStep('error');
    }
  }, [address, allowance, contracts, writeContractAsync, refetchAllowance, queryClient]);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setAmount('');
  }, []);

  return {
    deposit,
    reset,
    step,
    error,
    amount,
    usdcBalance: usdcBalance ? (usdcBalance as bigint) : 0n,
    isLoading: ['approving', 'approval-pending', 'depositing', 'deposit-pending'].includes(step),
    isSuccess: step === 'success',
    isError: step === 'error',
  };
}