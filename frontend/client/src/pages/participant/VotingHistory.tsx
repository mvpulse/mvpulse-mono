import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { ParticipantLayout } from "@/components/layouts/ParticipantLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  RefreshCcw,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useContract } from "@/hooks/useContract";
import type { PollWithMeta } from "@/types/poll";
import { POLL_STATUS, DISTRIBUTION_MODE } from "@/types/poll";

export default function VotingHistory() {
  const { connected, account } = useWallet();
  const { getAllPolls, hasVoted, hasClaimed, contractAddress } = useContract();

  const [polls, setPolls] = useState<PollWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [votedPollIds, setVotedPollIds] = useState<Set<number>>(new Set());
  const [claimedPollIds, setClaimedPollIds] = useState<Set<number>>(new Set());

  // Fetch polls and vote status
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
      if (account?.address) {
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
  }, [getAllPolls, hasVoted, hasClaimed, contractAddress, account?.address]);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  // Get polls user has voted on
  const votedPolls = useMemo(() => {
    return polls.filter((p) => votedPollIds.has(p.id));
  }, [polls, votedPollIds]);

  // Filter by tab and search
  const filteredPolls = useMemo(() => {
    let filtered = votedPolls;

    // Filter by reward status
    if (activeTab === "rewarded") {
      filtered = filtered.filter((p) => claimedPollIds.has(p.id) || p.rewards_distributed);
    } else if (activeTab === "pending") {
      filtered = filtered.filter(
        (p) =>
          !claimedPollIds.has(p.id) &&
          !p.rewards_distributed &&
          (p.status === POLL_STATUS.CLAIMING || p.status === POLL_STATUS.CLOSED) &&
          p.reward_pool > 0
      );
    } else if (activeTab === "no-reward") {
      filtered = filtered.filter((p) => p.reward_pool === 0);
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
  }, [votedPolls, activeTab, searchQuery, claimedPollIds]);

  // Get reward status badge
  const getRewardBadge = (poll: PollWithMeta) => {
    if (poll.reward_pool === 0) {
      return <Badge variant="outline" className="text-muted-foreground">No Reward</Badge>;
    }
    if (claimedPollIds.has(poll.id) || poll.rewards_distributed) {
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/50">
        <CheckCircle2 className="w-3 h-3 mr-1" /> Rewarded
      </Badge>;
    }
    if (poll.status === POLL_STATUS.CLAIMING || poll.status === POLL_STATUS.CLOSED) {
      return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">
        <Clock className="w-3 h-3 mr-1" /> Pending
      </Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">
      <Clock className="w-3 h-3 mr-1" /> Waiting
    </Badge>;
  };

  // Loading skeleton
  const PollRowSkeleton = () => (
    <div className="flex items-center gap-4 p-4 border-b border-border/50">
      <div className="flex-1">
        <Skeleton className="h-5 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-8 w-8" />
    </div>
  );

  if (!connected) {
    return (
      <ParticipantLayout title="Voting History" description="View all polls you've participated in">
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to view your voting history.
            </p>
          </CardContent>
        </Card>
      </ParticipantLayout>
    );
  }

  return (
    <ParticipantLayout title="Voting History" description="View all polls you've participated in">
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
        <Button variant="outline" onClick={fetchPolls}>
          <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/30 mb-6">
          <TabsTrigger value="all">All ({votedPolls.length})</TabsTrigger>
          <TabsTrigger value="rewarded">
            Rewarded ({votedPolls.filter((p) => claimedPollIds.has(p.id) || p.rewards_distributed).length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending ({votedPolls.filter((p) =>
              !claimedPollIds.has(p.id) &&
              !p.rewards_distributed &&
              (p.status === POLL_STATUS.CLAIMING || p.status === POLL_STATUS.CLOSED) &&
              p.reward_pool > 0
            ).length})
          </TabsTrigger>
          <TabsTrigger value="no-reward">
            No Reward ({votedPolls.filter((p) => p.reward_pool === 0).length})
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
                  {searchQuery
                    ? "No polls match your search."
                    : votedPolls.length === 0
                    ? "You haven't voted on any polls yet."
                    : "No polls found in this category."}
                </p>
                {votedPolls.length === 0 && (
                  <Link href="/dashboard">
                    <Button>Explore Polls</Button>
                  </Link>
                )}
              </CardContent>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredPolls.map((poll) => {
                  const rewardPoolMove = poll.reward_pool / 1e8;
                  const perVoter = poll.reward_per_vote > 0
                    ? poll.reward_per_vote / 1e8
                    : poll.totalVotes > 0
                    ? rewardPoolMove / poll.totalVotes
                    : 0;

                  return (
                    <div
                      key={poll.id}
                      className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link href={`/poll/${poll.id}`}>
                            <span className="font-medium hover:text-primary transition-colors truncate">
                              {poll.title}
                            </span>
                          </Link>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {poll.totalVotes} votes • {perVoter > 0 ? `~${perVoter.toFixed(4)} MOVE` : "No reward"} • {poll.timeRemaining}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {getRewardBadge(poll)}
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
          </Card>
        </TabsContent>
      </Tabs>
    </ParticipantLayout>
  );
}
