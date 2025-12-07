import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy, Clock, Share2, AlertCircle, Loader2, Wallet, CheckCircle2, Gift, Send, Coins, XCircle, Users, HandCoins, Flame } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useContract } from "@/hooks/useContract";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useNetwork } from "@/contexts/NetworkContext";
import { useVoteLimit } from "@/hooks/useVoteLimit";
import { useSeason } from "@/hooks/useQuests";
import { truncateAddress } from "@/lib/contract";
import { getCoinSymbol, CoinTypeId, COIN_TYPES } from "@/lib/tokens";
import { showTransactionSuccessToast, showTransactionErrorToast } from "@/lib/transaction-feedback";
import type { PollWithMeta } from "@/types/poll";
import { POLL_STATUS, DISTRIBUTION_MODE } from "@/types/poll";

export default function PollDetails() {
  const { id } = useParams();
  const { isConnected, address } = useWalletConnection();
  const {
    getPoll,
    vote,
    hasVoted: checkHasVoted,
    hasClaimed: checkHasClaimed,
    claimReward,
    distributeRewards,
    closePoll,
    loading: contractLoading,
  } = useContract();
  const { config } = useNetwork();

  // Vote limit tracking
  const {
    canVote: canVoteToday,
    votesRemaining,
    votesUsed,
    tierLimit,
    tier,
    tierName,
    currentStreak,
    recordVote,
    isRecordingVote,
    refetch: refetchVoteLimit,
  } = useVoteLimit(address);

  // Season tracking for quest progress
  const { season } = useSeason();

  const [poll, setPoll] = useState<PollWithMeta | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [userHasVoted, setUserHasVoted] = useState(false);
  const [userHasClaimed, setUserHasClaimed] = useState(false);
  const [userVotedOption, setUserVotedOption] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isClosePollModalOpen, setIsClosePollModalOpen] = useState(false);
  const [selectedDistributionMode, setSelectedDistributionMode] = useState<number>(DISTRIBUTION_MODE.MANUAL_PULL);

  const pollId = id ? parseInt(id, 10) : null;

  // Fetch poll data and vote status
  const fetchPollData = useCallback(async () => {
    if (pollId === null || isNaN(pollId)) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const pollData = await getPoll(pollId);
      setPoll(pollData);

      // Check if user has voted and claimed
      if (address) {
        const voted = await checkHasVoted(pollId);
        setUserHasVoted(voted);

        const claimed = await checkHasClaimed(pollId);
        setUserHasClaimed(claimed);

        // Find which option user voted for
        if (voted && pollData?.voters && address) {
          const voterIndex = pollData.voters.findIndex(
            (v) => v.toLowerCase() === address.toLowerCase()
          );
          if (voterIndex !== -1) {
            // The voter index corresponds to their vote (simplified - in reality we'd track this differently)
            setUserVotedOption(voterIndex < pollData.options.length ? voterIndex : null);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch poll:", error);
      toast.error("Failed to load poll data");
    } finally {
      setIsLoading(false);
    }
  }, [pollId, getPoll, checkHasVoted, checkHasClaimed, address]);

  useEffect(() => {
    fetchPollData();
  }, [fetchPollData]);

  // Handle vote submission
  const handleVote = async () => {
    if (selectedOption === null || pollId === null) return;

    if (!isConnected) {
      toast.error("Please connect your wallet to vote");
      return;
    }

    // Check vote limit before proceeding
    if (!canVoteToday) {
      toast.error("Daily Vote Limit Reached", {
        description: `You've used all ${tierLimit} votes for today. Come back tomorrow or upgrade your tier!`,
      });
      return;
    }

    setIsVoting(true);
    try {
      const result = await vote({ pollId, optionIndex: selectedOption });

      showTransactionSuccessToast(
        result.hash,
        "Vote Submitted!",
        "Your vote has been recorded on the Movement network.",
        config.explorerUrl,
        result.sponsored
      );

      setUserHasVoted(true);
      setUserVotedOption(selectedOption);

      // Record vote in backend for streak/quest tracking
      try {
        const recordResult = await recordVote({ pollId, seasonId: season?.id });

        // Show toast if any quests were completed
        if (recordResult.questsCompleted?.length > 0) {
          for (const quest of recordResult.questsCompleted) {
            toast.success(`Quest Completed: ${quest.questName}`, {
              description: `+${quest.pointsAwarded} points!`,
            });
          }
        }

        // Refetch vote limit to update UI
        refetchVoteLimit();
      } catch (recordError) {
        console.error("Failed to record vote in backend:", recordError);
        // Don't show error to user - the on-chain vote succeeded
      }

      // Refresh poll data to get updated vote counts
      await fetchPollData();
    } catch (error) {
      console.error("Failed to vote:", error);
      showTransactionErrorToast("Failed to submit vote", error instanceof Error ? error : "Transaction failed");
    } finally {
      setIsVoting(false);
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard!");
  };

  // Handle claiming reward (for Manual Pull mode)
  const handleClaim = async () => {
    if (pollId === null || !isConnected || !poll) return;

    setIsClaiming(true);
    try {
      const result = await claimReward(pollId, poll.coin_type_id as CoinTypeId);
      showTransactionSuccessToast(
        result.hash,
        "Reward Claimed!",
        "Your reward has been transferred to your wallet.",
        config.explorerUrl,
        result.sponsored
      );
      setUserHasClaimed(true);
      await fetchPollData();
    } catch (error) {
      console.error("Failed to claim reward:", error);
      showTransactionErrorToast("Failed to claim reward", error instanceof Error ? error : "Transaction failed");
    } finally {
      setIsClaiming(false);
    }
  };

  // Handle distributing rewards (for Manual Push mode - creator only)
  const handleDistribute = async () => {
    if (pollId === null || !isConnected || !poll) return;

    setIsDistributing(true);
    try {
      const result = await distributeRewards(pollId, poll.coin_type_id as CoinTypeId);
      showTransactionSuccessToast(
        result.hash,
        "Rewards Distributed!",
        "All voters have received their rewards.",
        config.explorerUrl,
        result.sponsored
      );
      await fetchPollData();
    } catch (error) {
      console.error("Failed to distribute rewards:", error);
      showTransactionErrorToast("Failed to distribute rewards", error instanceof Error ? error : "Transaction failed");
    } finally {
      setIsDistributing(false);
    }
  };

  // Handle closing poll (creator only)
  const handleClosePoll = async () => {
    if (pollId === null || !isConnected) return;

    setIsClosing(true);
    try {
      const result = await closePoll(pollId, selectedDistributionMode);
      setIsClosePollModalOpen(false);
      showTransactionSuccessToast(
        result.hash,
        "Poll Closed!",
        selectedDistributionMode === DISTRIBUTION_MODE.MANUAL_PULL
          ? "Participants can now claim their rewards."
          : "You can now distribute rewards to all voters.",
        config.explorerUrl,
        result.sponsored
      );
      await fetchPollData();
    } catch (error) {
      console.error("Failed to close poll:", error);
      showTransactionErrorToast("Failed to close poll", error instanceof Error ? error : "Transaction failed");
    } finally {
      setIsClosing(false);
    }
  };

  // Check if current user is the poll creator
  const isCreator = poll && address
    ? poll.creator.toLowerCase() === address.toLowerCase()
    : false;

  // Loading state
  if (isLoading) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-24" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Poll not found
  if (!poll) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">Poll Not Found</h2>
            <p className="text-muted-foreground">
              The poll you're looking for doesn't exist or has been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rewardPerVoteMove = poll.reward_per_vote / 1e8;
  const rewardPoolMove = poll.reward_pool / 1e8;
  const estimatedRewardPerVoter = poll.totalVotes > 0
    ? (poll.reward_per_vote > 0 ? rewardPerVoteMove : rewardPoolMove / poll.totalVotes)
    : 0;

  // Helper to get status label
  const getStatusLabel = () => {
    switch (poll.status) {
      case POLL_STATUS.ACTIVE:
        return { label: "Active", variant: "default" as const, className: "bg-green-500/20 text-green-500 border-green-500/50" };
      case POLL_STATUS.CLAIMING:
        return { label: "Claiming", variant: "default" as const, className: "bg-yellow-500/20 text-yellow-500 border-yellow-500/50" };
      case POLL_STATUS.CLOSED:
        return { label: "Closed", variant: "secondary" as const, className: "" };
      default:
        return { label: "Unknown", variant: "secondary" as const, className: "" };
    }
  };
  const statusInfo = getStatusLabel();

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Voting Area */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Badge
                variant={statusInfo.variant}
                className={statusInfo.className}
              >
                {statusInfo.label}
              </Badge>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {poll.timeRemaining}
              </span>
              {poll.reward_pool > 0 && (
                <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30">
                  <Coins className="w-3 h-3 mr-1" />
                  {rewardPoolMove.toFixed(2)} {getCoinSymbol(poll.coin_type_id as CoinTypeId)}
                </Badge>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight mb-4">
              {poll.title}
            </h1>
            <p className="text-muted-foreground text-lg">{poll.description}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Created by {truncateAddress(poll.creator)} {isCreator && <span className="text-primary">(You)</span>}
            </p>
          </div>

          {/* Wallet Connection Warning */}
          {!isConnected && (
            <Card className="border-yellow-500/50 bg-yellow-500/10">
              <CardContent className="flex items-center gap-3 py-4">
                <Wallet className="w-5 h-5 text-yellow-500" />
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  Please connect your wallet to vote on this poll.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Vote Limit & Tier Display */}
          {isConnected && poll.isActive && !userHasVoted && (
            <Card className={`${canVoteToday ? 'border-primary/30 bg-primary/5' : 'border-red-500/30 bg-red-500/5'}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${canVoteToday ? 'bg-primary/20' : 'bg-red-500/20'}`}>
                      <Users className={`w-4 h-4 ${canVoteToday ? 'text-primary' : 'text-red-500'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {canVoteToday ? (
                          <>Daily Votes: <span className="font-mono">{votesUsed}/{tierLimit}</span></>
                        ) : (
                          <span className="text-red-500">Daily limit reached</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tierName} Tier ({tierLimit} votes/day)
                        {currentStreak > 0 && (
                          <span className="ml-2 inline-flex items-center gap-1">
                            <Flame className="w-3 h-3 text-orange-500" />
                            {currentStreak} day streak
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {votesRemaining > 0 && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                      {votesRemaining} remaining
                    </Badge>
                  )}
                </div>
                {!canVoteToday && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Come back tomorrow or hold more PULSE to increase your tier!
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-primary/20 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-accent" />
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{userHasVoted ? "Results" : "Cast Your Vote"}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {poll.totalVotes} vote{poll.totalVotes !== 1 ? "s" : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!userHasVoted && poll.isActive ? (
                <RadioGroup
                  onValueChange={(value) => setSelectedOption(parseInt(value, 10))}
                  className="gap-4"
                >
                  {poll.options.map((option, index) => (
                    <div
                      key={index}
                      className="flex items-center space-x-2 border border-border p-4 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <RadioGroupItem value={index.toString()} id={`option-${index}`} />
                      <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer font-medium">
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <div className="space-y-6">
                  {poll.options.map((option, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          {option}
                          {userVotedOption === index && (
                            <Badge variant="outline" className="text-xs border-primary text-primary">
                              Your vote
                            </Badge>
                          )}
                        </span>
                        <span className="font-bold">
                          {poll.votePercentages[index]}% ({poll.votes[index]})
                        </span>
                      </div>
                      <Progress value={poll.votePercentages[index]} className="h-2 bg-muted" />
                    </div>
                  ))}

                  {userHasVoted && (
                    <div className="p-4 bg-primary/10 rounded-lg border border-primary/20 flex items-center gap-3 text-primary">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium">Your vote has been recorded</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/20 border-t border-border/50 pt-6">
              {!userHasVoted && poll.isActive ? (
                <div className="w-full space-y-2">
                  <Button
                    className={`w-full font-bold text-lg h-12 ${
                      !canVoteToday
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                    disabled={selectedOption === null || !isConnected || isVoting || contractLoading || !canVoteToday || isRecordingVote}
                    onClick={handleVote}
                  >
                    {isVoting || isRecordingVote ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {isRecordingVote ? "Recording..." : "Submitting Vote..."}
                      </>
                    ) : !canVoteToday ? (
                      "Daily Limit Reached"
                    ) : (
                      "Confirm Vote"
                    )}
                  </Button>
                  {!canVoteToday && isConnected && (
                    <p className="text-xs text-center text-muted-foreground">
                      Hold more PULSE or maintain your streak to unlock more votes
                    </p>
                  )}
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={handleShare}>
                  <Share2 className="w-4 h-4 mr-2" /> Share Poll
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {/* Reward Info Card */}
          <Card className="bg-accent/5 border-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-accent">
                <Trophy className="w-5 h-5" /> Reward Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Reward Pool</span>
                <span className="font-bold font-mono">
                  {rewardPoolMove > 0 ? `${rewardPoolMove.toFixed(4)} ${getCoinSymbol(poll.coin_type_id as CoinTypeId)}` : "No funds"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Per Voter</span>
                <span className="font-bold font-mono">
                  {estimatedRewardPerVoter > 0
                    ? `~${estimatedRewardPerVoter.toFixed(4)} ${getCoinSymbol(poll.coin_type_id as CoinTypeId)}`
                    : "N/A"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Distribution</span>
                <Badge variant="outline" className="text-xs">
                  {poll.distribution_mode === DISTRIBUTION_MODE.UNSET
                    ? "Not set"
                    : poll.distribution_mode === DISTRIBUTION_MODE.MANUAL_PULL
                    ? "Claim"
                    : "Push"}
                </Badge>
              </div>
              {poll.rewards_distributed && (
                <div className="text-xs text-green-500 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Rewards have been distributed
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions Card - Claim/Distribute/Close */}
          {isConnected && (rewardPoolMove > 0 || isCreator) && (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-primary" /> Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Claim Button - for voters in Manual Pull mode when status is CLAIMING */}
                {poll.status === POLL_STATUS.CLAIMING &&
                  poll.distribution_mode === DISTRIBUTION_MODE.MANUAL_PULL &&
                  userHasVoted &&
                  !userHasClaimed && (
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleClaim}
                      disabled={isClaiming || contractLoading}
                    >
                      {isClaiming ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Claiming...
                        </>
                      ) : (
                        <>
                          <Gift className="w-4 h-4 mr-2" /> Claim Reward
                        </>
                      )}
                    </Button>
                  )}

                {/* Already claimed message */}
                {poll.status === POLL_STATUS.CLAIMING && userHasClaimed && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    You have claimed your reward
                  </div>
                )}

                {/* Distribute Button - for creator in Manual Push mode when status is CLOSED */}
                {poll.status === POLL_STATUS.CLOSED &&
                  poll.distribution_mode === DISTRIBUTION_MODE.MANUAL_PUSH &&
                  isCreator &&
                  !poll.rewards_distributed && (
                    <Button
                      className="w-full bg-primary hover:bg-primary/90"
                      onClick={handleDistribute}
                      disabled={isDistributing || contractLoading}
                    >
                      {isDistributing ? (
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

                {/* Close Poll Button - for creator when poll is still active */}
                {poll.status === POLL_STATUS.ACTIVE && isCreator && (
                  <Button
                    variant="outline"
                    className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={() => setIsClosePollModalOpen(true)}
                    disabled={isClosing || contractLoading}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Close Poll
                  </Button>
                )}

                {/* Info text based on status */}
                {poll.status === POLL_STATUS.ACTIVE && rewardPoolMove > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Rewards will be available after the poll closes.
                  </p>
                )}
                {poll.status === POLL_STATUS.CLAIMING && !userHasVoted && (
                  <p className="text-xs text-muted-foreground">
                    Only voters can claim rewards.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Poll Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Poll Info</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Poll ID</span>
                  <span className="font-mono">#{poll.id}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Votes</span>
                  <span className="font-mono">{poll.totalVotes}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={statusInfo.variant} className={statusInfo.className}>
                    {statusInfo.label}
                  </Badge>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Claims</span>
                  <span className="font-mono">{poll.claimed.length}/{poll.totalVotes}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Token</span>
                  <Badge variant="outline">{getCoinSymbol(poll.coin_type_id as CoinTypeId)}</Badge>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Close Poll Modal */}
      <Dialog open={isClosePollModalOpen} onOpenChange={setIsClosePollModalOpen}>
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
              {/* Manual Pull Option */}
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
                  <Label htmlFor="pull" className="flex items-center gap-2 font-semibold cursor-pointer">
                    <HandCoins className="w-4 h-4 text-primary" />
                    Voters Claim (Pull)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Each voter can claim their own reward. Unclaimed funds can be withdrawn later.
                  </p>
                </div>
              </div>

              {/* Manual Push Option */}
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
                  <Label htmlFor="push" className="flex items-center gap-2 font-semibold cursor-pointer">
                    <Users className="w-4 h-4 text-primary" />
                    Distribute to All (Push)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    You distribute rewards to all voters in a single transaction.
                  </p>
                </div>
              </div>
            </RadioGroup>

            {/* Reward Summary */}
            {rewardPoolMove > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Reward Pool</span>
                  <span className="font-mono font-semibold">{rewardPoolMove.toFixed(4)} {getCoinSymbol(poll.coin_type_id as CoinTypeId)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Voters</span>
                  <span className="font-mono">{poll.totalVotes}</span>
                </div>
                {poll.totalVotes > 0 && (
                  <div className="flex justify-between mt-1">
                    <span className="text-muted-foreground">Per Voter</span>
                    <span className="font-mono text-green-600">~{estimatedRewardPerVoter.toFixed(4)} {getCoinSymbol(poll.coin_type_id as CoinTypeId)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsClosePollModalOpen(false)}
              disabled={isClosing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleClosePoll}
              disabled={isClosing || contractLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isClosing ? (
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
    </div>
  );
}
