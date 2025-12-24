/**
 * Combined hook for fetching user's vote and claim status
 * Uses Movement Indexer when optimization is enabled for batch fetching
 */

import { useQuery } from "@tanstack/react-query";
import { useNetwork } from "@/contexts/NetworkContext";
import { useContract } from "@/hooks/useContract";
import { isIndexerOptimizationEnabled } from "@/lib/feature-flags";
import { fetchUserVoteAndClaimStatus } from "@/lib/indexer-queries";

const CACHE_STALE_TIME = 60000; // 60 seconds

export interface UserPollStatus {
  votedPolls: Set<number>;
  claimedPolls: Set<number>;
}

/**
 * Hook for getting user's vote and claim status in a single query
 * This is more efficient than making separate queries for voted and claimed polls
 *
 * When indexer optimization is enabled:
 * - Makes 2 parallel GraphQL queries (voted + claimed)
 * - Returns both Sets for O(1) lookup
 * - Cached for 60 seconds
 *
 * When disabled:
 * - Returns empty sets (components should use RPC directly)
 */
export function useUserPollStatus(userAddress: string | undefined) {
  const { config, network } = useNetwork();
  const { contractAddress } = useContract();
  const optimizationEnabled = isIndexerOptimizationEnabled();

  const query = useQuery<UserPollStatus>({
    queryKey: ['userPollStatus', userAddress, network, contractAddress],
    queryFn: async () => {
      if (!userAddress || !contractAddress) {
        return { votedPolls: new Set<number>(), claimedPolls: new Set<number>() };
      }
      return fetchUserVoteAndClaimStatus(config.indexerUrl, contractAddress, userAddress);
    },
    enabled: !!userAddress && !!contractAddress && optimizationEnabled,
    staleTime: CACHE_STALE_TIME,
    gcTime: CACHE_STALE_TIME * 2,
    refetchOnWindowFocus: true,
    placeholderData: () => ({ votedPolls: new Set<number>(), claimedPolls: new Set<number>() }),
  });

  return {
    votedPolls: query.data?.votedPolls ?? new Set<number>(),
    claimedPolls: query.data?.claimedPolls ?? new Set<number>(),
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    // Helper functions for quick lookups
    hasVoted: (pollId: number) => query.data?.votedPolls.has(pollId) ?? false,
    hasClaimed: (pollId: number) => query.data?.claimedPolls.has(pollId) ?? false,
    // Whether the indexer optimization is active
    isOptimized: optimizationEnabled,
    query,
  };
}
