/**
 * Hook for managing user profile with tier and streak information
 * Uses React Query for caching and automatic refetching
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { TIER_NAMES, type UserProfile } from "@shared/schema";

export interface UserProfileInfo {
  walletAddress: string;
  tier: number;
  tierName: string;
  currentStreak: number;
  longestStreak: number;
  votesToday: number;
  pulseBalance: string;
  seasonPoints: number;
  seasonVotes: number;
  lastVoteDate: string | null;
}

interface ProfileResponse {
  profile: UserProfile;
  tier: number;
  tierName: string;
}

interface SyncTierResponse {
  tier: number;
  tierName: string;
  pulseBalance: string;
  streakBonus: number;
}

export function useUserProfile(address: string | undefined) {
  const queryClient = useQueryClient();

  // Fetch user profile
  const profileQuery = useQuery<UserProfileInfo | null>({
    queryKey: ["userProfile", address],
    queryFn: async () => {
      if (!address) {
        return null;
      }

      const res = await fetch(`/api/user/profile/${address}`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch profile: ${res.statusText}`);
      }

      const data: ProfileResponse = await res.json();

      return {
        walletAddress: data.profile.walletAddress,
        tier: data.tier,
        tierName: data.tierName,
        currentStreak: data.profile.currentStreak,
        longestStreak: data.profile.longestStreak,
        votesToday: data.profile.votesToday,
        pulseBalance: data.profile.cachedPulseBalance,
        seasonPoints: data.profile.seasonPoints,
        seasonVotes: data.profile.seasonVotes,
        lastVoteDate: data.profile.lastVoteDate,
      };
    },
    enabled: !!address,
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: true,
  });

  // Mutation to sync tier from on-chain PULSE balance
  const syncTierMutation = useMutation<SyncTierResponse, Error>({
    mutationFn: async () => {
      if (!address) {
        throw new Error("No wallet address provided");
      }

      const res = await apiRequest("POST", `/api/user/sync-tier/${address}`);
      return res.json();
    },
    onSuccess: () => {
      // Invalidate profile and vote limit queries
      queryClient.invalidateQueries({ queryKey: ["userProfile", address] });
      queryClient.invalidateQueries({ queryKey: ["voteLimit", address] });
    },
  });

  return {
    // Profile data
    profile: profileQuery.data,
    tier: profileQuery.data?.tier ?? 0,
    tierName: profileQuery.data?.tierName ?? TIER_NAMES[0],
    currentStreak: profileQuery.data?.currentStreak ?? 0,
    longestStreak: profileQuery.data?.longestStreak ?? 0,
    pulseBalance: profileQuery.data?.pulseBalance ?? "0",
    seasonPoints: profileQuery.data?.seasonPoints ?? 0,
    seasonVotes: profileQuery.data?.seasonVotes ?? 0,

    // Query state
    isLoading: profileQuery.isLoading,
    isError: profileQuery.isError,
    error: profileQuery.error,

    // Actions
    syncTier: syncTierMutation.mutateAsync,
    isSyncingTier: syncTierMutation.isPending,
    syncTierError: syncTierMutation.error,

    // Refetch
    refetch: profileQuery.refetch,
  };
}
