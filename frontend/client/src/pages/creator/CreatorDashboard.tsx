import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { CreatorLayout } from "@/components/layouts/CreatorLayout";
import { PollCard } from "@/components/PollCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  MessageSquare,
  Zap,
  Coins,
  Plus,
  RefreshCcw,
  AlertCircle,
  TrendingUp,
  ArrowUpRight
} from "lucide-react";
import { useContract } from "@/hooks/useContract";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import type { PollWithMeta } from "@/types/poll";
import { POLL_STATUS } from "@/types/poll";
import { getCoinSymbol, COIN_TYPES, type CoinTypeId } from "@/lib/tokens";

export default function CreatorDashboard() {
  const { isConnected, address } = useWalletConnection();
  const { getAllPolls, contractAddress } = useContract();

  const [polls, setPolls] = useState<PollWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  // Filter to only creator's polls
  const myPolls = useMemo(() => {
    if (!address) return [];
    return polls.filter(
      (p) => p.creator.toLowerCase() === address.toLowerCase()
    );
  }, [polls, address]);

  const myActivePolls = myPolls.filter((p) => p.isActive);
  const myClosedPolls = myPolls.filter((p) => !p.isActive);
  const myClaimingPolls = myPolls.filter((p) => p.status === POLL_STATUS.CLAIMING);

  // Calculate stats - group funded by token type (exclude MOVE, only show PULSE and USDC)
  const stats = useMemo(() => {
    const fundedByToken: Record<string, number> = {};
    myPolls.forEach((p) => {
      // Skip MOVE (coin_type_id = 0), only aggregate PULSE and USDC
      if (p.coin_type_id === COIN_TYPES.MOVE) return;
      const coinSymbol = getCoinSymbol(p.coin_type_id as CoinTypeId);
      fundedByToken[coinSymbol] = (fundedByToken[coinSymbol] || 0) + (p.reward_pool / 1e8);
    });

    return {
      totalPolls: myPolls.length,
      totalResponses: myPolls.reduce((sum, p) => sum + p.totalVotes, 0),
      activePolls: myActivePolls.length,
      fundedByToken,
    };
  }, [myPolls, myActivePolls]);

  // Get chart data for responses by poll
  const responsesData = useMemo(() => {
    return myPolls.slice(0, 10).map((p) => ({
      name: p.title.length > 15 ? p.title.slice(0, 15) + "..." : p.title,
      responses: p.totalVotes,
    }));
  }, [myPolls]);

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

  // Loading skeleton for stats
  const StatSkeleton = () => (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardContent className="p-6">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );

  // Loading skeleton for polls
  const PollSkeleton = () => (
    <Skeleton className="h-48 w-full rounded-xl" />
  );

  if (!isConnected) {
    return (
      <CreatorLayout title="Creator Dashboard" description="Analytics and insights for your polls">
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to view your creator dashboard.
            </p>
          </CardContent>
        </Card>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout title="Creator Dashboard" description="Analytics and insights for your polls">
      {/* Hidden tour welcome target */}
      <div data-tour="creator-welcome" className="sr-only" />

      {/* Stats Cards */}
      <div data-tour="creator-stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
                  <p className="text-sm text-muted-foreground">Total Polls</p>
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold font-mono mt-2">{stats.totalPolls}</p>
                <p className="text-xs text-muted-foreground mt-1">All polls created</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Total Responses</p>
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold font-mono mt-2">{stats.totalResponses}</p>
                <p className="text-xs text-muted-foreground mt-1">Across all polls</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Active Polls</p>
                  <Zap className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold font-mono mt-2">{stats.activePolls}</p>
                <p className="text-xs text-muted-foreground mt-1">Currently running</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Total Funded</p>
                  <Coins className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="mt-2">
                  {Object.keys(stats.fundedByToken).length === 0 ? (
                    <p className="text-3xl font-bold font-mono">0</p>
                  ) : (
                    Object.entries(stats.fundedByToken).map(([token, amount]) => (
                      <p key={token} className="text-2xl font-bold font-mono">
                        {amount.toFixed(4)} <span className="text-base">{token}</span>
                      </p>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Rewards distributed</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Responses Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : responsesData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No response data available
              </div>
            ) : (
              <div className="h-64 flex items-end gap-2">
                {responsesData.map((item, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full bg-primary/80 rounded-t-sm transition-all hover:bg-primary"
                      style={{
                        height: `${Math.max(20, (item.responses / Math.max(...responsesData.map(d => d.responses || 1))) * 200)}px`
                      }}
                    />
                    <span className="text-xs text-muted-foreground truncate w-full text-center" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Responses Over Time</CardTitle>
            <span className="text-xs text-muted-foreground">Daily (max 7 days)</span>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No timeline data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Polls */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Recent Polls</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchPolls}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Link href="/create">
            <Button size="sm" data-tour="creator-create-poll">
              <Plus className="w-4 h-4 mr-2" /> Create Poll
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <PollSkeleton />
          <PollSkeleton />
          <PollSkeleton />
        </div>
      ) : myPolls.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              You haven't created any polls yet.
            </p>
            <Link href="/create">
              <Button>
                <Plus className="w-4 h-4 mr-2" /> Create Your First Poll
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div data-tour="recent-polls" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myPolls.slice(0, 6).map(renderPollCard)}
          </div>
          {myPolls.length > 6 && (
            <div className="mt-6 text-center">
              <Link href="/creator/manage">
                <Button variant="outline">
                  View All Polls <ArrowUpRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          )}
        </>
      )}

      {/* Pending Actions */}
      {myClaimingPolls.length > 0 && (
        <Card className="mt-8 border-yellow-500/30 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              Pending Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {myClaimingPolls.length} poll(s) are in claiming status. Participants can claim their rewards.
            </p>
            <Link href="/creator/distributions">
              <Button variant="outline" size="sm">
                Manage Distributions <ArrowUpRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </CreatorLayout>
  );
}
