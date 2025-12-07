import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { CreatorLayout } from "@/components/layouts/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCcw,
  AlertCircle,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  Users,
  HandCoins,
} from "lucide-react";
import { useContract } from "@/hooks/useContract";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import type { PollWithMeta } from "@/types/poll";
import { POLL_STATUS, DISTRIBUTION_MODE } from "@/types/poll";
import { useNetwork } from "@/contexts/NetworkContext";
import { showTransactionSuccessToast, showTransactionErrorToast } from "@/lib/transaction-feedback";

export default function Distributions() {
  const { isConnected, address } = useWalletConnection();
  const { getAllPolls, distributeRewards, contractAddress } = useContract();
  const { config } = useNetwork();

  const [polls, setPolls] = useState<PollWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [distributingPollId, setDistributingPollId] = useState<number | null>(null);

  // Fetch polls
  const fetchPolls = useCallback(async () => {
    if (!contractAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const allPolls = await getAllPolls();
      setPolls(allPolls.sort((a, b) => b.id - a.id));
    } catch (error) {
      console.error("Failed to fetch polls:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getAllPolls, contractAddress]);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  // Filter to creator's polls
  const myPolls = useMemo(() => {
    if (!address) return [];
    return polls.filter(
      (p) => p.creator.toLowerCase() === address.toLowerCase()
    );
  }, [polls, address]);

  // Get polls needing distribution (push mode, closed, not distributed)
  const pendingDistributions = useMemo(() => {
    return myPolls.filter(
      (p) =>
        p.status === POLL_STATUS.CLOSED &&
        p.distribution_mode === DISTRIBUTION_MODE.MANUAL_PUSH &&
        !p.rewards_distributed &&
        p.reward_pool > 0
    );
  }, [myPolls]);

  // Get polls in claiming mode (pull mode)
  const claimingPolls = useMemo(() => {
    return myPolls.filter(
      (p) =>
        p.status === POLL_STATUS.CLAIMING &&
        p.distribution_mode === DISTRIBUTION_MODE.MANUAL_PULL
    );
  }, [myPolls]);

  // Get completed distributions
  const completedDistributions = useMemo(() => {
    return myPolls.filter((p) => p.rewards_distributed || p.status === POLL_STATUS.CLOSED);
  }, [myPolls]);

  // Calculate totals
  const totals = useMemo(() => {
    const pending = pendingDistributions.reduce((sum, p) => sum + (p.reward_pool / 1e8), 0);
    const distributed = myPolls
      .filter((p) => p.rewards_distributed)
      .reduce((sum, p) => sum + (p.reward_pool / 1e8), 0);

    return {
      pendingAmount: pending,
      distributedAmount: distributed,
      pendingCount: pendingDistributions.length,
    };
  }, [pendingDistributions, myPolls]);

  // Handle distribute rewards
  const handleDistribute = async (pollId: number) => {
    setDistributingPollId(pollId);
    try {
      const result = await distributeRewards(pollId);
      showTransactionSuccessToast(
        result.hash,
        "Rewards Distributed!",
        "All voters have received their rewards.",
        config.explorerUrl,
        result.sponsored
      );
      await fetchPolls();
    } catch (error) {
      console.error("Failed to distribute:", error);
      showTransactionErrorToast("Failed to distribute rewards", error instanceof Error ? error : "Transaction failed");
    } finally {
      setDistributingPollId(null);
    }
  };

  // Loading skeleton
  const DistributionCardSkeleton = () => (
    <div className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border/50">
      <div>
        <Skeleton className="h-5 w-40 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-9 w-24" />
    </div>
  );

  if (!isConnected) {
    return (
      <CreatorLayout title="Distributions" description="Manage reward distributions for your polls">
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to manage distributions.
            </p>
          </CardContent>
        </Card>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout title="Distributions" description="Manage reward distributions for your polls">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Pending Distribution</p>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold font-mono mt-2">
              {isLoading ? "-" : `${totals.pendingAmount.toFixed(4)}`} <span className="text-lg">MOVE</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              From {totals.pendingCount} poll(s)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total Distributed</p>
              <Coins className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold font-mono mt-2">
              {isLoading ? "-" : `${totals.distributedAmount.toFixed(4)}`} <span className="text-lg">MOVE</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Polls in Claiming</p>
              <HandCoins className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold font-mono mt-2">
              {isLoading ? "-" : claimingPolls.length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Participants claiming</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Distributions (Push Mode) */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Pending Distributions (Push Mode)
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchPolls}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <DistributionCardSkeleton />
              <DistributionCardSkeleton />
            </div>
          ) : pendingDistributions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Send className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No pending distributions.</p>
              <p className="text-sm mt-1">Polls using push mode will appear here when closed.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingDistributions.map((poll) => {
                const rewardPoolMove = poll.reward_pool / 1e8;
                const perVoter = poll.totalVotes > 0 ? rewardPoolMove / poll.totalVotes : 0;

                return (
                  <div
                    key={poll.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Link href={`/poll/${poll.id}`}>
                          <span className="font-medium hover:text-primary transition-colors">
                            {poll.title}
                          </span>
                        </Link>
                        <Badge variant="outline" className="text-xs">
                          <Users className="w-3 h-3 mr-1" /> {poll.totalVotes} voters
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {rewardPoolMove.toFixed(4)} MOVE total • ~{perVoter.toFixed(4)} MOVE per voter
                      </p>
                    </div>
                    <Button
                      onClick={() => handleDistribute(poll.id)}
                      disabled={distributingPollId === poll.id}
                    >
                      {distributingPollId === poll.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Distributing...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" /> Distribute
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Polls in Claiming Mode (Pull Mode) */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <HandCoins className="w-5 h-5 text-yellow-500" />
            Polls in Claiming Mode (Pull Mode)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <DistributionCardSkeleton />
            </div>
          ) : claimingPolls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No polls currently in claiming mode.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {claimingPolls.map((poll) => {
                const rewardPoolMove = poll.reward_pool / 1e8;
                const claimedCount = poll.claimed.length;

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
                        {claimedCount}/{poll.totalVotes} claimed • {rewardPoolMove.toFixed(4)} MOVE remaining
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">
                        <Clock className="w-3 h-3 mr-1" /> Claiming
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

      {/* Distribution History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            Distribution History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <DistributionCardSkeleton />
            </div>
          ) : completedDistributions.filter((p) => p.rewards_distributed).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No completed distributions yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {completedDistributions
                .filter((p) => p.rewards_distributed)
                .map((poll) => {
                  const rewardPoolMove = poll.reward_pool / 1e8;

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
                          {poll.totalVotes} voters • {rewardPoolMove.toFixed(4)} MOVE distributed
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-500/20 text-green-500 border-green-500/50">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Distributed
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
    </CreatorLayout>
  );
}
