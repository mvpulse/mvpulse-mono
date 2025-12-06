import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trophy, Medal, Crown, Users, Award, Target, Flame } from "lucide-react";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useSeason, useLeaderboard } from "@/hooks/useQuests";
import { SeasonBanner, NoSeasonBanner } from "@/components/SeasonBanner";
import { truncateAddress } from "@/lib/contract";

export default function Leaderboard() {
  const { address, isConnected } = useWalletConnection();
  const { season, isLoading: isSeasonLoading } = useSeason();
  const {
    leaderboard,
    userRank,
    isLoading: isLeaderboardLoading,
  } = useLeaderboard(season?.id, address);

  const isLoading = isSeasonLoading || isLeaderboardLoading;

  // Rank icons for top 3
  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-5 h-5 text-yellow-500" />;
      case 2:
        return <Medal className="w-5 h-5 text-slate-400" />;
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="text-muted-foreground font-mono">#{rank}</span>;
    }
  };

  // Rank background styles
  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return "bg-yellow-500/10 border-yellow-500/30";
      case 2:
        return "bg-slate-400/10 border-slate-400/30";
      case 3:
        return "bg-amber-600/10 border-amber-600/30";
      default:
        return "";
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Trophy className="w-8 h-8 text-yellow-500" />
          Leaderboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Top participants ranked by season points
        </p>
      </div>

      {/* Season Banner */}
      {season ? (
        <SeasonBanner
          season={season}
          userPoints={userRank?.totalPoints}
          userRank={userRank?.rank}
          compact
        />
      ) : (
        <NoSeasonBanner />
      )}

      {/* User's Rank Card (if ranked) */}
      {isConnected && userRank && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/20">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Your Rank</p>
                  <p className="text-2xl font-bold">#{userRank.rank}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-lg font-bold font-mono">{userRank.totalPoints}</p>
                  <p className="text-xs text-muted-foreground">Points</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold font-mono">{userRank.totalVotes}</p>
                  <p className="text-xs text-muted-foreground">Votes</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold font-mono">{userRank.questsCompleted}</p>
                  <p className="text-xs text-muted-foreground">Quests</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard Table */}
      {season ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Season Rankings
              </span>
              <Badge variant="outline">{leaderboard.length} participants</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No participants yet. Be the first to earn points!
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-2">
                  {leaderboard.map((entry, index) => {
                    const isCurrentUser = address?.toLowerCase() === entry.walletAddress.toLowerCase();
                    const rank = entry.rank || index + 1;

                    return (
                      <div
                        key={entry.walletAddress}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                          isCurrentUser
                            ? 'bg-primary/10 border-primary/30'
                            : getRankStyle(rank) || 'hover:bg-muted/50'
                        }`}
                      >
                        {/* Rank & Address */}
                        <div className="flex items-center gap-3">
                          <div className="w-10 flex justify-center">
                            {getRankIcon(rank)}
                          </div>
                          <div>
                            <p className="font-mono text-sm">
                              {truncateAddress(entry.walletAddress)}
                              {isCurrentUser && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  You
                                </Badge>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold font-mono text-primary">
                              {entry.totalPoints.toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">points</p>
                          </div>
                          <div className="text-right w-16">
                            <p className="font-mono text-sm">{entry.totalVotes}</p>
                            <p className="text-xs text-muted-foreground">votes</p>
                          </div>
                          <div className="text-right w-16">
                            <p className="font-mono text-sm">{entry.questsCompleted}</p>
                            <p className="text-xs text-muted-foreground">quests</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Season</h3>
            <p className="text-muted-foreground text-center">
              Leaderboard will be available when a season is active.
            </p>
          </CardContent>
        </Card>
      )}

      {/* How Points Work */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">How to Earn Points</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-blue-500/10">
                <Target className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <p className="font-medium">Complete Quests</p>
                <p className="text-muted-foreground">
                  Earn points by completing daily, weekly, and achievement quests
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-green-500/10">
                <Users className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <p className="font-medium">Vote on Polls</p>
                <p className="text-muted-foreground">
                  Participate in polls to progress vote-based quests
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-orange-500/10">
                <Flame className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <p className="font-medium">Maintain Streaks</p>
                <p className="text-muted-foreground">
                  Vote daily to build streaks and unlock bonus rewards
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
