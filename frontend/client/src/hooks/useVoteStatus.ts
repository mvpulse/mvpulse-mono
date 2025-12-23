/**
 * Hook for fetching user's vote status across all polls
 * Uses Movement Indexer when optimization is enabled
 * Falls back to RPC calls when disabled
 */

import { useQuery } from "@tanstack/react-query";
import { useNetwork } from "@/contexts/NetworkContext";
import { useContract } from "@/hooks/useContract";
import { isIndexerOptimizationEnabled } from "@/lib/feature-flags";
import { fetchUserVotedPolls } from "@/lib/indexer-queries";

const CACHE_STALE_TIME = 60000; // 60 seconds

/**
 * Hook for getting all poll IDs that a user has voted on
 * When indexer optimization is enabled:
 * - Uses a single GraphQL query to fetch all voted polls
 * - Cached for 60 seconds
 * When disabled:
 * - Not used (components should use hasVoted directly)
 */
export function useVotedPolls(userAddress: string | undefined) {
  const { config, network } = useNetwork();
  const { contractAddress } = useContract();
  const optimizationEnabled = isIndexerOptimizationEnabled();

  return useQuery<Set<number>>({
    queryKey: ['votedPolls', userAddress, network, contractAddress],
    queryFn: () => {
      if (!userAddress || !contractAddress) return new Set<number>();
      return fetchUserVotedPolls(config.indexerUrl, contractAddress, userAddress);
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
 * Hook for checking if a user has voted on a specific poll
 * Uses the cached votedPolls Set when optimization is enabled
 * Falls back to RPC when disabled
 */
export function useHasVoted(pollId: number, userAddress: string | undefined) {
  const { hasVoted: rpcHasVoted, contractAddress } = useContract();
  const { network } = useNetwork();
  const optimizationEnabled = isIndexerOptimizationEnabled();
  const { data: votedPolls } = useVotedPolls(userAddress);

  return useQuery<boolean>({
    queryKey: ['hasVoted', pollId, userAddress, network, contractAddress, optimizationEnabled],
    queryFn: async () => {
      if (!userAddress || !contractAddress) return false;

      // Use indexed data when available and optimization is enabled
      if (optimizationEnabled && votedPolls) {
        return votedPolls.has(pollId);
      }

      // Fallback to RPC
      return rpcHasVoted(pollId, userAddress);
    },
    enabled: !!userAddress && !!contractAddress && pollId >= 0,
    staleTime: optimizationEnabled ? CACHE_STALE_TIME : 0,
    gcTime: optimizationEnabled ? CACHE_STALE_TIME * 2 : 0,
  });
}
