/**
 * Hook for fetching polls with React Query caching
 * Uses the indexer optimization feature flag for cache behavior
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useContract } from "@/hooks/useContract";
import { useNetwork } from "@/contexts/NetworkContext";
import { isIndexerOptimizationEnabled } from "@/lib/feature-flags";
import type { PollWithMeta } from "@/types/poll";

const CACHE_STALE_TIME = 60000; // 60 seconds

/**
 * Hook for fetching all polls with optional caching
 * When indexer optimization is enabled:
 * - Stale time: 60 seconds
 * - Background refetch on window focus
 * When disabled:
 * - No caching, always fresh data
 */
export function usePolls() {
  const { getAllPolls, contractAddress } = useContract();
  const { network } = useNetwork();
  const queryClient = useQueryClient();
  const optimizationEnabled = isIndexerOptimizationEnabled();

  const query = useQuery<PollWithMeta[]>({
    queryKey: ['polls', network, contractAddress],
    queryFn: getAllPolls,
    enabled: !!contractAddress,
    // Caching behavior based on feature flag
    staleTime: optimizationEnabled ? CACHE_STALE_TIME : 0,
    gcTime: optimizationEnabled ? CACHE_STALE_TIME * 2 : 0,
    refetchOnWindowFocus: optimizationEnabled,
    refetchOnMount: !optimizationEnabled, // Always refetch on mount when optimization is off
  });

  // Manual refresh function that bypasses cache
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['polls', network, contractAddress] });
  };

  return {
    polls: query.data ?? [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refresh,
    // Expose the raw query for advanced usage
    query,
  };
}

/**
 * Hook for fetching a single poll by ID
 * Uses the polls cache when available
 */
export function usePoll(pollId: number) {
  const { getPoll, contractAddress } = useContract();
  const { network } = useNetwork();
  const optimizationEnabled = isIndexerOptimizationEnabled();

  return useQuery<PollWithMeta | null>({
    queryKey: ['poll', pollId, network, contractAddress],
    queryFn: () => getPoll(pollId),
    enabled: !!contractAddress && pollId >= 0,
    staleTime: optimizationEnabled ? CACHE_STALE_TIME : 0,
    gcTime: optimizationEnabled ? CACHE_STALE_TIME * 2 : 0,
  });
}

/**
 * Hook for getting the total poll count
 */
export function usePollCount() {
  const { getPollCount, contractAddress } = useContract();
  const { network } = useNetwork();
  const optimizationEnabled = isIndexerOptimizationEnabled();

  return useQuery<number>({
    queryKey: ['pollCount', network, contractAddress],
    queryFn: getPollCount,
    enabled: !!contractAddress,
    staleTime: optimizationEnabled ? CACHE_STALE_TIME : 0,
    gcTime: optimizationEnabled ? CACHE_STALE_TIME * 2 : 0,
  });
}

/**
 * Invalidate all poll-related caches
 * Call this after creating, voting, closing, or modifying polls
 */
export function useInvalidatePolls() {
  const queryClient = useQueryClient();
  const { network } = useNetwork();
  const { contractAddress } = useContract();

  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['polls', network, contractAddress] });
    await queryClient.invalidateQueries({ queryKey: ['poll'] });
    await queryClient.invalidateQueries({ queryKey: ['pollCount', network, contractAddress] });
  };
}
