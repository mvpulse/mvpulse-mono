import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { DonorLayout } from "@/components/layouts/DonorLayout";
import { PollCard } from "@/components/PollCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Heart,
  TrendingUp,
  Coins,
  Zap,
  RefreshCcw,
  AlertCircle,
  ArrowUpRight,
  Compass,
} from "lucide-react";
import { useContract } from "@/hooks/useContract";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import type { PollWithMeta } from "@/types/poll";
import { getCoinSymbol, COIN_TYPES, type CoinTypeId } from "@/lib/tokens";

// Local storage key for tracking user's fundings
const FUNDING_HISTORY_KEY = "mvpulse_funding_history";

interface FundingRecord {
  pollId: number;
  amount: number;
  coinTypeId: number;
  timestamp: number;
  txHash: string;
}

function getFundingHistory(address: string): FundingRecord[] {
  try {
    const data = localStorage.getItem(`${FUNDING_HISTORY_KEY}_${address}`);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export default function DonorDashboard() {
  const { isConnected, address } = useWalletConnection();
  const { getAllPolls, contractAddress } = useContract();

  const [polls, setPolls] = useState<PollWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fundingHistory, setFundingHistory] = useState<FundingRecord[]>([]);

  // Load funding history from local storage
  useEffect(() => {
    if (address) {
      setFundingHistory(getFundingHistory(address));
    }
  }, [address]);

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

  // Get polls the user has funded
  const fundedPollIds = useMemo(() => {
    return new Set(fundingHistory.map((f) => f.pollId));
  }, [fundingHistory]);

  const fundedPolls = useMemo(() => {
    return polls.filter((p) => fundedPollIds.has(p.id));
  }, [polls, fundedPollIds]);

  // Get active polls that need funding
  const pollsNeedingFunding = useMemo(() => {
    return polls.filter((p) => p.isActive);
  }, [polls]);

  // Calculate stats - group by token type (exclude MOVE, only show PULSE and USDC)
  const stats = useMemo(() => {
    const fundedByToken: Record<string, number> = {};
    fundingHistory.forEach((f) => {
      // Skip MOVE (coin_type_id = 0), only aggregate PULSE and USDC
      if (f.coinTypeId === COIN_TYPES.MOVE) return;
      const coinSymbol = getCoinSymbol(f.coinTypeId as CoinTypeId);
      fundedByToken[coinSymbol] = (fundedByToken[coinSymbol] || 0) + (f.amount / 1e8);
    });

    return {
      totalFundings: fundingHistory.length,
      pollsFunded: fundedPollIds.size,
      fundedByToken,
      activeFundedPolls: fundedPolls.filter((p) => p.isActive).length,
    };
  }, [fundingHistory, fundedPollIds, fundedPolls]);

  // Render poll card with optional action label
  const renderPollCard = (poll: PollWithMeta, actionLabel?: string) => {
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
        actionLabel={actionLabel}
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
      <DonorLayout title="Donor Dashboard" description="Fund polls and support the community">
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to view your donor dashboard.
            </p>
          </CardContent>
        </Card>
      </DonorLayout>
    );
  }

  return (
    <DonorLayout title="Donor Dashboard" description="Fund polls and support the community">
      {/* Hidden tour welcome target */}
      <div data-tour="donor-welcome" className="sr-only" />

      {/* Stats Cards */}
      <div data-tour="donor-stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
                  <p className="text-sm text-muted-foreground">Polls Funded</p>
                  <Heart className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold font-mono mt-2">{stats.pollsFunded}</p>
                <p className="text-xs text-muted-foreground mt-1">Total contributions</p>
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
                <p className="text-xs text-muted-foreground mt-1">Rewards contributed</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Active Funded</p>
                  <Zap className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold font-mono mt-2">{stats.activeFundedPolls}</p>
                <p className="text-xs text-muted-foreground mt-1">Still running</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Available to Fund</p>
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold font-mono mt-2">{pollsNeedingFunding.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Active polls</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Your Funded Polls */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Your Funded Polls</h2>
          <Link href="/donor/funded">
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
        ) : fundedPolls.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">
                You haven't funded any polls yet.
              </p>
              <Link href="/donor/explore">
                <Button>
                  <Compass className="w-4 h-4 mr-2" /> Explore Polls
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {fundedPolls.slice(0, 3).map((poll) => renderPollCard(poll))}
          </div>
        )}
      </div>

      {/* Recommended Polls to Fund */}
      <div data-tour="recommended-polls">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recommended Polls</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchPolls}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
            </Button>
            <Link href="/donor/explore">
              <Button size="sm">
                <Compass className="w-4 h-4 mr-2" /> Explore All
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
        ) : pollsNeedingFunding.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">
                No active polls available. Check back later!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pollsNeedingFunding
              .filter((p) => !fundedPollIds.has(p.id))
              .slice(0, 6)
              .map((poll) => renderPollCard(poll, "Fund"))}
          </div>
        )}
      </div>
    </DonorLayout>
  );
}
