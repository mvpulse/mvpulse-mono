import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { DonorLayout } from "@/components/layouts/DonorLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCcw,
  AlertCircle,
  Heart,
  Users,
  Clock,
  Coins,
  Loader2,
  Search,
  Filter,
} from "lucide-react";
import { useContract } from "@/hooks/useContract";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useNetwork } from "@/contexts/NetworkContext";
import type { PollWithMeta } from "@/types/poll";
import { COIN_TYPES, getCoinSymbol, type CoinTypeId } from "@/lib/tokens";
import { showTransactionSuccessToast, showTransactionErrorToast } from "@/lib/transaction-feedback";

// Local storage key for tracking user's fundings
const FUNDING_HISTORY_KEY = "mvpulse_funding_history";

interface FundingRecord {
  pollId: number;
  amount: number;
  coinTypeId: number;
  timestamp: number;
  txHash: string;
}

function saveFundingRecord(address: string, record: FundingRecord) {
  try {
    const key = `${FUNDING_HISTORY_KEY}_${address}`;
    const existing = localStorage.getItem(key);
    const history: FundingRecord[] = existing ? JSON.parse(existing) : [];
    history.unshift(record);
    localStorage.setItem(key, JSON.stringify(history.slice(0, 100))); // Keep last 100
  } catch (error) {
    console.error("Failed to save funding record:", error);
  }
}

export default function DonorExplore() {
  const { isConnected, address } = useWalletConnection();
  const { getAllPolls, fundPoll, contractAddress } = useContract();
  const { config } = useNetwork();

  const [polls, setPolls] = useState<PollWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "votes" | "reward">("newest");

  // Funding dialog state
  const [fundingPoll, setFundingPoll] = useState<PollWithMeta | null>(null);
  const [fundAmount, setFundAmount] = useState("");
  const [isFunding, setIsFunding] = useState(false);

  // Fetch polls
  const fetchPolls = useCallback(async () => {
    if (!contractAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const allPolls = await getAllPolls();
      setPolls(allPolls.filter((p) => p.isActive));
    } catch (error) {
      console.error("Failed to fetch polls:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getAllPolls, contractAddress]);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  // Filter and sort polls
  const filteredPolls = useMemo(() => {
    let result = polls.filter((p) =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    switch (sortBy) {
      case "votes":
        result.sort((a, b) => b.totalVotes - a.totalVotes);
        break;
      case "reward":
        result.sort((a, b) => b.reward_pool - a.reward_pool);
        break;
      case "newest":
      default:
        result.sort((a, b) => b.id - a.id);
        break;
    }

    return result;
  }, [polls, searchTerm, sortBy]);

  // Handle funding
  const handleFund = async () => {
    if (!fundingPoll || !fundAmount || !address) return;

    const amountOctas = Math.floor(parseFloat(fundAmount) * 1e8);
    if (isNaN(amountOctas) || amountOctas <= 0) {
      showTransactionErrorToast("Invalid amount", "Please enter a valid amount");
      return;
    }

    setIsFunding(true);
    try {
      const coinTypeId = fundingPoll.coin_type_id as CoinTypeId;
      const result = await fundPoll(fundingPoll.id, amountOctas, coinTypeId);

      // Save to local storage
      saveFundingRecord(address, {
        pollId: fundingPoll.id,
        amount: amountOctas,
        coinTypeId,
        timestamp: Date.now(),
        txHash: result.hash,
      });

      showTransactionSuccessToast(
        result.hash,
        "Poll Funded!",
        `You contributed ${fundAmount} ${getCoinSymbol(coinTypeId)} to this poll.`,
        config.explorerUrl,
        result.sponsored
      );

      setFundingPoll(null);
      setFundAmount("");
      fetchPolls(); // Refresh to show updated pool
    } catch (error) {
      console.error("Failed to fund poll:", error);
      showTransactionErrorToast("Failed to fund poll", error instanceof Error ? error : "Transaction failed");
    } finally {
      setIsFunding(false);
    }
  };

  // Loading skeleton
  const PollSkeleton = () => (
    <Skeleton className="h-64 w-full rounded-xl" />
  );

  if (!isConnected) {
    return (
      <DonorLayout title="Explore Polls" description="Find polls to fund and support">
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to fund polls.
            </p>
          </CardContent>
        </Card>
      </DonorLayout>
    );
  }

  return (
    <DonorLayout title="Explore Polls" description="Find polls to fund and support">
      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search polls..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="votes">Most Votes</SelectItem>
              <SelectItem value="reward">Highest Reward</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchPolls}>
            <RefreshCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Polls Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <PollSkeleton />
          <PollSkeleton />
          <PollSkeleton />
          <PollSkeleton />
          <PollSkeleton />
          <PollSkeleton />
        </div>
      ) : filteredPolls.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">
              {searchTerm ? "No polls match your search." : "No active polls available."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPolls.map((poll) => {
            const rewardPool = poll.reward_pool / 1e8;
            const coinSymbol = getCoinSymbol(poll.coin_type_id as CoinTypeId);

            return (
              <Card key={poll.id} className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Link href={`/poll/${poll.id}`}>
                        <CardTitle className="text-lg truncate hover:text-primary transition-colors cursor-pointer">
                          {poll.title}
                        </CardTitle>
                      </Link>
                      <CardDescription className="line-clamp-2 mt-1">
                        {poll.description}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      Active
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>{poll.totalVotes} votes</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>{poll.timeRemaining}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Coins className="w-4 h-4 text-primary" />
                        <span className="font-mono font-semibold">
                          {rewardPool.toFixed(2)} {coinSymbol}
                        </span>
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      onClick={() => setFundingPoll(poll)}
                    >
                      <Heart className="w-4 h-4 mr-2" />
                      Fund This Poll
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Funding Dialog */}
      <Dialog open={!!fundingPoll} onOpenChange={(open) => !open && setFundingPoll(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fund Poll</DialogTitle>
            <DialogDescription>
              {fundingPoll && (
                <>
                  Contribute to "{fundingPoll.title}" reward pool. Your contribution will be distributed to voters.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {fundingPoll && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Current Reward Pool</span>
                  <span className="font-mono font-semibold">
                    {(fundingPoll.reward_pool / 1e8).toFixed(4)} {getCoinSymbol(fundingPoll.coin_type_id as CoinTypeId)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current Voters</span>
                  <span className="font-mono">{fundingPoll.totalVotes}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fundAmount">
                  Amount ({getCoinSymbol(fundingPoll.coin_type_id as CoinTypeId)})
                </Label>
                <Input
                  id="fundAmount"
                  type="number"
                  placeholder="0.00"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-muted-foreground">
                  A 2% platform fee will be applied to your contribution.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFundingPoll(null)} disabled={isFunding}>
              Cancel
            </Button>
            <Button onClick={handleFund} disabled={isFunding || !fundAmount}>
              {isFunding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Funding...
                </>
              ) : (
                <>
                  <Heart className="w-4 h-4 mr-2" />
                  Fund Poll
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DonorLayout>
  );
}
