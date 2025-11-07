import { http, createConfig } from 'wagmi';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';
import type { Chain } from 'wagmi/chains';

// Arc Testnet Configuration
export const arcTestnet: Chain = {
  id: 421614, // Arc Testnet Chain ID (update with official value when available)
  name: 'Arc Testnet',
  nativeCurrency: {
    decimals: 6, // USDC has 6 decimals
    name: 'USD Coin',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.circle.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: 'https://explorer.testnet.arc.circle.com',
    },
  },
  testnet: true,
};

// Export chains array for RainbowKit
export const chains = [arcTestnet] as const;

// Wagmi v2 Config
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
    }),
    coinbaseWallet({
      appName: 'Aegis Finance',
    }),
  ],
  transports: {
    [arcTestnet.id]: http(),
  },
});
