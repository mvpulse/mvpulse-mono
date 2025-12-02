import { useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { PollCard } from "@/components/PollCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Filter, Search, RefreshCcw, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useContract } from "@/hooks/useContract";
import type { PollWithMeta } from "@/types/poll";

export default function Dashboard() {
  const [location] = useLocation();
  const { connected, account } = useWallet();
  const { getAllPolls, getPollCount, contractAddress } = useContract();

  const [role, setRole] = useState<"creator" | "participant">("creator");
  const [polls, setPolls] = useState<PollWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get("role");
    if (roleParam === "participant") setRole("participant");
  }, [location]);

  // Fetch all polls
  const fetchPolls = useCallback(async () => {
    if (!contractAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const allPolls = await getAllPolls();
      // Sort by ID descending (newest first)
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

  // Filter polls by status and creator
  const activePolls = polls.filter((p) => p.isActive);
  const closedPolls = polls.filter((p) => !p.isActive);

  // Filter by creator for creator view
  const myPolls = polls.filter(
    (p) => account?.address && p.creator.toLowerCase() === account.address.toString().toLowerCase()
  );
  const myActivePolls = myPolls.filter((p) => p.isActive);
  const myClosedPolls = myPolls.filter((p) => !p.isActive);

  // Search filter
  const filterBySearch = (pollList: PollWithMeta[]) => {
    if (!searchQuery.trim()) return pollList;
    const query = searchQuery.toLowerCase();
    return pollList.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
    );
  };

  // Calculate stats
  const stats = {
    activePolls: role === "creator" ? myActivePolls.length : activePolls.length,
    totalVotes: (role === "creator" ? myPolls : polls).reduce((sum, p) => sum + p.totalVotes, 0),
    totalRewards: (role === "creator" ? myPolls : polls).reduce(
      (sum, p) => sum + (p.reward_per_vote / 1e8) * p.totalVotes,
      0
    ),
    pollCount: role === "creator" ? myPolls.length : polls.length,
  };

  // Get the polls to display based on role
  const getDisplayPolls = (tab: "active" | "completed") => {
    const basePollsActive = role === "creator" ? myActivePolls : activePolls;
    const basePollsClosed = role === "creator" ? myClosedPolls : closedPolls;
    return filterBySearch(tab === "active" ? basePollsActive : basePollsClosed);
  };

  // Render poll card from PollWithMeta
  const renderPollCard = (poll: PollWithMeta) => {
    const rewardMove = poll.reward_per_vote / 1e8;
    return (
      <PollCard
        key={poll.id}
        id={poll.id.toString()}
        title={poll.title}
        description={poll.description}
        votes={poll.totalVotes}
        timeLeft={poll.timeRemaining}
        reward={rewardMove > 0 ? `${rewardMove.toFixed(2)} MOVE` : undefined}
        status={poll.isActive ? "active" : "closed"}
        tags={[]}
      />
    );
  };

  // Loading skeleton
  const PollSkeleton = () => (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold tracking-tight">
            {role === "creator" ? "Creator Dashboard" : "Explore Polls"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {role === "creator"
              ? "Manage your active polls and analyze responses."
              : "Participate in active polls and earn rewards."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={role === "creator" ? "default" : "outline"}
            onClick={() => setRole("creator")}
            size="sm"
          >
            Creator View
          </Button>
          <Button
            variant={role === "participant" ? "default" : "outline"}
            onClick={() => setRole("participant")}
            size="sm"
          >
            Participant View
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          {
            label: "Active Polls",
            value: isLoading ? "-" : stats.activePolls.toString(),
            change: role === "creator" ? "Your polls" : "On network",
          },
          {
            label: "Total Votes",
            value: isLoading ? "-" : stats.totalVotes.toLocaleString(),
            change: role === "creator" ? "On your polls" : "All polls",
          },
          {
            label: "Rewards Pool",
            value: isLoading ? "-" : `${stats.totalRewards.toFixed(2)} MOVE`,
            change: "Total distributed",
          },
          {
            label: "Total Polls",
            value: isLoading ? "-" : stats.pollCount.toString(),
            change: role === "creator" ? "Created by you" : "On network",
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm"
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-bold font-mono mt-1">{stat.value}</p>
            <p className="text-xs text-accent mt-1">{stat.change}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search polls..."
            className="pl-10 bg-muted/30"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button variant="outline" className="flex-1 md:flex-none" onClick={fetchPolls}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          {role === "creator" && (
            <Link href="/create">
              <Button className="flex-1 md:flex-none bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" /> Create Poll
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* No contract warning */}
      {!contractAddress && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              Contract not available on this network. Please switch to testnet.
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="bg-muted/30">
          <TabsTrigger value="active">
            Active ({role === "creator" ? myActivePolls.length : activePolls.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({role === "creator" ? myClosedPolls.length : closedPolls.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <PollSkeleton />
              <PollSkeleton />
              <PollSkeleton />
            </div>
          ) : getDisplayPolls("active").length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground mb-4">
                  {role === "creator"
                    ? "You haven't created any active polls yet."
                    : "No active polls found."}
                </p>
                {role === "creator" && (
                  <Link href="/create">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" /> Create Your First Poll
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {getDisplayPolls("active").map(renderPollCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <PollSkeleton />
              <PollSkeleton />
              <PollSkeleton />
            </div>
          ) : getDisplayPolls("completed").length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">No completed polls found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {getDisplayPolls("completed").map(renderPollCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
