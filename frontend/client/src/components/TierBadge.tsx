import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Crown, Medal, Award, Shield } from "lucide-react";
import { TIER_NAMES, TIER_VOTE_LIMITS, TIER_PULSE_THRESHOLDS, TIERS } from "@shared/schema";

interface TierBadgeProps {
  tier: number;
  showVoteLimit?: boolean;
  showTooltip?: boolean;
  size?: "sm" | "md" | "lg";
}

const tierConfig = {
  [TIERS.BRONZE]: {
    icon: Shield,
    bgColor: "bg-amber-700/20",
    textColor: "text-amber-700 dark:text-amber-500",
    borderColor: "border-amber-700/50",
    gradient: "from-amber-700 to-amber-900",
  },
  [TIERS.SILVER]: {
    icon: Medal,
    bgColor: "bg-slate-400/20",
    textColor: "text-slate-500 dark:text-slate-400",
    borderColor: "border-slate-400/50",
    gradient: "from-slate-400 to-slate-600",
  },
  [TIERS.GOLD]: {
    icon: Award,
    bgColor: "bg-yellow-500/20",
    textColor: "text-yellow-600 dark:text-yellow-500",
    borderColor: "border-yellow-500/50",
    gradient: "from-yellow-500 to-yellow-700",
  },
  [TIERS.PLATINUM]: {
    icon: Crown,
    bgColor: "bg-cyan-400/20",
    textColor: "text-cyan-500 dark:text-cyan-400",
    borderColor: "border-cyan-400/50",
    gradient: "from-cyan-400 to-cyan-600",
  },
};

const sizeConfig = {
  sm: {
    iconSize: "w-3 h-3",
    textSize: "text-xs",
    padding: "px-1.5 py-0.5",
  },
  md: {
    iconSize: "w-4 h-4",
    textSize: "text-sm",
    padding: "px-2 py-1",
  },
  lg: {
    iconSize: "w-5 h-5",
    textSize: "text-base",
    padding: "px-3 py-1.5",
  },
};

export function TierBadge({ tier, showVoteLimit = false, showTooltip = true, size = "md" }: TierBadgeProps) {
  const config = tierConfig[tier as keyof typeof tierConfig] || tierConfig[TIERS.BRONZE];
  const sizes = sizeConfig[size];
  const tierName = TIER_NAMES[tier as keyof typeof TIER_NAMES] || "Bronze";
  const voteLimit = TIER_VOTE_LIMITS[tier as keyof typeof TIER_VOTE_LIMITS] || 3;
  const pulseThreshold = TIER_PULSE_THRESHOLDS[tier as keyof typeof TIER_PULSE_THRESHOLDS] || 0;

  const Icon = config.icon;

  const badge = (
    <Badge
      variant="outline"
      className={`${config.bgColor} ${config.textColor} ${config.borderColor} ${sizes.padding} ${sizes.textSize} font-medium inline-flex items-center gap-1`}
    >
      <Icon className={sizes.iconSize} />
      <span>{tierName}</span>
      {showVoteLimit && (
        <span className="opacity-75">({voteLimit}/day)</span>
      )}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm space-y-1">
            <p className="font-semibold">{tierName} Tier</p>
            <p className="text-muted-foreground">{voteLimit} votes per day</p>
            {pulseThreshold > 0 && (
              <p className="text-muted-foreground">
                Requires {(pulseThreshold / 1e8).toLocaleString()} PULSE
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Component to display tier progress to next level
interface TierProgressProps {
  currentTier: number;
  pulseBalance: string;
  streak: number;
}

export function TierProgress({ currentTier, pulseBalance, streak }: TierProgressProps) {
  const balance = BigInt(pulseBalance);
  const nextTier = Math.min(currentTier + 1, TIERS.PLATINUM);

  if (currentTier >= TIERS.PLATINUM) {
    return (
      <div className="text-sm text-muted-foreground">
        <span className="text-cyan-500 font-semibold">Max tier reached!</span>
      </div>
    );
  }

  const nextThreshold = TIER_PULSE_THRESHOLDS[nextTier as keyof typeof TIER_PULSE_THRESHOLDS];
  const currentThreshold = TIER_PULSE_THRESHOLDS[currentTier as keyof typeof TIER_PULSE_THRESHOLDS];
  const nextTierName = TIER_NAMES[nextTier as keyof typeof TIER_NAMES];

  const pulseNeeded = BigInt(nextThreshold) - balance;
  const progress = currentThreshold === nextThreshold
    ? 100
    : Number((balance - BigInt(currentThreshold)) * BigInt(100) / (BigInt(nextThreshold) - BigInt(currentThreshold)));

  // Check streak bonus eligibility
  const streakBonusMessage = streak < 7
    ? `Vote ${7 - streak} more days for +1 tier bonus`
    : streak < 30
    ? `Vote ${30 - streak} more days for +2 tier bonus`
    : "Max streak bonus active!";

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Next: {nextTierName}</span>
        <span className="font-mono text-xs">
          {pulseNeeded > 0 ? `${(Number(pulseNeeded) / 1e8).toLocaleString()} PULSE needed` : "Ready!"}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${tierConfig[nextTier as keyof typeof tierConfig]?.gradient || 'from-primary to-accent'}`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{streakBonusMessage}</p>
    </div>
  );
}
