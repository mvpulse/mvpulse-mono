import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar, Clock, Coins, Trophy, Users } from "lucide-react";
import type { SeasonInfo } from "@/hooks/useQuests";

interface SeasonBannerProps {
  season: SeasonInfo;
  userPoints?: number;
  userRank?: number;
  compact?: boolean;
}

export function SeasonBanner({ season, userPoints, userRank, compact = false }: SeasonBannerProps) {
  const pulsePool = Number(season.totalPulsePool) / 1e8;
  const startDate = new Date(season.startTime);
  const endDate = new Date(season.endTime);
  const now = Date.now();
  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsed = now - startDate.getTime();
  const progress = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);

  if (compact) {
    return (
      <Card className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-primary/30">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">{season.name}</span>
              <Badge variant={season.isActive ? "default" : "secondary"} className="text-xs">
                {season.statusName}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {season.daysRemaining !== null && (
                <span className="text-muted-foreground">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {season.daysRemaining}d left
                </span>
              )}
              {pulsePool > 0 && (
                <span className="font-mono text-primary">
                  <Coins className="w-3 h-3 inline mr-1" />
                  {pulsePool.toLocaleString()} PULSE
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Gradient header */}
      <div className="bg-gradient-to-r from-primary via-accent to-primary p-4 text-primary-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-background/20 rounded-lg">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{season.name}</h2>
              {season.description && (
                <p className="text-sm opacity-90">{season.description}</p>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-sm">
            {season.statusName}
          </Badge>
        </div>
      </div>

      <CardContent className="pt-4 space-y-4">
        {/* Season progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              {startDate.toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              {endDate.toLocaleDateString()}
              <Calendar className="w-4 h-4" />
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          {season.daysRemaining !== null && season.isActive && (
            <p className="text-center text-sm text-muted-foreground">
              <Clock className="w-3 h-3 inline mr-1" />
              {season.daysRemaining} days remaining
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <Coins className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-lg font-bold font-mono">{pulsePool.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">PULSE Pool</p>
          </div>

          {userPoints !== undefined && (
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <Trophy className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
              <p className="text-lg font-bold font-mono">{userPoints.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Your Points</p>
            </div>
          )}

          {userRank !== undefined && (
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <Users className="w-5 h-5 mx-auto mb-1 text-accent" />
              <p className="text-lg font-bold font-mono">#{userRank}</p>
              <p className="text-xs text-muted-foreground">Your Rank</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// No active season placeholder
export function NoSeasonBanner() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-8">
        <Trophy className="w-10 h-10 text-muted-foreground mb-3" />
        <h3 className="font-semibold text-lg mb-1">No Active Season</h3>
        <p className="text-sm text-muted-foreground text-center">
          Check back soon for the next season with quests and rewards!
        </p>
      </CardContent>
    </Card>
  );
}
