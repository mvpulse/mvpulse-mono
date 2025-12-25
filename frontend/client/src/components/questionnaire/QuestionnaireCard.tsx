import { Link } from "wouter";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Clock,
  ListChecks,
  Users,
  Coins,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Questionnaire,
  QuestionnaireProgress,
  getQuestionnaireStatusLabel,
  getQuestionnaireStatusColor,
  QUESTIONNAIRE_STATUS,
  QUESTIONNAIRE_REWARD_TYPE,
} from "@/hooks/useQuestionnaire";
import { formatBalanceWithSymbol } from "@/lib/balance";
import { CoinTypeId } from "@/lib/tokens";

interface QuestionnaireCardProps {
  questionnaire: Questionnaire;
  progress?: QuestionnaireProgress | null;
  showCreatorActions?: boolean;
  onEdit?: (id: string) => void;
  onArchive?: (id: string) => void;
  onToggleStatus?: (id: string, newStatus: number) => void;
  isTogglingStatus?: boolean;
}

export function QuestionnaireCard({
  questionnaire,
  progress,
  showCreatorActions = false,
  onEdit,
  onArchive,
  onToggleStatus,
  isTogglingStatus = false,
}: QuestionnaireCardProps) {
  const timeRemaining = questionnaire.endTime
    ? new Date(questionnaire.endTime).getTime() - new Date().getTime()
    : null;
  const daysRemaining = timeRemaining
    ? Math.max(0, Math.ceil(timeRemaining / (1000 * 60 * 60 * 24)))
    : null;

  const progressPercentage = progress?.started
    ? Math.round(
        ((progress.pollsAnswered?.length || 0) / questionnaire.pollCount) * 100
      )
    : 0;

  const isCompleted = progress?.isComplete ?? false;

  return (
    <Card className="h-full hover:shadow-lg transition-all duration-200 border-border/50">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg leading-tight line-clamp-2">
                {questionnaire.title}
              </h3>
            </div>
            {questionnaire.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {questionnaire.description}
              </p>
            )}
          </div>
          <Badge
            className={cn(
              "ml-2 shrink-0",
              getQuestionnaireStatusColor(questionnaire.status)
            )}
          >
            {getQuestionnaireStatusLabel(questionnaire.status)}
          </Badge>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">
                {questionnaire.creatorAddress.slice(2, 4).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-muted-foreground">
              {questionnaire.creatorAddress.slice(0, 6)}...
              {questionnaire.creatorAddress.slice(-4)}
            </span>
          </div>
          {questionnaire.category && (
            <Badge variant="outline" className="text-xs">
              {questionnaire.category}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress bar for participants */}
        {progress?.started && !showCreatorActions && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {progress.pollsAnswered?.length || 0} / {questionnaire.pollCount}{" "}
                polls
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            {isCompleted && (
              <div className="flex items-center gap-1.5 text-green-500 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>Completed</span>
              </div>
            )}
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Polls:</span>
            <span className="font-medium">{questionnaire.pollCount}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Completions:</span>
            <span className="font-medium">{questionnaire.completionCount}</span>
          </div>

          {questionnaire.totalRewardAmount &&
            questionnaire.totalRewardAmount !== "0" && (
              <div className="flex items-center gap-2 text-sm col-span-2">
                {questionnaire.rewardType === QUESTIONNAIRE_REWARD_TYPE.SHARED_POOL ? (
                  <Gift className="h-4 w-4 text-primary" />
                ) : (
                  <Coins className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">
                  {questionnaire.rewardType === QUESTIONNAIRE_REWARD_TYPE.SHARED_POOL
                    ? "Shared Pool:"
                    : "Reward:"}
                </span>
                <span className="font-medium">
                  {formatBalanceWithSymbol(
                    Number(questionnaire.totalRewardAmount),
                    questionnaire.coinTypeId as CoinTypeId
                  )}
                </span>
                {questionnaire.rewardType === QUESTIONNAIRE_REWARD_TYPE.SHARED_POOL && (
                  <Badge variant="secondary" className="text-xs ml-1">
                    Pool
                  </Badge>
                )}
              </div>
            )}

          {daysRemaining !== null &&
            questionnaire.status === QUESTIONNAIRE_STATUS.ACTIVE && (
              <div className="flex items-center gap-2 text-sm col-span-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {daysRemaining === 0
                    ? "Ends today"
                    : daysRemaining === 1
                    ? "1 day left"
                    : `${daysRemaining} days left`}
                </span>
              </div>
            )}
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        {showCreatorActions ? (
          <>
            {/* Publish/Unpublish Toggle */}
            {questionnaire.status !== QUESTIONNAIRE_STATUS.ARCHIVED &&
              onToggleStatus && (
                <Button
                  variant={
                    questionnaire.status === QUESTIONNAIRE_STATUS.ACTIVE
                      ? "outline"
                      : "default"
                  }
                  size="sm"
                  onClick={() =>
                    onToggleStatus(
                      questionnaire.id,
                      questionnaire.status === QUESTIONNAIRE_STATUS.ACTIVE
                        ? QUESTIONNAIRE_STATUS.DRAFT
                        : QUESTIONNAIRE_STATUS.ACTIVE
                    )
                  }
                  disabled={isTogglingStatus}
                >
                  {questionnaire.status === QUESTIONNAIRE_STATUS.ACTIVE ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-1" />
                      Unpublish
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-1" />
                      Publish
                    </>
                  )}
                </Button>
              )}
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onEdit?.(questionnaire.id)}
            >
              Edit
            </Button>
            {questionnaire.status !== QUESTIONNAIRE_STATUS.ARCHIVED && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onArchive?.(questionnaire.id)}
              >
                Archive
              </Button>
            )}
          </>
        ) : (
          <Link href={`/questionnaire/${questionnaire.id}`} className="w-full">
            <Button
              variant={isCompleted ? "outline" : "default"}
              size="sm"
              className="w-full"
            >
              {isCompleted ? (
                <>
                  View Results
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              ) : progress?.started ? (
                <>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  Start Questionnaire
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
