import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { ParticipantLayout } from "@/components/layouts/ParticipantLayout";
import { PollCard } from "@/components/PollCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Vote,
  Clock,
  Coins,
  Zap,
  RefreshCcw,
  AlertCircle,
  ArrowUpRight,
  Gift,
  Loader2,
} from "lucide-react";
import { useContract } from "@/hooks/useContract";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import type { PollWithMeta } from "@/types/poll";
import { POLL_STATUS, DISTRIBUTION_MODE } from "@/types/poll";
import { COIN_TYPES, getCoinSymbol, type CoinTypeId } from "@/lib/tokens";
import { useNetwork } from "@/contexts/NetworkContext";
import { showTransactionSuccessToast, showTransactionErrorToast } from "@/lib/transaction-feedback";

export default function ParticipantDashboard() {
  const { isConnected, address } = useWalletConnection();
  const { getAllPolls, hasVoted, hasClaimed, claimReward, contractAddress } = useContract();
  const { config } = useNetwork();

  const [polls, setPolls] = useState<PollWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [votedPollIds, setVotedPollIds] = useState<Set<number>>(new Set());
  const [claimedPollIds, setClaimedPollIds] = useState<Set<number>>(new Set());
  const [claimingPollId, setClaimingPollId] = useState<number | null>(null);

  // Fetch polls and vote status
  const fetchPolls = useCallback(async () => {
    if (!contractAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const allPolls = await getAllPolls();
      setPolls(allPolls.sort((a, b) => b.id - a.id));

      // Check vote and claim status for each poll
      if (address) {
        const votedIds = new Set<number>();
        const claimedIds = new Set<number>();
        for (const poll of allPolls) {
          const voted = await hasVoted(poll.id);
          if (voted) {
            votedIds.add(poll.id);
            const claimed = await hasClaimed(poll.id);
            if (claimed) {
              claimedIds.add(poll.id);
            }
          }
        }
        setVotedPollIds(votedIds);
        setClaimedPollIds(claimedIds);
      }
    } catch (error) {
      console.error("Failed to fetch polls:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getAllPolls, hasVoted, hasClaimed, contractAddress, address]);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  // Get polls the user has voted on
  const votedPolls = useMemo(() => {
    return polls.filter((p) => votedPollIds.has(p.id));
  }, [polls, votedPollIds]);

  // Get polls available to claim
  const claimablePolls = useMemo(() => {
    return votedPolls.filter(
      (p) =>
        p.status === POLL_STATUS.CLAIMING &&
        p.distribution_mode === DISTRIBUTION_MODE.MANUAL_PULL &&
        !claimedPollIds.has(p.id) &&
        p.reward_pool > 0
    );
  }, [votedPolls, claimedPollIds]);

  // Get active polls the user hasn't voted on
  const availablePolls = useMemo(() => {
    return polls.filter((p) => p.isActive && !votedPollIds.has(p.id));
  }, [polls, votedPollIds]);

  // Calculate stats
  const stats = useMemo(() => {
    const pendingRewards = claimablePolls.reduce((sum, p) => {
      const perVoter = p.reward_per_vote > 0
        ? p.reward_per_vote / 1e8
        : p.totalVotes > 0
        ? (p.reward_pool / 1e8) / p.totalVotes
        : 0;
      return sum + perVoter;
    }, 0);

    return {
      pollsVoted: votedPolls.length,
      pendingRewards,
      totalEarned: 0, // Would need to track claimed amounts
      activePolls: availablePolls.length,
    };
  }, [votedPolls, claimablePolls, availablePolls]);

  // Handle claim reward
  const handleClaim = async (pollId: number, coinTypeId: CoinTypeId) => {
    setClaimingPollId(pollId);
    try {
      const result = await claimReward(pollId, coinTypeId);
      showTransactionSuccessToast(
        result.hash,
        "Reward Claimed!",
        "Your reward has been transferred to your wallet.",
        config.explorerUrl,
        result.sponsored
      );
      setClaimedPollIds((prev) => new Set(prev).add(pollId));
    } catch (error) {
      console.error("Failed to claim:", error);
      showTransactionErrorToast("Failed to claim reward", error instanceof Error ? error : "Transaction failed");
    } finally {
      setClaimingPollId(null);
    }
  };

  // Render poll card
  const renderPollCard = (poll: PollWithMeta) => {
    const rewardPool = poll.reward_pool / 1e8;
    const coinSymbol = getCoinSymbol(poll.coin_type_id as CoinTypeId);
    return (
      <PollCard
        key={poll.id}
        id={poll.id.toString()}
        title={poll.title}
        description={poll.description}
        votes={poll.totalVotes}
        timeLeft={poll.timeRemaining}
        reward={rewardPool > 0 ? `${rewardPool.toFixed(2)} ${coinSymbol}` : undefined}
        status={poll.isActive ? "active" : "closed"}
        tags={[]}
      />
    );
  };

  // Loading skeleton
  const StatSkeleton = () => (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardContent className="p-6">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );

  const PollSkeleton = () => (
    <Skeleton className="h-48 w-full rounded-xl" />
  );

  if (!isConnected) {
    return (
      <ParticipantLayout title="Participant Dashboard" description="Track your votes and rewards">
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to view your participant dashboard.
            </p>
          </CardContent>
        </Card>
      </ParticipantLayout>
    );
  }

  return (
    <ParticipantLayout title="Participant Dashboard" description="Track your votes and rewards">
      {/* Hidden tour welcome target */}
      <div data-tour="participant-welcome" className="sr-only" />

      {/* Stats Cards */}
      <div data-tour="participant-stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {isLoading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Polls Voted</p>
                  <Vote className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold font-mono mt-2">{stats.pollsVoted}</p>
                <p className="text-xs text-muted-foreground mt-1">Total participation</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Pending Rewards</p>
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold font-mono mt-2">
                  {stats.pendingRewards.toFixed(4)} <span className="text-lg">MOVE</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">Ready to claim</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Total Earned</p>
                  <Coins className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold font-mono mt-2">
                  {stats.totalEarned.toFixed(4)} <span className="text-lg">MOVE</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">All time rewards</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Active Polls</p>
                  <Zap className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold font-mono mt-2">{stats.activePolls}</p>
                <p className="text-xs text-muted-foreground mt-1">Available to vote</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Claimable Rewards Section */}
      {claimablePolls.length > 0 && (
        <Card data-tour="claimable-rewards" className="mb-8 border-green-500/30 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Gift className="w-5 h-5 text-green-500" />
              Polls to Claim ({claimablePolls.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {claimablePolls.map((poll) => {
                const perVoter = poll.reward_per_vote > 0
                  ? poll.reward_per_vote / 1e8
                  : poll.totalVotes > 0
                  ? (poll.reward_pool / 1e8) / poll.totalVotes
                  : 0;
                const coinSymbol = getCoinSymbol(poll.coin_type_id as CoinTypeId);
                return (
                  <div
                    key={poll.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50"
                  >
                    <div>
                      <Link href={`/poll/${poll.id}`}>
                        <p className="font-medium hover:text-primary transition-colors">
                          {poll.title}
                        </p>
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        ~{perVoter.toFixed(4)} {coinSymbol} available
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleClaim(poll.id, poll.coin_type_id as CoinTypeId)}
                      disabled={claimingPollId === poll.id}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {claimingPollId === poll.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Claiming...
                        </>
                      ) : (
                        "Claim"
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Votes */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Votes</h2>
          <Link href="/participant/history">
            <Button variant="outline" size="sm">
              View All <ArrowUpRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <PollSkeleton />
            <PollSkeleton />
            <PollSkeleton />
          </div>
        ) : votedPolls.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">
                You haven't voted on any polls yet.
              </p>
              <Link href="/dashboard">
                <Button>
                  Explore Polls <ArrowUpRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {votedPolls.slice(0, 3).map((poll) => (
              <div key={poll.id} className="relative">
                {renderPollCard(poll)}
                <Badge className="absolute top-3 right-3 bg-primary/80">
                  Voted
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommended Polls */}
      <div data-tour="recommended-polls">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recommended Polls</h2>
          <Button variant="outline" size="sm" onClick={fetchPolls}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <PollSkeleton />
            <PollSkeleton />
            <PollSkeleton />
          </div>
        ) : availablePolls.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">
                No more polls available. Check back later!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availablePolls
              .filter((p) => p.reward_pool > 0)
              .slice(0, 6)
              .map(renderPollCard)}
          </div>
        )}
      </div>
    </ParticipantLayout>
  );
}
