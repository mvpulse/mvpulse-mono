import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Vote, RefreshCw } from "lucide-react";
import { TierBadge } from "./TierBadge";

interface DailyVoteLimitProps {
  votesUsed: number;
  tierLimit: number;
  tier: number;
  tierName: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  compact?: boolean;
}

export function DailyVoteLimit({
  votesUsed,
  tierLimit,
  tier,
  tierName,
  onRefresh,
  isRefreshing,
  compact = false,
}: DailyVoteLimitProps) {
  const votesRemaining = Math.max(0, tierLimit - votesUsed);
  const percentUsed = (votesUsed / tierLimit) * 100;
  const hasVotesLeft = votesRemaining > 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Vote className={`w-4 h-4 ${hasVotesLeft ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="font-mono text-sm">
          {votesUsed}/{tierLimit}
        </span>
        <TierBadge tier={tier} size="sm" showTooltip={false} />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Vote className="w-4 h-4 text-primary" />
            Daily Votes
          </div>
          <div className="flex items-center gap-2">
            <TierBadge tier={tier} size="sm" />
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <RefreshCw className={`w-3 h-3 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold font-mono">
            {votesUsed}
            <span className="text-muted-foreground text-lg">/{tierLimit}</span>
          </span>
          <Badge
            variant={hasVotesLeft ? "default" : "secondary"}
            className={hasVotesLeft ? "bg-primary/20 text-primary border-primary/30" : ""}
          >
            {votesRemaining} remaining
          </Badge>
        </div>

        <Progress
          value={percentUsed}
          className="h-2"
        />

        <p className="text-xs text-muted-foreground">
          {hasVotesLeft
            ? `You can vote ${votesRemaining} more time${votesRemaining !== 1 ? 's' : ''} today`
            : "Daily limit reached. Votes reset at midnight UTC."
          }
        </p>
      </CardContent>
    </Card>
  );
}

// Minimal inline version for headers/sidebars
interface VoteLimitBadgeProps {
  votesUsed: number;
  tierLimit: number;
}

export function VoteLimitBadge({ votesUsed, tierLimit }: VoteLimitBadgeProps) {
  const votesRemaining = Math.max(0, tierLimit - votesUsed);
  const hasVotesLeft = votesRemaining > 0;

  return (
    <Badge
      variant="outline"
      className={`font-mono ${
        hasVotesLeft
          ? 'bg-primary/10 text-primary border-primary/30'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      <Vote className="w-3 h-3 mr-1" />
      {votesUsed}/{tierLimit}
    </Badge>
  );
}
