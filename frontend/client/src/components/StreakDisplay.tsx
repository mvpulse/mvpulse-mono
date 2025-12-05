import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Flame, Calendar, Trophy, Zap } from "lucide-react";

interface StreakDisplayProps {
  currentStreak: number;
  longestStreak: number;
  lastVoteDate?: string | null;
  compact?: boolean;
}

export function StreakDisplay({
  currentStreak,
  longestStreak,
  lastVoteDate,
  compact = false,
}: StreakDisplayProps) {
  // Determine streak status
  const isOnFire = currentStreak >= 7;
  const isBlazing = currentStreak >= 30;
  const streakBonus = isBlazing ? "+2 tier" : isOnFire ? "+1 tier" : null;

  // Check if streak is at risk (last vote was yesterday or earlier)
  const today = new Date().toISOString().split('T')[0];
  const isAtRisk = lastVoteDate && lastVoteDate < today;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1.5 ${isOnFire ? 'text-orange-500' : 'text-muted-foreground'}`}>
              <Flame className={`w-4 h-4 ${isOnFire ? 'animate-pulse' : ''}`} />
              <span className="font-mono font-bold">{currentStreak}</span>
              {streakBonus && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-orange-500/10 text-orange-500 border-orange-500/30">
                  {streakBonus}
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p className="font-semibold">{currentStreak} Day Streak</p>
              <p className="text-muted-foreground">Longest: {longestStreak} days</p>
              {streakBonus && <p className="text-orange-500">Tier bonus: {streakBonus}</p>}
              {isAtRisk && <p className="text-yellow-500">Vote today to keep your streak!</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card className={isOnFire ? "border-orange-500/30" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className={`w-4 h-4 ${isOnFire ? 'text-orange-500 animate-pulse' : 'text-muted-foreground'}`} />
            Voting Streak
          </div>
          {streakBonus && (
            <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30">
              <Zap className="w-3 h-3 mr-1" />
              {streakBonus}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Streak */}
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-3xl font-bold font-mono ${isOnFire ? 'text-orange-500' : ''}`}>
              {currentStreak}
            </p>
            <p className="text-xs text-muted-foreground">days</p>
          </div>

          {/* Flame visualization */}
          <div className="flex items-center gap-1">
            {[...Array(Math.min(currentStreak, 7))].map((_, i) => (
              <Flame
                key={i}
                className={`w-5 h-5 ${
                  i < 3
                    ? 'text-orange-400'
                    : i < 5
                    ? 'text-orange-500'
                    : 'text-red-500'
                } ${i === currentStreak - 1 ? 'animate-bounce' : ''}`}
              />
            ))}
          </div>
        </div>

        {/* Streak Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <span>Best: {longestStreak}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>
              {lastVoteDate
                ? lastVoteDate === today
                  ? "Voted today"
                  : "Vote to continue"
                : "Start your streak!"
              }
            </span>
          </div>
        </div>

        {/* Streak Risk Warning */}
        {isAtRisk && (
          <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-500 text-xs flex items-center gap-2">
            <Flame className="w-4 h-4" />
            Vote today to keep your streak alive!
          </div>
        )}

        {/* Milestone Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Tier bonus progress</span>
            <span>{currentStreak >= 30 ? "Max bonus!" : currentStreak >= 7 ? "7+ days" : `${7 - currentStreak} to bonus`}</span>
          </div>
          <div className="flex gap-1">
            {[...Array(30)].map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < currentStreak
                    ? i < 7
                      ? 'bg-orange-400'
                      : i < 30
                      ? 'bg-orange-500'
                      : 'bg-red-500'
                    : 'bg-muted'
                } ${i === 6 || i === 29 ? 'border-r-2 border-background' : ''}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Day 1</span>
            <span className={currentStreak >= 7 ? 'text-orange-500 font-semibold' : ''}>7 (+1 tier)</span>
            <span className={currentStreak >= 30 ? 'text-red-500 font-semibold' : ''}>30 (+2 tier)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Minimal streak badge for headers
interface StreakBadgeProps {
  streak: number;
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  if (streak === 0) return null;

  const isOnFire = streak >= 7;

  return (
    <Badge
      variant="outline"
      className={`font-mono ${
        isOnFire
          ? 'bg-orange-500/10 text-orange-500 border-orange-500/30'
          : 'bg-muted'
      }`}
    >
      <Flame className={`w-3 h-3 mr-1 ${isOnFire ? 'animate-pulse' : ''}`} />
      {streak}
    </Badge>
  );
}
