import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { HelpCircle, Shield, Medal, Award, Crown } from "lucide-react";
import { TIER_PULSE_THRESHOLDS, TIER_VOTE_LIMITS, TIERS } from "@shared/schema";

interface TierRequirementsPopoverProps {
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  iconClassName?: string;
}

export function TierRequirementsPopover({
  align = "start",
  side = "bottom",
  iconClassName = "w-5 h-5 text-muted-foreground"
}: TierRequirementsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full">
          <HelpCircle className={iconClassName} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align={align} side={side}>
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Tier Requirements</h4>
          <p className="text-xs text-muted-foreground">
            Your tier is based on your total PULSE (wallet + staked). Higher tiers unlock more daily votes.
          </p>
          <div className="space-y-2">
            {/* Bronze */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-600" />
                <span className="font-medium text-sm">Bronze</span>
              </div>
              <div className="text-right text-xs">
                <p className="text-muted-foreground">0+ PULSE</p>
                <p className="font-medium">{TIER_VOTE_LIMITS[TIERS.BRONZE]} votes/day</p>
              </div>
            </div>
            {/* Silver */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-400/10 border border-slate-400/20">
              <div className="flex items-center gap-2">
                <Medal className="w-4 h-4 text-slate-500" />
                <span className="font-medium text-sm">Silver</span>
              </div>
              <div className="text-right text-xs">
                <p className="text-muted-foreground">{(TIER_PULSE_THRESHOLDS[TIERS.SILVER] / 1e8).toLocaleString()}+ PULSE</p>
                <p className="font-medium">{TIER_VOTE_LIMITS[TIERS.SILVER]} votes/day</p>
              </div>
            </div>
            {/* Gold */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-yellow-600" />
                <span className="font-medium text-sm">Gold</span>
              </div>
              <div className="text-right text-xs">
                <p className="text-muted-foreground">{(TIER_PULSE_THRESHOLDS[TIERS.GOLD] / 1e8).toLocaleString()}+ PULSE</p>
                <p className="font-medium">{TIER_VOTE_LIMITS[TIERS.GOLD]} votes/day</p>
              </div>
            </div>
            {/* Platinum */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-cyan-400/10 border border-cyan-400/20">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-cyan-500" />
                <span className="font-medium text-sm">Platinum</span>
              </div>
              <div className="text-right text-xs">
                <p className="text-muted-foreground">{(TIER_PULSE_THRESHOLDS[TIERS.PLATINUM] / 1e8).toLocaleString()}+ PULSE</p>
                <p className="font-medium">{TIER_VOTE_LIMITS[TIERS.PLATINUM]} votes/day</p>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Streak Bonus:</strong> 7+ day streak = +1 tier, 30+ day streak = +2 tiers (max Platinum)
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
