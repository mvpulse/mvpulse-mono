/**
 * Hook for fetching user's claim status across all polls
 * Uses Movement Indexer when optimization is enabled
 * Falls back to RPC calls when disabled
 */

import { useQuery } from "@tanstack/react-query";
import { useNetwork } from "@/contexts/NetworkContext";
import { useContract } from "@/hooks/useContract";
import { isIndexerOptimizationEnabled } from "@/lib/feature-flags";
import { fetchUserClaimedPolls } from "@/lib/indexer-queries";

const CACHE_STALE_TIME = 60000; // 60 seconds

/**
 * Hook for getting all poll IDs that a user has claimed rewards from
 * When indexer optimization is enabled:
 * - Uses a single GraphQL query to fetch all claimed polls
 * - Cached for 60 seconds
 * When disabled:
 * - Not used (components should use hasClaimed directly)
 */
export function useClaimedPolls(userAddress: string | undefined) {
  const { config, network } = useNetwork();
  const { contractAddress } = useContract();
  const optimizationEnabled = isIndexerOptimizationEnabled();

  return useQuery<Set<number>>({
    queryKey: ['claimedPolls', userAddress, network, contractAddress],
    queryFn: () => {
      if (!userAddress || !contractAddress) return new Set<number>();
      return fetchUserClaimedPolls(config.indexerUrl, contractAddress, userAddress);
    },
    enabled: !!userAddress && !!contractAddress && optimizationEnabled,
    staleTime: CACHE_STALE_TIME,
    gcTime: CACHE_STALE_TIME * 2,
    refetchOnWindowFocus: true,
    // Return empty set as default
    placeholderData: () => new Set<number>(),
  });
}

/**
 * Hook for checking if a user has claimed from a specific poll
 * Uses the cached claimedPolls Set when optimization is enabled
 * Falls back to RPC when disabled
 */
export function useHasClaimed(pollId: number, userAddress: string | undefined) {
  const { hasClaimed: rpcHasClaimed, contractAddress } = useContract();
  const { network } = useNetwork();
  const optimizationEnabled = isIndexerOptimizationEnabled();
  const { data: claimedPolls } = useClaimedPolls(userAddress);

  return useQuery<boolean>({
    queryKey: ['hasClaimed', pollId, userAddress, network, contractAddress, optimizationEnabled],
    queryFn: async () => {
      if (!userAddress || !contractAddress) return false;

      // Use indexed data when available and optimization is enabled
      if (optimizationEnabled && claimedPolls) {
        return claimedPolls.has(pollId);
      }

      // Fallback to RPC
      return rpcHasClaimed(pollId, userAddress);
    },
    enabled: !!userAddress && !!contractAddress && pollId >= 0,
    staleTime: optimizationEnabled ? CACHE_STALE_TIME : 0,
    gcTime: optimizationEnabled ? CACHE_STALE_TIME * 2 : 0,
  });
}
