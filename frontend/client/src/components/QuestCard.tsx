import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, Gift, Star, Trophy, Zap, Target, Loader2 } from "lucide-react";
import { QUEST_TYPE_NAMES, QUEST_TYPES } from "@shared/schema";
import type { QuestWithProgress } from "@/hooks/useQuests";

interface QuestCardProps {
  quest: QuestWithProgress;
  onClaim?: (questId: string) => Promise<void>;
  isClaiming?: boolean;
}

const questTypeConfig = {
  [QUEST_TYPES.DAILY]: {
    icon: Clock,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  [QUEST_TYPES.WEEKLY]: {
    icon: Star,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
  },
  [QUEST_TYPES.ACHIEVEMENT]: {
    icon: Trophy,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
  },
  [QUEST_TYPES.SPECIAL]: {
    icon: Zap,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    borderColor: "border-pink-500/30",
  },
};

export function QuestCard({ quest, onClaim, isClaiming }: QuestCardProps) {
  const config = questTypeConfig[quest.questType as keyof typeof questTypeConfig] || questTypeConfig[QUEST_TYPES.DAILY];
  const TypeIcon = config.icon;
  const questTypeName = QUEST_TYPE_NAMES[quest.questType as keyof typeof QUEST_TYPE_NAMES] || "Quest";

  const currentValue = quest.progress?.currentValue || 0;
  const isCompleted = quest.isCompleted;
  const canClaim = quest.canClaim;
  const hasClaimed = isCompleted && !canClaim;

  return (
    <Card className={`relative overflow-hidden transition-all ${
      isCompleted
        ? hasClaimed
          ? 'opacity-60 border-green-500/30'
          : 'border-primary/50 shadow-lg shadow-primary/10'
        : 'hover:border-primary/30'
    }`}>
      {/* Quest type indicator stripe */}
      <div className={`absolute top-0 left-0 w-full h-1 ${config.bgColor.replace('/10', '')}`} />

      <CardContent className="pt-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded ${config.bgColor}`}>
              <TypeIcon className={`w-4 h-4 ${config.color}`} />
            </div>
            <Badge variant="outline" className={`text-xs ${config.bgColor} ${config.color} ${config.borderColor}`}>
              {questTypeName}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-sm font-bold">
            <Gift className="w-4 h-4 text-primary" />
            <span className="text-primary">{quest.points}</span>
            <span className="text-muted-foreground font-normal">pts</span>
          </div>
        </div>

        {/* Quest Info */}
        <div>
          <h3 className="font-semibold text-base leading-tight">{quest.name}</h3>
          {quest.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{quest.description}</p>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">{quest.targetAction}</span>
            </div>
            <span className="font-mono font-medium">
              {currentValue}/{quest.targetValue}
            </span>
          </div>
          <Progress
            value={quest.progressPercent}
            className={`h-2 ${isCompleted ? 'bg-green-500/20' : ''}`}
          />
        </div>

        {/* Time remaining for limited quests */}
        {quest.endsAt && !isCompleted && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Ends {new Date(quest.endsAt).toLocaleDateString()}</span>
          </div>
        )}
      </CardContent>

      {/* Footer with claim button */}
      {(canClaim || hasClaimed) && (
        <CardFooter className="pt-0">
          {canClaim ? (
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={() => onClaim?.(quest.id)}
              disabled={isClaiming}
            >
              {isClaiming ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Claiming...
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4 mr-2" /> Claim {quest.points} Points
                </>
              )}
            </Button>
          ) : (
            <div className="w-full flex items-center justify-center gap-2 text-green-500 py-2">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Completed!</span>
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

// Compact quest card for lists
interface QuestCardCompactProps {
  quest: QuestWithProgress;
  onClaim?: (questId: string) => Promise<void>;
  isClaiming?: boolean;
}

export function QuestCardCompact({ quest, onClaim, isClaiming }: QuestCardCompactProps) {
  const config = questTypeConfig[quest.questType as keyof typeof questTypeConfig] || questTypeConfig[QUEST_TYPES.DAILY];
  const TypeIcon = config.icon;
  const currentValue = quest.progress?.currentValue || 0;
  const isCompleted = quest.isCompleted;
  const canClaim = quest.canClaim;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
      isCompleted ? 'border-green-500/30 bg-green-500/5' : 'border-border hover:bg-muted/50'
    } transition-colors`}>
      {/* Icon */}
      <div className={`p-2 rounded ${config.bgColor}`}>
        {isCompleted && !canClaim ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <TypeIcon className={`w-4 h-4 ${config.color}`} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{quest.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{currentValue}/{quest.targetValue}</span>
          <span className="text-primary font-semibold">+{quest.points} pts</span>
        </div>
      </div>

      {/* Progress/Claim */}
      <div className="flex-shrink-0">
        {canClaim ? (
          <Button
            size="sm"
            onClick={() => onClaim?.(quest.id)}
            disabled={isClaiming}
          >
            {isClaiming ? <Loader2 className="w-3 h-3 animate-spin" /> : "Claim"}
          </Button>
        ) : (
          <span className="text-xs font-mono">
            {quest.progressPercent.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}
