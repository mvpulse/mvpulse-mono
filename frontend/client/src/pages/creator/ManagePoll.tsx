import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { CreatorLayout } from "@/components/layouts/CreatorLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Users,
  Coins,
  Gift,
  BarChart3,
  Clock,
  RefreshCcw,
  ExternalLink,
  XCircle,
  Send,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  HandCoins,
  Copy,
} from "lucide-react";
import { useContract } from "@/hooks/useContract";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useNetwork } from "@/contexts/NetworkContext";
import { truncateAddress } from "@/lib/contract";
import type { PollWithMeta } from "@/types/poll";
import { POLL_STATUS, DISTRIBUTION_MODE } from "@/types/poll";
import { getCoinSymbol, CoinTypeId } from "@/lib/tokens";
import { toast } from "sonner";
import { showTransactionSuccessToast, showTransactionErrorToast } from "@/lib/transaction-feedback";

export default function ManagePoll() {
  const { pollId: pollIdParam } = useParams();
  const [, navigate] = useLocation();
  const { isConnected, address } = useWalletConnection();
  const { getPoll, closePoll, distributeRewards, withdrawRemaining, contractAddress } = useContract();
  const { config } = useNetwork();

  const [poll, setPoll] = useState<PollWithMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVotersOpen, setIsVotersOpen] = useState(false);

  // Modal states
  const [closePollModal, setClosePollModal] = useState(false);
  const [selectedDistributionMode, setSelectedDistributionMode] = useState<number>(DISTRIBUTION_MODE.MANUAL_PULL as number);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const pollId = pollIdParam ? parseInt(pollIdParam, 10) : null;

  // Fetch poll data
  const fetchPoll = useCallback(async () => {
    if (pollId === null || isNaN(pollId) || !contractAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const pollData = await getPoll(pollId);
      setPoll(pollData);
    } catch (error) {
      console.error("Failed to fetch poll:", error);
      toast.error("Failed to load poll data");
    } finally {
      setIsLoading(false);
    }
  }, [pollId, getPoll, contractAddress]);

  useEffect(() => {
    fetchPoll();
  }, [fetchPoll]);

  // Check if current user is the poll creator
  const isCreator = poll && address
    ? poll.creator.toLowerCase() === address.toLowerCase()
    : false;

  // Redirect if not creator (after loading)
  useEffect(() => {
    if (!isLoading && poll && !isCreator) {
      toast.error("Access denied", { description: "You are not the creator of this poll" });
      navigate("/creator/manage");
    }
  }, [isLoading, poll, isCreator, navigate]);

  // Handle close poll
  const handleClosePoll = async () => {
    if (pollId === null) return;

    setActionLoading("close");
    try {
      const result = await closePoll(pollId, selectedDistributionMode);
      showTransactionSuccessToast(
        result.hash,
        "Poll Closed!",
        selectedDistributionMode === DISTRIBUTION_MODE.MANUAL_PULL
          ? "Participants can now claim their rewards."
          : "You can now distribute rewards to all voters.",
        config.explorerUrl,
        result.sponsored
      );
      setClosePollModal(false);
      await fetchPoll();
    } catch (error) {
      console.error("Failed to close poll:", error);
      showTransactionErrorToast("Failed to close poll", error instanceof Error ? error : "Transaction failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Handle distribute rewards
  const handleDistribute = async () => {
    if (pollId === null || !poll) return;

    setActionLoading("distribute");
    try {
      const result = await distributeRewards(pollId, poll.coin_type_id as CoinTypeId);
      showTransactionSuccessToast(
        result.hash,
        "Rewards Distributed!",
        "All voters have received their rewards.",
        config.explorerUrl,
        result.sponsored
      );
      await fetchPoll();
    } catch (error) {
      console.error("Failed to distribute:", error);
      showTransactionErrorToast("Failed to distribute rewards", error instanceof Error ? error : "Transaction failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Handle withdraw remaining
  const handleWithdraw = async () => {
    if (pollId === null || !poll) return;

    setActionLoading("withdraw");
    try {
      const result = await withdrawRemaining(pollId, poll.coin_type_id as CoinTypeId);
      showTransactionSuccessToast(
        result.hash,
        "Funds Withdrawn!",
        "Remaining funds have been returned to your wallet.",
        config.explorerUrl,
        result.sponsored
      );
      await fetchPoll();
    } catch (error) {
      console.error("Failed to withdraw:", error);
      showTransactionErrorToast("Failed to withdraw funds", error instanceof Error ? error : "Transaction failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Copy address to clipboard
  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success("Address copied!");
  };

  // Get status badge
  const getStatusBadge = (status: number) => {
    switch (status) {
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

  // Loading state
  if (isLoading) {
    return (
      <CreatorLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div className="flex-1">
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </CreatorLayout>
    );
  }

  // Not found
  if (!poll) {
    return (
      <CreatorLayout>
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">Poll Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The poll you're looking for doesn't exist or has been removed.
            </p>
            <Link href="/creator/manage">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Manage Polls
              </Button>
            </Link>
          </CardContent>
        </Card>
      </CreatorLayout>
    );
  }

  // Not connected
  if (!isConnected) {
    return (
      <CreatorLayout>
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to manage polls.
            </p>
          </CardContent>
        </Card>
      </CreatorLayout>
    );
  }

  const rewardPoolMove = poll.reward_pool / 1e8;
  const rewardPerVoteMove = poll.reward_per_vote / 1e8;
  const estimatedRewardPerVoter = poll.totalVotes > 0
    ? (poll.reward_per_vote > 0 ? rewardPerVoteMove : rewardPoolMove / poll.totalVotes)
    : rewardPerVoteMove > 0 ? rewardPerVoteMove : 0;

  return (
    <CreatorLayout>
      {/* Header */}
      <div className="mb-6">
        <Link href="/creator/manage" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Manage Polls
        </Link>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl md:text-3xl font-display font-bold">{poll.title}</h1>
              {getStatusBadge(poll.status)}
            </div>
            <p className="text-muted-foreground">{poll.description}</p>
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>{poll.timeRemaining}</span>
            </div>
          </div>
          <Button variant="outline" onClick={fetchPoll} disabled={isLoading}>
            <RefreshCcw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="w-4 h-4" />
              <span className="text-sm">Total Votes</span>
            </div>
            <p className="text-2xl font-bold font-mono">{poll.totalVotes}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Coins className="w-4 h-4" />
              <span className="text-sm">Reward Pool</span>
            </div>
            <p className="text-2xl font-bold font-mono">{rewardPoolMove.toFixed(4)}</p>
            <p className="text-xs text-muted-foreground">{getCoinSymbol(poll.coin_type_id as CoinTypeId)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Gift className="w-4 h-4" />
              <span className="text-sm">Claims</span>
            </div>
            <p className="text-2xl font-bold font-mono">
              {poll.claimed.length}/{poll.totalVotes}
            </p>
            {poll.totalVotes > 0 && (
              <Progress value={(poll.claimed.length / poll.totalVotes) * 100} className="h-1 mt-2" />
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <BarChart3 className="w-4 h-4" />
              <span className="text-sm">Per Voter</span>
            </div>
            <p className="text-2xl font-bold font-mono">
              {estimatedRewardPerVoter > 0 ? `~${estimatedRewardPerVoter.toFixed(4)}` : "0"}
            </p>
            <p className="text-xs text-muted-foreground">{getCoinSymbol(poll.coin_type_id as CoinTypeId)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Vote Results & Voters */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vote Results */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" /> Vote Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {poll.options.map((option, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{option}</span>
                    <span className="font-mono">
                      {poll.votePercentages[index]}% ({poll.votes[index]} votes)
                    </span>
                  </div>
                  <Progress value={poll.votePercentages[index]} className="h-3" />
                </div>
              ))}
              {poll.totalVotes === 0 && (
                <p className="text-center text-muted-foreground py-4">No votes yet</p>
              )}
            </CardContent>
          </Card>

          {/* Voters List */}
          <Collapsible open={isVotersOpen} onOpenChange={setIsVotersOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Users className="w-5 h-5" /> Voters ({poll.voters.length})
                    </span>
                    {isVotersOpen ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  {poll.voters.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No voters yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Address</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {poll.voters.map((voter, index) => {
                          const hasClaimed = poll.claimed.some(
                            (c) => c.toLowerCase() === voter.toLowerCase()
                          );
                          return (
                            <TableRow key={index}>
                              <TableCell className="font-mono text-sm">
                                {truncateAddress(voter)}
                              </TableCell>
                              <TableCell>
                                {poll.status === POLL_STATUS.CLAIMING || poll.status === POLL_STATUS.CLOSED ? (
                                  hasClaimed ? (
                                    <Badge variant="outline" className="text-green-500 border-green-500/50">
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Claimed
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-yellow-500 border-yellow-500/50">
                                      Pending
                                    </Badge>
                                  )
                                ) : (
                                  <Badge variant="outline">Voted</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyAddress(voter)}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(`${config.explorerUrl}/account/${voter}?network=testnet`, "_blank")}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>

        {/* Right Column - Actions & Details */}
        <div className="space-y-6">
          {/* Actions Card */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Close Poll - Active only */}
              {poll.status === POLL_STATUS.ACTIVE && (
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={() => setClosePollModal(true)}
                  disabled={actionLoading !== null}
                >
                  <XCircle className="w-4 h-4 mr-2" /> Close Poll
                </Button>
              )}

              {/* Distribute - Closed + Push mode + not distributed */}
              {poll.status === POLL_STATUS.CLOSED &&
                poll.distribution_mode === DISTRIBUTION_MODE.MANUAL_PUSH &&
                !poll.rewards_distributed && (
                  <Button
                    className="w-full"
                    onClick={handleDistribute}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === "distribute" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Distributing...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" /> Distribute to All ({poll.totalVotes})
                      </>
                    )}
                  </Button>
                )}

              {/* Withdraw - Closed/Claiming with remaining funds */}
              {(poll.status === POLL_STATUS.CLOSED || poll.status === POLL_STATUS.CLAIMING) &&
                poll.reward_pool > 0 && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={handleWithdraw}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === "withdraw" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Withdrawing...
                      </>
                    ) : (
                      <>
                        <Wallet className="w-4 h-4 mr-2" /> Withdraw Remaining
                      </>
                    )}
                  </Button>
                )}

              {/* Status messages */}
              {poll.rewards_distributed && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Rewards have been distributed
                </div>
              )}

              {poll.status === POLL_STATUS.CLAIMING && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-sm flex items-center gap-2">
                  <HandCoins className="w-4 h-4" />
                  Voters are claiming rewards
                </div>
              )}

              {poll.status === POLL_STATUS.ACTIVE && (
                <p className="text-xs text-muted-foreground text-center">
                  Close the poll to enable reward distribution
                </p>
              )}
            </CardContent>
          </Card>

          {/* Poll Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Poll Details</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Poll ID</span>
                  <span className="font-mono">#{poll.id}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  {getStatusBadge(poll.status)}
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Distribution</span>
                  <Badge variant="outline">
                    {poll.distribution_mode === DISTRIBUTION_MODE.UNSET
                      ? "Not set"
                      : poll.distribution_mode === DISTRIBUTION_MODE.MANUAL_PULL
                      ? "Pull (Claim)"
                      : "Push (Distribute)"}
                  </Badge>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Max Voters</span>
                  <span className="font-mono">{poll.max_voters > 0 ? poll.max_voters : "Unlimited"}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Reward Type</span>
                  <span className="text-xs">
                    {poll.reward_per_vote > 0 ? "Fixed per vote" : "Equal split"}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Token</span>
                  <Badge variant="outline">{getCoinSymbol(poll.coin_type_id as CoinTypeId)}</Badge>
                </li>
              </ul>
              <div className="mt-4 pt-4 border-t border-border/50">
                <Link href={`/poll/${poll.id}`}>
                  <Button variant="outline" className="w-full">
                    <ExternalLink className="w-4 h-4 mr-2" /> View Public Page
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Close Poll Modal */}
      <Dialog open={closePollModal} onOpenChange={setClosePollModal}>
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
              onClick={() => setClosePollModal(false)}
              disabled={actionLoading === "close"}
            >
              Cancel
            </Button>
            <Button
              onClick={handleClosePoll}
              disabled={actionLoading === "close"}
              className="bg-destructive hover:bg-destructive/90"
            >
              {actionLoading === "close" ? (
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
