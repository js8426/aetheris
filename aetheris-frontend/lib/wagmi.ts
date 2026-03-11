// Aetheris\aetheris-frontend\lib\wagmi.ts

import { http, createConfig } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors';

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'YOUR_WALLETCONNECT_PROJECT_ID';

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'Aetheris Protocol' }),
    walletConnect({ projectId: WC_PROJECT_ID }),
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC || 'https://mainnet.base.org'),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_TESTNET_RPC || 'https://sepolia.base.org'),
  },
  ssr: true, // Required for Next.js
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}