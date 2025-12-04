/**
 * Hook for Privy wallet integration
 * Provides wallet state and signing capabilities for Privy embedded wallets
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { getMovementWallet, getPrivyUserDisplayName } from "@/lib/privy-movement";
import { fundAccount, checkAccountExists } from "@/lib/faucet";
import { useNetwork } from "@/contexts/NetworkContext";
import type { SignRawHashFunction } from "@/lib/privy-transactions";

export interface UsePrivyWalletResult {
  // Whether user is authenticated with Privy and has a Movement wallet
  isPrivyWallet: boolean;
  // Whether Privy is ready
  ready: boolean;
  // Whether user is authenticated with Privy
  authenticated: boolean;
  // Privy wallet address (if connected)
  walletAddress: string | null;
  // Privy wallet public key (if connected)
  publicKey: string | null;
  // User display name (email or phone)
  displayName: string;
  // Sign raw hash function for transactions
  signRawHash: SignRawHashFunction | null;
  // Logout function
  logout: () => Promise<void>;
  // Whether account is funded and ready for transactions
  isAccountFunded: boolean;
  // Whether currently checking/funding account
  isFunding: boolean;
  // Error message if funding failed
  fundingError: string | null;
  // Manually trigger funding
  fundWallet: () => Promise<void>;
}

export function usePrivyWallet(): UsePrivyWalletResult {
  const { ready, authenticated, user, logout } = usePrivy();
  const { signRawHash } = useSignRawHash();
  const { network, config } = useNetwork();

  const [isAccountFunded, setIsAccountFunded] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);

  // Track which addresses we've already attempted to fund
  const fundedAddresses = useRef<Set<string>>(new Set());

  const wallet = getMovementWallet(user);
  const isPrivyWallet = ready && authenticated && !!wallet;
  const walletAddress = wallet?.address ?? null;

  // Function to fund the wallet
  const fundWallet = useCallback(async () => {
    if (!walletAddress || network !== "testnet") return;

    setIsFunding(true);
    setFundingError(null);

    try {
      const result = await fundAccount(walletAddress, network);
      if (result.success) {
        setIsAccountFunded(true);
        fundedAddresses.current.add(walletAddress);
        console.log("Wallet funded successfully:", result.txHash);
      } else {
        setFundingError(result.error ?? "Failed to fund wallet");
      }
    } catch (error) {
      setFundingError(error instanceof Error ? error.message : "Funding failed");
    } finally {
      setIsFunding(false);
    }
  }, [walletAddress, network]);

  // Check and auto-fund new accounts
  useEffect(() => {
    if (!isPrivyWallet || !walletAddress || network !== "testnet") {
      return;
    }

    // Skip if we've already funded/checked this address in this session
    if (fundedAddresses.current.has(walletAddress)) {
      setIsAccountFunded(true);
      return;
    }

    const checkAndFund = async () => {
      setIsFunding(true);
      setFundingError(null);

      try {
        // First check if account exists
        const exists = await checkAccountExists(walletAddress, config.rpcUrl);

        if (exists) {
          // Account already funded
          setIsAccountFunded(true);
          fundedAddresses.current.add(walletAddress);
          console.log("Privy wallet already funded:", walletAddress);
        } else {
          // Account needs funding
          console.log("Funding new Privy wallet:", walletAddress);
          const result = await fundAccount(walletAddress, network);

          if (result.success) {
            setIsAccountFunded(true);
            fundedAddresses.current.add(walletAddress);
            console.log("Privy wallet funded successfully:", result.txHash);
          } else {
            setFundingError(result.error ?? "Failed to fund wallet");
            console.error("Failed to fund Privy wallet:", result.error);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setFundingError(errorMessage);
        console.error("Error checking/funding Privy wallet:", error);
      } finally {
        setIsFunding(false);
      }
    };

    checkAndFund();
  }, [isPrivyWallet, walletAddress, network, config.rpcUrl]);

  // Reset state when wallet changes
  useEffect(() => {
    if (!walletAddress) {
      setIsAccountFunded(false);
      setFundingError(null);
    }
  }, [walletAddress]);

  return {
    isPrivyWallet,
    ready,
    authenticated,
    walletAddress,
    publicKey: wallet?.publicKey ?? null,
    displayName: getPrivyUserDisplayName(user),
    signRawHash: isPrivyWallet ? (signRawHash as SignRawHashFunction) : null,
    logout,
    isAccountFunded,
    isFunding,
    fundingError,
    fundWallet,
  };
}
