import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { DonorLayout } from "@/components/layouts/DonorLayout";
import { PollCard } from "@/components/PollCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RefreshCcw,
  AlertCircle,
  Compass,
} from "lucide-react";
import { useContract } from "@/hooks/useContract";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import type { PollWithMeta } from "@/types/poll";
import { getCoinSymbol, type CoinTypeId } from "@/lib/tokens";

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

export default function DonorFunded() {
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

  // Get polls the user has funded with their contribution info
  const fundedPollsWithContributions = useMemo(() => {
    const pollContributions = new Map<number, { total: number; coinTypeId: number }>();

    fundingHistory.forEach((f) => {
      const existing = pollContributions.get(f.pollId);
      if (existing) {
        existing.total += f.amount;
      } else {
        pollContributions.set(f.pollId, { total: f.amount, coinTypeId: f.coinTypeId });
      }
    });

    return polls
      .filter((p) => pollContributions.has(p.id))
      .map((p) => ({
        poll: p,
        contribution: pollContributions.get(p.id)!,
      }));
  }, [polls, fundingHistory]);

  const activeFunded = fundedPollsWithContributions.filter((p) => p.poll.isActive);
  const closedFunded = fundedPollsWithContributions.filter((p) => !p.poll.isActive);

  // Render poll card with contribution badge
  const renderFundedPollCard = ({ poll, contribution }: { poll: PollWithMeta; contribution: { total: number; coinTypeId: number } }) => {
    const rewardPool = poll.reward_pool / 1e8;
    const coinSymbol = getCoinSymbol(poll.coin_type_id as CoinTypeId);
    const contributionAmount = contribution.total / 1e8;

    return (
      <div key={poll.id} className="relative">
        <PollCard
          id={poll.id.toString()}
          title={poll.title}
          description={poll.description}
          votes={poll.totalVotes}
          timeLeft={poll.timeRemaining}
          reward={rewardPool > 0 ? `${rewardPool.toFixed(2)} ${coinSymbol}` : undefined}
          status={poll.isActive ? "active" : "closed"}
          tags={[]}
        />
        <Badge className="absolute top-3 right-3 bg-primary/80">
          {contributionAmount.toFixed(2)} {getCoinSymbol(contribution.coinTypeId as CoinTypeId)} funded
        </Badge>
      </div>
    );
  };

  // Loading skeleton
  const PollSkeleton = () => (
    <Skeleton className="h-48 w-full rounded-xl" />
  );

  if (!isConnected) {
    return (
      <DonorLayout title="Funded Polls" description="Polls you have contributed to">
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to view your funded polls.
            </p>
          </CardContent>
        </Card>
      </DonorLayout>
    );
  }

  return (
    <DonorLayout title="Funded Polls" description="Polls you have contributed to">
      {/* Actions */}
      <div className="flex justify-end mb-6">
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
      ) : fundedPollsWithContributions.length === 0 ? (
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
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="active">
              Active ({activeFunded.length})
            </TabsTrigger>
            <TabsTrigger value="closed">
              Closed ({closedFunded.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {activeFunded.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-muted-foreground">
                    No active funded polls.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeFunded.map(renderFundedPollCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="closed">
            {closedFunded.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-muted-foreground">
                    No closed funded polls.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {closedFunded.map(renderFundedPollCard)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </DonorLayout>
  );
}
