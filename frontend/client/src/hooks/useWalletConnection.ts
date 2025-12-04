/**
 * Hook that combines native wallet and Privy wallet connection states
 * Use this instead of checking `connected` from useWallet directly
 */

import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";

export interface UseWalletConnectionResult {
  // Whether any wallet is connected (native OR Privy)
  isConnected: boolean;
  // The active wallet address (Privy takes priority if both connected)
  address: string | null;
  // Whether using Privy wallet
  isPrivyWallet: boolean;
  // Whether using native wallet
  isNativeWallet: boolean;
}

export function useWalletConnection(): UseWalletConnectionResult {
  const { connected, account } = useWallet();
  const { isPrivyWallet, walletAddress: privyAddress } = usePrivyWallet();

  const isNativeWallet = connected && !isPrivyWallet;
  const isConnected = isPrivyWallet || isNativeWallet;

  // Privy wallet takes priority if both are somehow connected
  const address = isPrivyWallet
    ? privyAddress
    : isNativeWallet
    ? account?.address?.toString() ?? null
    : null;

  return {
    isConnected,
    address,
    isPrivyWallet,
    isNativeWallet,
  };
}
