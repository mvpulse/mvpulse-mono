/**
 * Hook for PULSE/USDC swap functionality
 * Provides AMM pool interactions including swaps and liquidity management
 * Updated for dual Fungible Asset (FA) support
 */

import { useState, useCallback, useMemo } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { createAptosClient } from "@/lib/contract";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { submitPrivyTransaction } from "@/lib/privy-transactions";
import { getSwapContractAddress, COIN_TYPES, getCoinDecimals, getUsdcContractAddress } from "@/lib/tokens";
import { formatBalance } from "@/lib/balance";

// Swap module name
const SWAP_MODULE = "swap";

// Types for swap operations
export interface PoolInfo {
  pulseReserve: number;
  stableReserve: number;
  totalLpShares: number;
  feeBps: number;
  pulseReserveFormatted: string;
  stableReserveFormatted: string;
}

export interface SwapQuote {
  amountIn: number;
  amountOut: number;
  priceImpactBps: number;
  amountInFormatted: string;
  amountOutFormatted: string;
  priceImpactPercent: string;
  rate: string;
}

export interface LiquidityPosition {
  shares: number;
  poolPercentage: number;
  pulseValue: number;
  stableValue: number;
  pulseValueFormatted: string;
  stableValueFormatted: string;
}

export interface TransactionResult {
  hash: string;
  success: boolean;
}

export function useSwap() {
  const { config, network } = useNetwork();
  const { signAndSubmitTransaction, account } = useWallet();
  const {
    isPrivyWallet,
    walletAddress: privyAddress,
    publicKey: privyPublicKey,
    signRawHash,
  } = usePrivyWallet();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => createAptosClient(config), [config]);
  const swapAddress = getSwapContractAddress(network);
  const usdcMetadataAddress = getUsdcContractAddress(network);

  // Get the active wallet address (Privy or native)
  const activeAddress = isPrivyWallet ? privyAddress : account?.address?.toString();

  // Build function ID for swap contract
  const getSwapFunctionId = useCallback(
    (functionName: string): `${string}::${string}::${string}` => {
      return `${swapAddress}::${SWAP_MODULE}::${functionName}`;
    },
    [swapAddress]
  );

  // Helper function to execute transaction with dual-path support
  // Note: FA-based swap contract no longer uses type arguments
  const executeTransaction = useCallback(
    async (
      functionName: string,
      functionArguments: (string | number | boolean)[]
    ): Promise<TransactionResult> => {
      if (isPrivyWallet) {
        if (!privyAddress || !privyPublicKey || !signRawHash) {
          throw new Error("Privy wallet not properly connected");
        }

        const hash = await submitPrivyTransaction(
          client,
          privyAddress,
          privyPublicKey,
          signRawHash,
          {
            function: getSwapFunctionId(functionName),
            typeArguments: [], // FA-based swap has no type args
            functionArguments,
          }
        );

        return { hash, success: true };
      } else {
        if (!signAndSubmitTransaction) {
          throw new Error("Wallet not connected");
        }

        const response = await signAndSubmitTransaction({
          data: {
            function: getSwapFunctionId(functionName),
            typeArguments: [], // FA-based swap has no type args
            functionArguments,
          },
        });

        return { hash: response.hash, success: true };
      }
    },
    [isPrivyWallet, privyAddress, privyPublicKey, signRawHash, signAndSubmitTransaction, client, getSwapFunctionId]
  );

  // Get pool information (view function)
  const getPoolInfo = useCallback(async (): Promise<PoolInfo | null> => {
    if (!swapAddress) return null;

    try {
      const result = await client.view({
        payload: {
          function: getSwapFunctionId("get_pool_info"),
          typeArguments: [],
          functionArguments: [],
        },
      });

      if (result && result.length >= 4) {
        const pulseReserve = Number(result[0]);
        const stableReserve = Number(result[1]);
        const totalLpShares = Number(result[2]);
        const feeBps = Number(result[3]);

        return {
          pulseReserve,
          stableReserve,
          totalLpShares,
          feeBps,
          pulseReserveFormatted: formatBalance(pulseReserve, getCoinDecimals(COIN_TYPES.PULSE)),
          stableReserveFormatted: formatBalance(stableReserve, getCoinDecimals(COIN_TYPES.USDC)),
        };
      }
      return null;
    } catch (err) {
      console.error("Failed to get pool info:", err);
      return null;
    }
  }, [client, swapAddress, getSwapFunctionId]);

  // Get swap quote (view function)
  const getSwapQuote = useCallback(
    async (amountIn: number, isPulseToUsdc: boolean): Promise<SwapQuote | null> => {
      if (!swapAddress || amountIn <= 0) return null;

      try {
        const [amountOutResult, priceImpactResult] = await Promise.all([
          client.view({
            payload: {
              function: getSwapFunctionId("get_amount_out"),
              typeArguments: [],
              functionArguments: [amountIn.toString(), isPulseToUsdc],
            },
          }),
          client.view({
            payload: {
              function: getSwapFunctionId("get_price_impact"),
              typeArguments: [],
              functionArguments: [amountIn.toString(), isPulseToUsdc],
            },
          }),
        ]);

        if (amountOutResult && amountOutResult[0] !== undefined && priceImpactResult && priceImpactResult[0] !== undefined) {
          const amountOut = Number(amountOutResult[0]);
          const priceImpactBps = Number(priceImpactResult[0]);

          const inDecimals = isPulseToUsdc ? getCoinDecimals(COIN_TYPES.PULSE) : getCoinDecimals(COIN_TYPES.USDC);
          const outDecimals = isPulseToUsdc ? getCoinDecimals(COIN_TYPES.USDC) : getCoinDecimals(COIN_TYPES.PULSE);

          // Calculate rate (how much out per 1 in)
          const inAmount = amountIn / Math.pow(10, inDecimals);
          const outAmount = amountOut / Math.pow(10, outDecimals);
          const rate = inAmount > 0 ? (outAmount / inAmount).toFixed(6) : "0";

          return {
            amountIn,
            amountOut,
            priceImpactBps,
            amountInFormatted: formatBalance(amountIn, inDecimals),
            amountOutFormatted: formatBalance(amountOut, outDecimals),
            priceImpactPercent: (priceImpactBps / 100).toFixed(2),
            rate,
          };
        }
        return null;
      } catch (err) {
        console.error("Failed to get swap quote:", err);
        return null;
      }
    },
    [client, swapAddress, getSwapFunctionId]
  );

  // Get LP position for an address (view function)
  const getLpPosition = useCallback(
    async (address?: string): Promise<LiquidityPosition | null> => {
      const targetAddress = address || activeAddress;
      if (!swapAddress || !targetAddress) return null;

      try {
        const [lpResult, poolInfo] = await Promise.all([
          client.view({
            payload: {
              function: getSwapFunctionId("get_lp_position"),
              typeArguments: [],
              functionArguments: [targetAddress],
            },
          }),
          getPoolInfo(),
        ]);

        if (lpResult && lpResult[0] !== undefined && poolInfo) {
          const shares = Number(lpResult[0]);
          const poolPercentage = poolInfo.totalLpShares > 0 ? (shares / poolInfo.totalLpShares) * 100 : 0;
          const pulseValue = poolInfo.totalLpShares > 0 ? Math.floor((poolInfo.pulseReserve * shares) / poolInfo.totalLpShares) : 0;
          const stableValue = poolInfo.totalLpShares > 0 ? Math.floor((poolInfo.stableReserve * shares) / poolInfo.totalLpShares) : 0;

          return {
            shares,
            poolPercentage,
            pulseValue,
            stableValue,
            pulseValueFormatted: formatBalance(pulseValue, getCoinDecimals(COIN_TYPES.PULSE)),
            stableValueFormatted: formatBalance(stableValue, getCoinDecimals(COIN_TYPES.USDC)),
          };
        }

        // User has no LP position
        return {
          shares: 0,
          poolPercentage: 0,
          pulseValue: 0,
          stableValue: 0,
          pulseValueFormatted: "0.0000",
          stableValueFormatted: "0.0000",
        };
      } catch (err) {
        console.error("Failed to get LP position:", err);
        return null;
      }
    },
    [client, swapAddress, activeAddress, getSwapFunctionId, getPoolInfo]
  );

  // Get spot price (view function)
  // Returns PULSE per Stablecoin (how many PULSE you get for 1 USDC)
  const getSpotPrice = useCallback(
    async (): Promise<number | null> => {
      if (!swapAddress) return null;

      try {
        const result = await client.view({
          payload: {
            function: getSwapFunctionId("get_spot_price"),
            typeArguments: [],
            functionArguments: [],
          },
        });

        if (result && result[0] !== undefined) {
          // Price is returned scaled by 1e8
          return Number(result[0]) / 1e8;
        }
        return null;
      } catch (err) {
        console.error("Failed to get spot price:", err);
        return null;
      }
    },
    [client, swapAddress, getSwapFunctionId]
  );

  // Swap PULSE to USDC (FA-based)
  const swapPulseToUsdc = useCallback(
    async (pulseAmount: number, minUsdcOut: number): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!usdcMetadataAddress) {
          throw new Error("USDC not configured for this network");
        }

        return await executeTransaction(
          "swap_pulse_to_stable",
          [pulseAmount.toString(), minUsdcOut.toString()]
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to swap";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, usdcMetadataAddress]
  );

  // Swap USDC to PULSE (FA-based)
  const swapUsdcToPulse = useCallback(
    async (usdcAmount: number, minPulseOut: number): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!usdcMetadataAddress) {
          throw new Error("USDC not configured for this network");
        }

        return await executeTransaction(
          "swap_stable_to_pulse",
          [usdcAmount.toString(), minPulseOut.toString()]
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to swap";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, usdcMetadataAddress]
  );

  // Add liquidity to the pool (FA-based)
  const addLiquidity = useCallback(
    async (pulseAmount: number, usdcAmount: number, minLpShares: number): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!usdcMetadataAddress) {
          throw new Error("USDC not configured for this network");
        }

        return await executeTransaction(
          "add_liquidity",
          [pulseAmount.toString(), usdcAmount.toString(), minLpShares.toString()]
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add liquidity";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, usdcMetadataAddress]
  );

  // Remove liquidity from the pool (FA-based)
  const removeLiquidity = useCallback(
    async (lpShares: number, minPulseOut: number, minUsdcOut: number): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!usdcMetadataAddress) {
          throw new Error("USDC not configured for this network");
        }

        return await executeTransaction(
          "remove_liquidity",
          [lpShares.toString(), minPulseOut.toString(), minUsdcOut.toString()]
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to remove liquidity";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, usdcMetadataAddress]
  );

  return {
    // State
    loading,
    error,
    swapAddress,
    activeAddress,
    usdcMetadataAddress, // Expose for initialization

    // Read functions
    getPoolInfo,
    getSwapQuote,
    getLpPosition,
    getSpotPrice,

    // Write functions
    swapPulseToUsdc,
    swapUsdcToPulse,
    addLiquidity,
    removeLiquidity,
  };
}
