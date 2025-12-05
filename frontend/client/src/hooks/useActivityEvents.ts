/**
 * Hook for fetching user activity events
 * Uses React Query for caching and automatic refetching
 * Fetches data from Movement Indexer GraphQL API
 */

import { useQuery } from "@tanstack/react-query";
import { useNetwork } from "@/contexts/NetworkContext";
import { fetchUserActivity, type ActivityEvent } from "@/lib/events";

export function useActivityEvents(address: string | undefined) {
  const { config, network } = useNetwork();

  return useQuery<ActivityEvent[]>({
    queryKey: ['activity', address, network],
    queryFn: () => {
      if (!address) return Promise.resolve([]);
      return fetchUserActivity(config.indexerUrl, config.contractAddress, address, 10);
    },
    enabled: !!address,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}
