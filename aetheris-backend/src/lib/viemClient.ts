// Aetheris\aetheris-backend\src\lib\viemClient.ts

import { createPublicClient, createWalletClient, http, type PublicClient } from 'viem';
import { base, baseSepolia } from 'viem/chains';

const isProduction = process.env.NODE_ENV === 'production';

export const publicClient: PublicClient = createPublicClient({
  chain: isProduction ? base : baseSepolia,
  transport: http(
    isProduction
      ? process.env.BASE_MAINNET_RPC || 'https://mainnet.base.org'
      : process.env.BASE_TESTNET_RPC || 'https://sepolia.base.org'
  ),
});

export const CONTRACTS = {
  AX_TOKEN: process.env.AX_TOKEN_ADDRESS as `0x${string}`,
  STAKING: process.env.STAKING_CONTRACT_ADDRESS as `0x${string}`,
  PAYMASTER: process.env.PAYMASTER_ADDRESS as `0x${string}`,
  ACCOUNT_FACTORY: process.env.ACCOUNT_FACTORY_ADDRESS as `0x${string}`,
  AGENT_ALPHA: process.env.AGENT_ALPHA_ADDRESS as `0x${string}`,
  PROFIT_DISTRIBUTOR: process.env.PROFIT_DISTRIBUTOR_ADDRESS as `0x${string}`,
};