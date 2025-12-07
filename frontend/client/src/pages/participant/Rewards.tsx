import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { ParticipantLayout } from "@/components/layouts/ParticipantLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCcw,
  AlertCircle,
  Gift,
  Loader2,
  CheckCircle2,
  Coins,
  ExternalLink,
} from "lucide-react";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useContract } from "@/hooks/useContract";
import type { PollWithMeta } from "@/types/poll";
import { POLL_STATUS, DISTRIBUTION_MODE } from "@/types/poll";
import { COIN_TYPES, getCoinSymbol, type CoinTypeId } from "@/lib/tokens";
import { useNetwork } from "@/contexts/NetworkContext";
import { showTransactionSuccessToast, showTransactionErrorToast } from "@/lib/transaction-feedback";

export default function Rewards() {
  const { isConnected, address } = useWalletConnection();
  const { getAllPolls, hasVoted, hasClaimed, claimReward, contractAddress } = useContract();
  const { config } = useNetwork();

  const [polls, setPolls] = useState<PollWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [votedPollIds, setVotedPollIds] = useState<Set<number>>(new Set());
  const [claimedPollIds, setClaimedPollIds] = useState<Set<number>>(new Set());
  const [claimingPollId, setClaimingPollId] = useState<number | null>(null);

  // Fetch polls and vote/claim status
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

  // Get polls user has voted on
  const votedPolls = useMemo(() => {
    return polls.filter((p) => votedPollIds.has(p.id));
  }, [polls, votedPollIds]);

  // Get claimable polls (status is CLAIMING, pull mode, not yet claimed)
  const claimablePolls = useMemo(() => {
    return votedPolls.filter(
      (p) =>
        p.status === POLL_STATUS.CLAIMING &&
        p.distribution_mode === DISTRIBUTION_MODE.MANUAL_PULL &&
        !claimedPollIds.has(p.id) &&
        p.reward_pool > 0
    );
  }, [votedPolls, claimedPollIds]);

  // Get claimed polls
  const claimedPolls = useMemo(() => {
    return votedPolls.filter((p) => claimedPollIds.has(p.id) || p.rewards_distributed);
  }, [votedPolls, claimedPollIds]);

  // Calculate totals
  const totals = useMemo(() => {
    const pending = claimablePolls.reduce((sum, p) => {
      const perVoter = p.reward_per_vote > 0
        ? p.reward_per_vote / 1e8
        : p.totalVotes > 0
        ? (p.reward_pool / 1e8) / p.totalVotes
        : 0;
      return sum + perVoter;
    }, 0);

    return {
      pendingRewards: pending,
      totalClaimed: 0, // Would need to track claimed amounts
      claimablePollsCount: claimablePolls.length,
    };
  }, [claimablePolls]);

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

  // Handle claim all
  const handleClaimAll = async () => {
    for (const poll of claimablePolls) {
      await handleClaim(poll.id, poll.coin_type_id as CoinTypeId);
    }
  };

  // Loading skeleton
  const ClaimCardSkeleton = () => (
    <div className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border/50">
      <div>
        <Skeleton className="h-5 w-40 mb-2" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-9 w-20" />
    </div>
  );

  if (!isConnected) {
    return (
      <ParticipantLayout title="Rewards" description="Claim your earned rewards">
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to view your rewards.
            </p>
          </CardContent>
        </Card>
      </ParticipantLayout>
    );
  }

  return (
    <ParticipantLayout title="Rewards" description="Claim your earned rewards">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Pending Rewards</p>
              <Gift className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold font-mono mt-2">
              {isLoading ? "-" : `${totals.pendingRewards.toFixed(4)}`} <span className="text-lg">MOVE</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              From {totals.claimablePollsCount} poll(s)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total Claimed</p>
              <Coins className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold font-mono mt-2">
              {isLoading ? "-" : `${totals.totalClaimed.toFixed(4)}`} <span className="text-lg">MOVE</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Polls Rewarded</p>
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold font-mono mt-2">
              {isLoading ? "-" : claimedPolls.length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Rewards received</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Claims Section */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            Pending Claims
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchPolls}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
            </Button>
            {claimablePolls.length > 1 && (
              <Button size="sm" onClick={handleClaimAll} disabled={claimingPollId !== null}>
                Claim All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <ClaimCardSkeleton />
              <ClaimCardSkeleton />
            </div>
          ) : claimablePolls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Gift className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No pending rewards to claim.</p>
              <p className="text-sm mt-1">Vote on polls to earn rewards!</p>
              <Link href="/dashboard">
                <Button variant="outline" className="mt-4">
                  Explore Polls
                </Button>
              </Link>
            </div>
          ) : (
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
                    className="flex items-center justify-between p-4 rounded-lg bg-green-500/5 border border-green-500/20"
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
          )}
        </CardContent>
      </Card>

      {/* Claim History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            Claim History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <ClaimCardSkeleton />
              <ClaimCardSkeleton />
            </div>
          ) : claimedPolls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No claim history yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {claimedPolls.map((poll) => {
                const perVoter = poll.reward_per_vote > 0
                  ? poll.reward_per_vote / 1e8
                  : poll.totalVotes > 0
                  ? (poll.reward_pool / 1e8) / poll.totalVotes
                  : 0;
                const coinSymbol = getCoinSymbol(poll.coin_type_id as CoinTypeId);

                return (
                  <div
                    key={poll.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div>
                      <Link href={`/poll/${poll.id}`}>
                        <p className="font-medium hover:text-primary transition-colors">
                          {poll.title}
                        </p>
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        ~{perVoter.toFixed(4)} {coinSymbol}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-500/20 text-green-500 border-green-500/50">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Claimed
                      </Badge>
                      <Link href={`/poll/${poll.id}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </ParticipantLayout>
  );
}
