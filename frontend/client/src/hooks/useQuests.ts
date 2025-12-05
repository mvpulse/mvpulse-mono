/**
 * Hooks for managing quests and seasons
 * Uses React Query for caching and automatic refetching
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { QUEST_TYPE_NAMES, SEASON_STATUS, type Quest, type QuestProgress, type Season } from "@shared/schema";

// ============================================
// Types
// ============================================

export interface QuestWithProgress extends Quest {
  progress: QuestProgress | null;
  progressPercent: number;
  isCompleted: boolean;
  canClaim: boolean;
}

export interface SeasonInfo extends Season {
  statusName: string;
  isActive: boolean;
  timeRemaining: number | null;
  daysRemaining: number | null;
}

interface ActiveQuestsResponse {
  quests: Quest[];
}

interface QuestProgressResponse {
  progress: QuestProgress[];
}

interface ClaimQuestResponse {
  success: boolean;
  pointsAwarded: number;
  totalPoints: number;
}

interface SeasonResponse {
  season: Season | null;
}

interface LeaderboardEntry {
  walletAddress: string;
  totalPoints: number;
  totalVotes: number;
  questsCompleted: number;
  rank: number;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  userRank: LeaderboardEntry | null;
}

// ============================================
// useSeason Hook
// ============================================

export function useSeason() {
  const seasonQuery = useQuery<SeasonInfo | null>({
    queryKey: ["currentSeason"],
    queryFn: async () => {
      const res = await fetch("/api/seasons/current", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch season: ${res.statusText}`);
      }

      const data: SeasonResponse = await res.json();

      if (!data.season) {
        return null;
      }

      const now = Date.now();
      const endTime = new Date(data.season.endTime).getTime();
      const timeRemaining = endTime > now ? endTime - now : null;
      const daysRemaining = timeRemaining ? Math.ceil(timeRemaining / (1000 * 60 * 60 * 24)) : null;

      const statusNames: Record<number, string> = {
        [SEASON_STATUS.PENDING]: "Pending",
        [SEASON_STATUS.ACTIVE]: "Active",
        [SEASON_STATUS.ENDED]: "Ended",
        [SEASON_STATUS.DISTRIBUTED]: "Rewards Distributed",
      };

      return {
        ...data.season,
        statusName: statusNames[data.season.status] || "Unknown",
        isActive: data.season.status === SEASON_STATUS.ACTIVE,
        timeRemaining,
        daysRemaining,
      };
    },
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: true,
  });

  return {
    season: seasonQuery.data,
    isLoading: seasonQuery.isLoading,
    isError: seasonQuery.isError,
    error: seasonQuery.error,
    refetch: seasonQuery.refetch,
  };
}

// ============================================
// useQuests Hook
// ============================================

export function useQuests(address: string | null | undefined, seasonId: string | undefined) {
  const queryClient = useQueryClient();

  // Fetch active quests for the season
  const questsQuery = useQuery<Quest[]>({
    queryKey: ["quests", seasonId],
    queryFn: async () => {
      if (!seasonId) return [];

      const res = await fetch(`/api/quests/active/${seasonId}`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch quests: ${res.statusText}`);
      }

      const data: ActiveQuestsResponse = await res.json();
      return data.quests;
    },
    enabled: !!seasonId,
    staleTime: 60000, // 1 minute
  });

  // Fetch user's quest progress
  const progressQuery = useQuery<QuestProgress[]>({
    queryKey: ["questProgress", address, seasonId],
    queryFn: async () => {
      if (!address || !seasonId) return [];

      const res = await fetch(`/api/quests/progress/${address}/${seasonId}`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch quest progress: ${res.statusText}`);
      }

      const data: QuestProgressResponse = await res.json();
      return data.progress;
    },
    enabled: !!address && !!seasonId,
    staleTime: 30000, // 30 seconds
  });

  // Combine quests with progress
  const questsWithProgress: QuestWithProgress[] = (questsQuery.data || []).map((quest) => {
    const progress = (progressQuery.data || []).find((p) => p.questId === quest.id) || null;
    const currentValue = progress?.currentValue || 0;
    const progressPercent = Math.min((currentValue / quest.targetValue) * 100, 100);
    const isCompleted = progress?.completed || false;
    const canClaim = isCompleted && (progress?.pointsAwarded || 0) === 0;

    return {
      ...quest,
      progress,
      progressPercent,
      isCompleted,
      canClaim,
    };
  });

  // Group quests by type
  const questsByType = questsWithProgress.reduce(
    (acc, quest) => {
      const typeName = QUEST_TYPE_NAMES[quest.questType as keyof typeof QUEST_TYPE_NAMES] || "Other";
      if (!acc[typeName]) {
        acc[typeName] = [];
      }
      acc[typeName].push(quest);
      return acc;
    },
    {} as Record<string, QuestWithProgress[]>
  );

  // Claim quest mutation
  const claimQuestMutation = useMutation<ClaimQuestResponse, Error, string>({
    mutationFn: async (questId) => {
      if (!address) {
        throw new Error("No wallet address provided");
      }

      const res = await apiRequest("POST", `/api/quests/claim/${address}/${questId}`);
      return res.json();
    },
    onSuccess: () => {
      // Invalidate quest progress and user profile
      queryClient.invalidateQueries({ queryKey: ["questProgress", address, seasonId] });
      queryClient.invalidateQueries({ queryKey: ["userProfile", address] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard", seasonId] });
    },
  });

  return {
    // Quests data
    quests: questsWithProgress,
    questsByType,
    rawQuests: questsQuery.data || [],
    progress: progressQuery.data || [],

    // Stats
    totalQuests: questsWithProgress.length,
    completedQuests: questsWithProgress.filter((q) => q.isCompleted).length,
    claimableQuests: questsWithProgress.filter((q) => q.canClaim).length,

    // Query state
    isLoading: questsQuery.isLoading || progressQuery.isLoading,
    isError: questsQuery.isError || progressQuery.isError,
    error: questsQuery.error || progressQuery.error,

    // Actions
    claimQuest: claimQuestMutation.mutateAsync,
    isClaimingQuest: claimQuestMutation.isPending,
    claimQuestError: claimQuestMutation.error,

    // Refetch
    refetch: () => {
      questsQuery.refetch();
      progressQuery.refetch();
    },
  };
}

// ============================================
// useLeaderboard Hook
// ============================================

export function useLeaderboard(seasonId: string | undefined, address: string | null | undefined) {
  const leaderboardQuery = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard", seasonId, address],
    queryFn: async () => {
      if (!seasonId) {
        return { leaderboard: [], userRank: null };
      }

      let url = `/api/seasons/${seasonId}/leaderboard`;
      if (address) {
        url += `?address=${address}`;
      }

      const res = await fetch(url, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch leaderboard: ${res.statusText}`);
      }

      return res.json();
    },
    enabled: !!seasonId,
    staleTime: 60000, // 1 minute
  });

  return {
    leaderboard: leaderboardQuery.data?.leaderboard || [],
    userRank: leaderboardQuery.data?.userRank || null,
    isLoading: leaderboardQuery.isLoading,
    isError: leaderboardQuery.isError,
    error: leaderboardQuery.error,
    refetch: leaderboardQuery.refetch,
  };
}
