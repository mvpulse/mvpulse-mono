import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Clock,
  Coins,
  ListChecks,
  Users,
  AlertCircle,
  Wallet,
} from "lucide-react";
import { QuestionnaireAnswerFlow, SharedPoolRewardCard } from "@/components/questionnaire";
import { useQuestionnaireProgress, QUESTIONNAIRE_REWARD_TYPE } from "@/hooks/useQuestionnaire";
import {
  useQuestionnaire,
  getQuestionnaireStatusLabel,
  getQuestionnaireStatusColor,
  QUESTIONNAIRE_STATUS,
} from "@/hooks/useQuestionnaire";
import { useContract } from "@/hooks/useContract";
import { formatBalanceWithSymbol } from "@/lib/balance";
import { CoinTypeId } from "@/lib/tokens";

export default function QuestionnaireDetail() {
  const [, params] = useRoute("/questionnaire/:id");
  const questionnaireId = params?.id;
  const { activeAddress } = useContract();

  const {
    data: questionnaire,
    isLoading,
    error,
    refetch: refetchQuestionnaire,
  } = useQuestionnaire(questionnaireId);

  const { data: progress, refetch: refetchProgress } = useQuestionnaireProgress(
    questionnaireId,
    activeAddress || undefined
  );

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (error || !questionnaire) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h3 className="text-lg font-medium">Questionnaire Not Found</h3>
            <p className="text-muted-foreground mt-2">
              The questionnaire you're looking for doesn't exist or has been removed.
            </p>
            <Link href="/questionnaires">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Questionnaires
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const timeRemaining = questionnaire.endTime
    ? new Date(questionnaire.endTime).getTime() - new Date().getTime()
    : null;
  const daysRemaining = timeRemaining
    ? Math.max(0, Math.ceil(timeRemaining / (1000 * 60 * 60 * 24)))
    : null;

  const isActive = questionnaire.status === QUESTIONNAIRE_STATUS.ACTIVE;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Back button */}
      <Link href="/questionnaires">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Questionnaires
        </Button>
      </Link>

      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Info */}
        <div className="flex-1 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-2xl">{questionnaire.title}</CardTitle>
                    <Badge
                      className={getQuestionnaireStatusColor(questionnaire.status)}
                    >
                      {getQuestionnaireStatusLabel(questionnaire.status)}
                    </Badge>
                  </div>
                  {questionnaire.description && (
                    <CardDescription className="text-base">
                      {questionnaire.description}
                    </CardDescription>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 pt-4">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-sm">
                    {questionnaire.creatorAddress.slice(2, 4).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm text-muted-foreground">Created by</p>
                  <p className="text-sm font-medium">
                    {questionnaire.creatorAddress.slice(0, 6)}...
                    {questionnaire.creatorAddress.slice(-4)}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Polls</p>
                    <p className="font-semibold">{questionnaire.pollCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Completions</p>
                    <p className="font-semibold">{questionnaire.completionCount}</p>
                  </div>
                </div>
                {questionnaire.totalRewardAmount &&
                  questionnaire.totalRewardAmount !== "0" && (
                    <div className="flex items-center gap-2">
                      <Coins className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Total Rewards</p>
                        <p className="font-semibold">
                          {formatBalanceWithSymbol(
                            Number(questionnaire.totalRewardAmount),
                            questionnaire.coinTypeId as CoinTypeId
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                {daysRemaining !== null && isActive && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Time Left</p>
                      <p className="font-semibold">
                        {daysRemaining === 0
                          ? "Ends today"
                          : daysRemaining === 1
                          ? "1 day"
                          : `${daysRemaining} days`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Shared Pool Reward Card - inline for mobile */}
          {questionnaire.rewardType === QUESTIONNAIRE_REWARD_TYPE.SHARED_POOL && (
            <div className="lg:hidden">
              <SharedPoolRewardCard
                questionnaireId={questionnaire.id}
                onChainId={questionnaire.onChainId}
                rewardType={questionnaire.rewardType}
                totalRewardAmount={questionnaire.totalRewardAmount || "0"}
                rewardPerCompletion={questionnaire.rewardPerCompletion || "0"}
                maxCompleters={questionnaire.maxCompleters}
                coinTypeId={questionnaire.coinTypeId || 0}
                completionCount={questionnaire.completionCount}
                walletAddress={activeAddress || undefined}
                isComplete={progress?.isComplete || false}
                onClaimSuccess={() => {
                  refetchQuestionnaire();
                  refetchProgress();
                }}
              />
            </div>
          )}

          {/* Answer Flow */}
          {!activeAddress ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Connect Your Wallet</h3>
                <p className="text-muted-foreground mt-2">
                  Connect your wallet to participate in this questionnaire.
                </p>
              </CardContent>
            </Card>
          ) : !isActive ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Questionnaire Not Active</h3>
                <p className="text-muted-foreground mt-2">
                  This questionnaire is currently{" "}
                  {getQuestionnaireStatusLabel(questionnaire.status).toLowerCase()}.
                </p>
              </CardContent>
            </Card>
          ) : questionnaire.pollCount === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ListChecks className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Polls Added</h3>
                <p className="text-muted-foreground mt-2">
                  This questionnaire doesn't have any polls yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <QuestionnaireAnswerFlow
              questionnaire={questionnaire}
              walletAddress={activeAddress}
              onComplete={() => {
                // Could trigger confetti or navigate somewhere
              }}
            />
          )}
        </div>

        {/* Sidebar - Shared Pool Reward Card for desktop */}
        {questionnaire.rewardType === QUESTIONNAIRE_REWARD_TYPE.SHARED_POOL && (
          <div className="hidden lg:block lg:w-80 xl:w-96 space-y-6">
            <SharedPoolRewardCard
              questionnaireId={questionnaire.id}
              onChainId={questionnaire.onChainId}
              rewardType={questionnaire.rewardType}
              totalRewardAmount={questionnaire.totalRewardAmount || "0"}
              rewardPerCompletion={questionnaire.rewardPerCompletion || "0"}
              maxCompleters={questionnaire.maxCompleters}
              coinTypeId={questionnaire.coinTypeId || 0}
              completionCount={questionnaire.completionCount}
              walletAddress={activeAddress || undefined}
              isComplete={progress?.isComplete || false}
              onClaimSuccess={() => {
                refetchQuestionnaire();
                refetchProgress();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
