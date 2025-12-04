import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { CreatorLayout } from "@/components/layouts/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  RefreshCcw,
  Plus,
  AlertCircle,
  ExternalLink,
  XCircle,
  Send,
  Wallet,
  MoreHorizontal,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useContract } from "@/hooks/useContract";
import type { PollWithMeta } from "@/types/poll";
import { POLL_STATUS, DISTRIBUTION_MODE } from "@/types/poll";
import { toast } from "sonner";
import { useNetwork } from "@/contexts/NetworkContext";
import { truncateAddress } from "@/lib/contract";

export default function ManagePolls() {
  const { connected, account } = useWallet();
  const { getAllPolls, closePoll, distributeRewards, withdrawRemaining, contractAddress } = useContract();
  const { config } = useNetwork();

  const [polls, setPolls] = useState<PollWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Modal states
  const [closePollModal, setClosePollModal] = useState<{ open: boolean; pollId: number | null }>({
    open: false,
    pollId: null,
  });
  const [selectedDistributionMode, setSelectedDistributionMode] = useState(DISTRIBUTION_MODE.MANUAL_PULL);
  const [actionLoading, setActionLoading] = useState<{ type: string; pollId: number } | null>(null);

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
    if (!account?.address) return [];
    return polls.filter(
      (p) => p.creator.toLowerCase() === account.address.toString().toLowerCase()
    );
  }, [polls, account?.address]);

  // Filter by tab and search
  const filteredPolls = useMemo(() => {
    let filtered = myPolls;

    // Filter by tab
    if (activeTab === "active") {
      filtered = filtered.filter((p) => p.status === POLL_STATUS.ACTIVE);
    } else if (activeTab === "closed") {
      filtered = filtered.filter((p) => p.status === POLL_STATUS.CLOSED);
    } else if (activeTab === "claiming") {
      filtered = filtered.filter((p) => p.status === POLL_STATUS.CLAIMING);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [myPolls, activeTab, searchQuery]);

  // Handle close poll
  const handleClosePoll = async () => {
    if (!closePollModal.pollId) return;

    setActionLoading({ type: "close", pollId: closePollModal.pollId });
    try {
      const result = await closePoll(closePollModal.pollId, selectedDistributionMode);
      toast.success("Poll Closed!", {
        description: selectedDistributionMode === DISTRIBUTION_MODE.MANUAL_PULL
          ? "Participants can now claim their rewards."
          : "You can now distribute rewards to all voters.",
        action: {
          label: "View TX",
          onClick: () => window.open(`${config.explorerUrl}/txn/${result.hash}?network=testnet`, "_blank"),
        },
      });
      setClosePollModal({ open: false, pollId: null });
      await fetchPolls();
    } catch (error) {
      console.error("Failed to close poll:", error);
      toast.error("Failed to close poll", {
        description: error instanceof Error ? error.message : "Transaction failed",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Handle distribute rewards
  const handleDistribute = async (pollId: number) => {
    setActionLoading({ type: "distribute", pollId });
    try {
      const result = await distributeRewards(pollId);
      toast.success("Rewards Distributed!", {
        description: "All voters have received their rewards.",
        action: {
          label: "View TX",
          onClick: () => window.open(`${config.explorerUrl}/txn/${result.hash}?network=testnet`, "_blank"),
        },
      });
      await fetchPolls();
    } catch (error) {
      console.error("Failed to distribute:", error);
      toast.error("Failed to distribute rewards", {
        description: error instanceof Error ? error.message : "Transaction failed",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Handle withdraw remaining
  const handleWithdraw = async (pollId: number) => {
    setActionLoading({ type: "withdraw", pollId });
    try {
      const result = await withdrawRemaining(pollId);
      toast.success("Funds Withdrawn!", {
        description: "Remaining funds have been returned to your wallet.",
        action: {
          label: "View TX",
          onClick: () => window.open(`${config.explorerUrl}/txn/${result.hash}?network=testnet`, "_blank"),
        },
      });
      await fetchPolls();
    } catch (error) {
      console.error("Failed to withdraw:", error);
      toast.error("Failed to withdraw funds", {
        description: error instanceof Error ? error.message : "Transaction failed",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Get status badge
  const getStatusBadge = (poll: PollWithMeta) => {
    switch (poll.status) {
      case POLL_STATUS.ACTIVE:
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/50">Active</Badge>;
      case POLL_STATUS.CLAIMING:
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">Claiming</Badge>;
      case POLL_STATUS.CLOSED:
        return <Badge variant="secondary">Closed</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  // Loading skeleton
  const PollRowSkeleton = () => (
    <div className="flex items-center gap-4 p-4 border-b border-border/50">
      <Skeleton className="h-5 w-5" />
      <div className="flex-1">
        <Skeleton className="h-5 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-6 w-16" />
      <Skeleton className="h-8 w-8" />
    </div>
  );

  if (!connected) {
    return (
      <CreatorLayout title="Manage Polls" description="View and manage all your polls">
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to manage your polls.
            </p>
          </CardContent>
        </Card>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout title="Manage Polls" description="View and manage all your polls">
      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search polls..."
            className="pl-10 bg-muted/30"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchPolls}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Link href="/create">
            <Button>
              <Plus className="w-4 h-4 mr-2" /> Create Poll
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/30 mb-6">
          <TabsTrigger value="all">All ({myPolls.length})</TabsTrigger>
          <TabsTrigger value="active">
            Active ({myPolls.filter((p) => p.status === POLL_STATUS.ACTIVE).length})
          </TabsTrigger>
          <TabsTrigger value="claiming">
            Claiming ({myPolls.filter((p) => p.status === POLL_STATUS.CLAIMING).length})
          </TabsTrigger>
          <TabsTrigger value="closed">
            Closed ({myPolls.filter((p) => p.status === POLL_STATUS.CLOSED).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            {isLoading ? (
              <div>
                <PollRowSkeleton />
                <PollRowSkeleton />
                <PollRowSkeleton />
              </div>
            ) : filteredPolls.length === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground mb-4">
                  {searchQuery ? "No polls match your search." : "No polls found in this category."}
                </p>
                {!searchQuery && (
                  <Link href="/create">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" /> Create Your First Poll
                    </Button>
                  </Link>
                )}
              </CardContent>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredPolls.map((poll) => {
                  const rewardPoolMove = poll.reward_pool / 1e8;
                  const isActionLoading = actionLoading?.pollId === poll.id;

                  return (
                    <Link
                      key={poll.id}
                      href={`/creator/manage/${poll.id}`}
                      className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium hover:text-primary transition-colors truncate">
                            {poll.title}
                          </span>
                          {getStatusBadge(poll)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {poll.totalVotes} votes • {rewardPoolMove.toFixed(4)} MOVE • {poll.timeRemaining}
                        </p>
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            window.open(`/poll/${poll.id}`, "_blank");
                          }}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isActionLoading}
                              onClick={(e) => e.preventDefault()}
                            >
                              {isActionLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="w-4 h-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {poll.status === POLL_STATUS.ACTIVE && (
                              <DropdownMenuItem
                                onClick={() => setClosePollModal({ open: true, pollId: poll.id })}
                              >
                                <XCircle className="w-4 h-4 mr-2" /> Close Poll
                              </DropdownMenuItem>
                            )}
                            {poll.status === POLL_STATUS.CLOSED &&
                              poll.distribution_mode === DISTRIBUTION_MODE.MANUAL_PUSH &&
                              !poll.rewards_distributed && (
                                <DropdownMenuItem onClick={() => handleDistribute(poll.id)}>
                                  <Send className="w-4 h-4 mr-2" /> Distribute Rewards
                                </DropdownMenuItem>
                              )}
                            {(poll.status === POLL_STATUS.CLOSED || poll.status === POLL_STATUS.CLAIMING) &&
                              poll.reward_pool > 0 && (
                                <DropdownMenuItem onClick={() => handleWithdraw(poll.id)}>
                                  <Wallet className="w-4 h-4 mr-2" /> Withdraw Remaining
                                </DropdownMenuItem>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Close Poll Modal */}
      <Dialog open={closePollModal.open} onOpenChange={(open) => setClosePollModal({ open, pollId: open ? closePollModal.pollId : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close Poll & Select Distribution Mode</DialogTitle>
            <DialogDescription>
              Choose how rewards will be distributed to voters. This cannot be changed after closing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <RadioGroup
              value={selectedDistributionMode.toString()}
              onValueChange={(value) => setSelectedDistributionMode(parseInt(value, 10))}
              className="gap-4"
            >
              <div
                className={`flex items-start space-x-3 border rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedDistributionMode === DISTRIBUTION_MODE.MANUAL_PULL
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
                onClick={() => setSelectedDistributionMode(DISTRIBUTION_MODE.MANUAL_PULL)}
              >
                <RadioGroupItem value={DISTRIBUTION_MODE.MANUAL_PULL.toString()} id="pull" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="pull" className="font-semibold cursor-pointer">
                    Voters Claim (Pull)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Each voter can claim their own reward. Unclaimed funds can be withdrawn later.
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start space-x-3 border rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedDistributionMode === DISTRIBUTION_MODE.MANUAL_PUSH
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
                onClick={() => setSelectedDistributionMode(DISTRIBUTION_MODE.MANUAL_PUSH)}
              >
                <RadioGroupItem value={DISTRIBUTION_MODE.MANUAL_PUSH.toString()} id="push" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="push" className="font-semibold cursor-pointer">
                    Distribute to All (Push)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    You distribute rewards to all voters in a single transaction.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setClosePollModal({ open: false, pollId: null })}
              disabled={actionLoading?.type === "close"}
            >
              Cancel
            </Button>
            <Button
              onClick={handleClosePoll}
              disabled={actionLoading?.type === "close"}
              className="bg-destructive hover:bg-destructive/90"
            >
              {actionLoading?.type === "close" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Closing...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" /> Close Poll
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CreatorLayout>
  );
}
