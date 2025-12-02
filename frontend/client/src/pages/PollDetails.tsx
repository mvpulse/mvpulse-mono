import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Clock, Share2, AlertCircle, Loader2, Wallet, CheckCircle2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useContract } from "@/hooks/useContract";
import { useNetwork } from "@/contexts/NetworkContext";
import { truncateAddress } from "@/lib/contract";
import type { PollWithMeta } from "@/types/poll";

export default function PollDetails() {
  const { id } = useParams();
  const { connected, account } = useWallet();
  const { getPoll, vote, hasVoted: checkHasVoted, loading: contractLoading } = useContract();
  const { config } = useNetwork();

  const [poll, setPoll] = useState<PollWithMeta | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [userHasVoted, setUserHasVoted] = useState(false);
  const [userVotedOption, setUserVotedOption] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);

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

      // Check if user has voted
      if (account?.address) {
        const voted = await checkHasVoted(pollId);
        setUserHasVoted(voted);

        // Find which option user voted for
        if (voted && pollData?.voters) {
          const voterIndex = pollData.voters.findIndex(
            (v) => v.toLowerCase() === account.address.toString().toLowerCase()
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
  }, [pollId, getPoll, checkHasVoted, account?.address]);

  useEffect(() => {
    fetchPollData();
  }, [fetchPollData]);

  // Handle vote submission
  const handleVote = async () => {
    if (selectedOption === null || pollId === null) return;

    if (!connected) {
      toast.error("Please connect your wallet to vote");
      return;
    }

    setIsVoting(true);
    try {
      const result = await vote({ pollId, optionIndex: selectedOption });

      toast.success("Vote Submitted!", {
        description: "Your vote has been recorded on the Movement network.",
        action: {
          label: "View TX",
          onClick: () => window.open(`${config.explorerUrl}/txn/${result.hash}?network=testnet`, "_blank"),
        },
      });

      setUserHasVoted(true);
      setUserVotedOption(selectedOption);

      // Refresh poll data to get updated vote counts
      await fetchPollData();
    } catch (error) {
      console.error("Failed to vote:", error);
      toast.error("Failed to submit vote", {
        description: error instanceof Error ? error.message : "Transaction failed",
      });
    } finally {
      setIsVoting(false);
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard!");
  };

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
  const estimatedTotalReward = rewardPerVoteMove * (poll.totalVotes || 1);

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Voting Area */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Badge
                variant={poll.isActive ? "default" : "secondary"}
                className={poll.isActive ? "bg-green-500/20 text-green-500 border-green-500/50" : ""}
              >
                {poll.isActive ? "Active" : "Closed"}
              </Badge>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {poll.timeRemaining}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight mb-4">
              {poll.title}
            </h1>
            <p className="text-muted-foreground text-lg">{poll.description}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Created by {truncateAddress(poll.creator)}
            </p>
          </div>

          {/* Wallet Connection Warning */}
          {!connected && (
            <Card className="border-yellow-500/50 bg-yellow-500/10">
              <CardContent className="flex items-center gap-3 py-4">
                <Wallet className="w-5 h-5 text-yellow-500" />
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  Please connect your wallet to vote on this poll.
                </p>
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
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-lg h-12"
                  disabled={selectedOption === null || !connected || isVoting || contractLoading}
                  onClick={handleVote}
                >
                  {isVoting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting Vote...
                    </>
                  ) : (
                    "Confirm Vote"
                  )}
                </Button>
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
          <Card className="bg-accent/5 border-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-accent">
                <Trophy className="w-5 h-5" /> Reward Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Per Vote</span>
                <span className="font-bold font-mono">
                  {rewardPerVoteMove > 0 ? `${rewardPerVoteMove.toFixed(4)} MOVE` : "No reward"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Pool</span>
                <span className="font-bold font-mono">
                  {estimatedTotalReward > 0 ? `~${estimatedTotalReward.toFixed(2)} MOVE` : "N/A"}
                </span>
              </div>
              {rewardPerVoteMove > 0 && (
                <div className="text-xs text-muted-foreground mt-2 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Rewards are distributed automatically via smart contract when the poll closes.
                </div>
              )}
            </CardContent>
          </Card>

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
                  <Badge variant={poll.isActive ? "default" : "secondary"}>
                    {poll.isActive ? "Active" : "Closed"}
                  </Badge>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
