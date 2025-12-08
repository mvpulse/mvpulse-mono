import { useState } from "react";
import { ParticipantLayout } from "@/components/layouts/ParticipantLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useQuests, useSeason, useLeaderboard } from "@/hooks/useQuests";
import { useVoteLimit } from "@/hooks/useVoteLimit";
import { QuestList, QuestStats } from "@/components/QuestList";
import { SeasonBanner, NoSeasonBanner } from "@/components/SeasonBanner";
import { TierBadge, TierProgress } from "@/components/TierBadge";
import { DailyVoteLimit } from "@/components/DailyVoteLimit";
import { StreakDisplay } from "@/components/StreakDisplay";
import { Wallet, ListChecks, Trophy } from "lucide-react";

export default function Quests() {
  const { address, isConnected } = useWalletConnection();
  const { season, isLoading: isSeasonLoading } = useSeason();
  const {
    questsByType,
    totalQuests,
    completedQuests,
    claimableQuests,
    claimQuest,
    isClaimingQuest,
    isLoading: isQuestsLoading,
  } = useQuests(address, season?.id);

  const {
    votesUsed,
    tierLimit,
    tier,
    tierName,
    currentStreak,
    longestStreak,
    refetch: refetchVoteLimit,
    isLoading: isVoteLimitLoading,
  } = useVoteLimit(address);

  const { userRank } = useLeaderboard(season?.id, address);

  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);

  const handleClaimQuest = async (questId: string) => {
    setClaimingQuestId(questId);
    try {
      const result = await claimQuest(questId);
      toast.success("Quest Points Claimed!", {
        description: `+${result.pointsAwarded} points added to your season total!`,
      });
    } catch (error) {
      console.error("Failed to claim quest:", error);
      toast.error("Failed to claim quest", {
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setClaimingQuestId(null);
    }
  };

  // Not connected state
  if (!isConnected) {
    return (
      <ParticipantLayout title="Quests" description="Complete quests to earn points">
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="w-12 h-12 text-yellow-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">Connect Your Wallet</h2>
            <p className="text-muted-foreground text-center">
              Connect your wallet to view quests and track your progress.
            </p>
          </CardContent>
        </Card>
      </ParticipantLayout>
    );
  }

  const isLoading = isSeasonLoading || isQuestsLoading || isVoteLimitLoading;

  if (isLoading) {
    return (
      <ParticipantLayout title="Quests" description="Complete quests to earn points">
        <div className="space-y-6">
          <Skeleton className="h-40 w-full" />
          <div className="grid md:grid-cols-3 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-10 w-full" />
          <div className="grid md:grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </ParticipantLayout>
    );
  }

  return (
    <ParticipantLayout title="Quests" description="Complete quests to earn points and climb the leaderboard!">
      <div className="space-y-6">
      {/* Season Banner */}
      {season ? (
        <SeasonBanner
          season={season}
          userPoints={userRank?.totalPoints}
          userRank={userRank?.rank}
        />
      ) : (
        <NoSeasonBanner />
      )}

      {/* User Stats Grid */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Tier & Progress Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-500" />
              Your Tier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <TierBadge tier={tier} size="lg" showVoteLimit />
            </div>
            <TierProgress
              currentTier={tier}
              pulseBalance="0" // TODO: Get from profile
              streak={currentStreak}
            />
          </CardContent>
        </Card>

        {/* Daily Vote Limit */}
        <DailyVoteLimit
          votesUsed={votesUsed}
          tierLimit={tierLimit}
          tier={tier}
          tierName={tierName}
          onRefresh={refetchVoteLimit}
        />

        {/* Streak Display */}
        <StreakDisplay
          currentStreak={currentStreak}
          longestStreak={longestStreak}
          compact={false}
        />
      </div>

      {/* Quest Stats */}
      {season && totalQuests > 0 && (
        <QuestStats
          totalQuests={totalQuests}
          completedQuests={completedQuests}
          claimableQuests={claimableQuests}
          totalPoints={userRank?.totalPoints}
        />
      )}

      {/* Quest List */}
      {season ? (
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-primary" />
            Available Quests
          </h2>
          <QuestList
            questsByType={questsByType}
            onClaim={handleClaimQuest}
            isClaimingId={claimingQuestId || undefined}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ListChecks className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Season</h3>
            <p className="text-muted-foreground text-center">
              Quests will appear when a new season starts. Keep voting to maintain your streak!
            </p>
          </CardContent>
        </Card>
      )}
      </div>
    </ParticipantLayout>
  );
}
