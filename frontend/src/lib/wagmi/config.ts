import { http, createConfig } from "wagmi";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";

// Arc Testnet Configuration (Wagmi v2 + Viem)
export const arcTestnet = defineChain({
  id: 421614, // Arc Testnet Chain ID (update with official value)
  name: "Arc Testnet",
  network: "arc-testnet",
  nativeCurrency: {
    decimals: 6, // USDC has 6 decimals!
    name: "USD Coin",
    symbol: "USDC",
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.circle.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: "https://explorer.testnet.arc.circle.com",
    },
  },
  testnet: true,
});

// Wagmi v2 Configuration
export const wagmiConfig = getDefaultConfig({
  appName: "Aegis Finance",
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
});

export const chains = [arcTestnet];

