import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Vote,
  Trophy,
  PartyPopper,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useContract } from "@/hooks/useContract";
import {
  QuestionnaireWithPolls,
  QuestionnairePoll,
  useQuestionnaireProgress,
  useStartQuestionnaire,
  useRecordBulkVote,
} from "@/hooks/useQuestionnaire";
import { QuestionnaireProgressBar } from "./QuestionnaireProgressBar";
import { QuestionnairePollStepper } from "./QuestionnairePollStepper";
import type { PollWithMeta } from "@/types/poll";

interface QuestionnaireAnswerFlowProps {
  questionnaire: QuestionnaireWithPolls;
  walletAddress: string | undefined;
  onComplete?: () => void;
}

interface PollSelection {
  pollId: number;
  optionIndex: number;
}

export function QuestionnaireAnswerFlow({
  questionnaire,
  walletAddress,
  onComplete,
}: QuestionnaireAnswerFlowProps) {
  const { toast } = useToast();
  const { bulkVote, getPoll, hasVoted, loading: contractLoading } = useContract();

  // Sort polls by sortOrder
  const sortedPolls = useMemo(
    () => [...questionnaire.polls].sort((a, b) => a.sortOrder - b.sortOrder),
    [questionnaire.polls]
  );

  // Track current poll index
  const [currentPollIndex, setCurrentPollIndex] = useState(0);
  const currentPoll = sortedPolls[currentPollIndex];

  // Track selections for all polls
  const [selections, setSelections] = useState<Map<number, number>>(new Map());

  // Track poll data loaded from contract
  const [pollData, setPollData] = useState<Map<number, PollWithMeta>>(new Map());
  const [loadingPolls, setLoadingPolls] = useState(true);
  const [alreadyVotedPolls, setAlreadyVotedPolls] = useState<Set<number>>(new Set());

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Progress tracking
  const { data: progress, refetch: refetchProgress } = useQuestionnaireProgress(
    questionnaire.id,
    walletAddress
  );
  const startQuestionnaireMutation = useStartQuestionnaire();
  const recordBulkVoteMutation = useRecordBulkVote();

  // Load poll data from contract
  useEffect(() => {
    async function loadPolls() {
      if (sortedPolls.length === 0) {
        setLoadingPolls(false);
        return;
      }

      setLoadingPolls(true);
      const newPollData = new Map<number, PollWithMeta>();
      const alreadyVoted = new Set<number>();

      for (const poll of sortedPolls) {
        try {
          const data = await getPoll(poll.pollId);
          if (data) {
            newPollData.set(poll.pollId, data);
          }

          // Check if user has already voted
          if (walletAddress) {
            const voted = await hasVoted(poll.pollId, walletAddress);
            if (voted) {
              alreadyVoted.add(poll.pollId);
            }
          }
        } catch (err) {
          console.error(`Failed to load poll ${poll.pollId}:`, err);
        }
      }

      setPollData(newPollData);
      setAlreadyVotedPolls(alreadyVoted);
      setLoadingPolls(false);
    }

    loadPolls();
  }, [sortedPolls, getPoll, hasVoted, walletAddress]);

  // Start questionnaire on mount if not already started
  useEffect(() => {
    if (walletAddress && !progress?.started && !startQuestionnaireMutation.isPending) {
      startQuestionnaireMutation.mutate(
        { questionnaireId: questionnaire.id, walletAddress },
        { onSuccess: () => refetchProgress() }
      );
    }
  }, [
    walletAddress,
    questionnaire.id,
    progress?.started,
    startQuestionnaireMutation,
    refetchProgress,
  ]);

  // Get answered poll IDs (from selections + already voted on chain)
  const answeredPollIds = useMemo(() => {
    const answered: number[] = [];
    for (const poll of sortedPolls) {
      if (selections.has(poll.pollId) || alreadyVotedPolls.has(poll.pollId)) {
        answered.push(poll.pollId);
      }
    }
    return answered;
  }, [sortedPolls, selections, alreadyVotedPolls]);

  // Check if all polls are answered
  const allPollsAnswered = answeredPollIds.length === sortedPolls.length;

  // Check if we can submit (all polls answered, not already submitted)
  const canSubmit = allPollsAnswered && !progress?.isComplete && selections.size > 0;

  // Handle option selection
  const handleSelectOption = useCallback((pollId: number, optionIndex: number) => {
    setSelections((prev) => {
      const next = new Map(prev);
      next.set(pollId, optionIndex);
      return next;
    });
  }, []);

  // Handle navigation
  const handleNavigate = useCallback((index: number) => {
    if (index >= 0 && index < sortedPolls.length) {
      setCurrentPollIndex(index);
    }
  }, [sortedPolls.length]);

  // Move to next poll after selection
  const handleNextPoll = useCallback(() => {
    if (currentPollIndex < sortedPolls.length - 1) {
      setCurrentPollIndex((prev) => prev + 1);
    }
  }, [currentPollIndex, sortedPolls.length]);

  // Submit all votes
  const handleSubmitAllVotes = useCallback(async () => {
    if (!walletAddress || !canSubmit) return;

    setIsSubmitting(true);

    try {
      // Build arrays for bulk vote (only include new votes, not already voted)
      const pollIds: number[] = [];
      const optionIndices: number[] = [];

      const entries = Array.from(selections.entries());
      for (const [pollId, optionIndex] of entries) {
        if (!alreadyVotedPolls.has(pollId)) {
          pollIds.push(pollId);
          optionIndices.push(optionIndex);
        }
      }

      if (pollIds.length === 0) {
        // All polls were already voted on-chain, just mark as complete
        const selectionEntries = Array.from(selections.entries());
        await recordBulkVoteMutation.mutateAsync({
          questionnaireId: questionnaire.id,
          walletAddress,
          pollIds: selectionEntries.map(([k]) => k),
          optionIndices: selectionEntries.map(([, v]) => v),
          txHash: "already-voted",
        });

        toast({
          title: "Questionnaire Complete!",
          description: "All your votes were already recorded.",
        });

        refetchProgress();
        onComplete?.();
        return;
      }

      // Submit bulk vote to blockchain
      const result = await bulkVote(pollIds, optionIndices);

      if (result.success && result.hash) {
        // Record in database
        const allSelections = Array.from(selections.entries());
        await recordBulkVoteMutation.mutateAsync({
          questionnaireId: questionnaire.id,
          walletAddress,
          pollIds: allSelections.map(([k]) => k),
          optionIndices: allSelections.map(([, v]) => v),
          txHash: result.hash,
        });

        toast({
          title: "Votes Submitted!",
          description: `All ${pollIds.length} votes submitted successfully.`,
        });

        refetchProgress();
        onComplete?.();
      }
    } catch (err) {
      console.error("Failed to submit votes:", err);
      toast({
        title: "Submission Failed",
        description: err instanceof Error ? err.message : "Failed to submit votes",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    walletAddress,
    canSubmit,
    selections,
    alreadyVotedPolls,
    bulkVote,
    questionnaire.id,
    recordBulkVoteMutation,
    toast,
    refetchProgress,
    onComplete,
  ]);

  // Loading state
  if (loadingPolls) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading polls...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Completion screen
  if (progress?.isComplete) {
    return (
      <Card className="text-center">
        <CardContent className="py-12 space-y-4">
          <PartyPopper className="h-16 w-16 mx-auto text-primary" />
          <h2 className="text-2xl font-bold">Questionnaire Complete!</h2>
          <p className="text-muted-foreground">
            You've answered all {sortedPolls.length} polls in this questionnaire.
          </p>
          <Badge variant="default" className="text-lg px-4 py-1">
            <Trophy className="h-4 w-4 mr-2" />
            100% Complete
          </Badge>
          {progress.bulkVoteTxHash && progress.bulkVoteTxHash !== "already-voted" && (
            <p className="text-xs text-muted-foreground">
              TX: {progress.bulkVoteTxHash.slice(0, 10)}...
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Not connected
  if (!walletAddress) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Connect Your Wallet</h3>
          <p className="text-muted-foreground">
            Please connect your wallet to participate in this questionnaire.
          </p>
        </CardContent>
      </Card>
    );
  }

  const currentPollData = currentPoll ? pollData.get(currentPoll.pollId) : null;
  const isCurrentPollAnswered =
    currentPoll &&
    (selections.has(currentPoll.pollId) || alreadyVotedPolls.has(currentPoll.pollId));
  const currentSelection = currentPoll ? selections.get(currentPoll.pollId) : undefined;

  return (
    <div className="space-y-6">
      {/* Progress */}
      <QuestionnaireProgressBar
        totalPolls={sortedPolls.length}
        answeredPolls={answeredPollIds.length}
        isComplete={false}
      />

      {/* Poll Stepper */}
      <QuestionnairePollStepper
        polls={sortedPolls}
        currentIndex={currentPollIndex}
        answeredPollIds={answeredPollIds}
        onNavigate={handleNavigate}
        disabled={isSubmitting}
      />

      {/* Current Poll */}
      {currentPoll && currentPollData && (
        <PollVotingCard
          poll={currentPollData}
          selectedOption={currentSelection}
          isAlreadyVoted={alreadyVotedPolls.has(currentPoll.pollId)}
          onSelectOption={(optionIndex) =>
            handleSelectOption(currentPoll.pollId, optionIndex)
          }
          onNext={handleNextPoll}
          isLastPoll={currentPollIndex === sortedPolls.length - 1}
          disabled={isSubmitting}
        />
      )}

      {/* Submit All Votes Button */}
      {allPollsAnswered && (
        <Card className="border-primary">
          <CardContent className="py-6">
            <div className="flex flex-col items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <h3 className="font-semibold text-lg">All Polls Answered!</h3>
                <p className="text-muted-foreground">
                  Submit all your votes in one transaction.
                </p>
              </div>
              <Button
                size="lg"
                onClick={handleSubmitAllVotes}
                disabled={!canSubmit || isSubmitting || contractLoading}
                className="min-w-[200px]"
              >
                {isSubmitting || contractLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit All Votes
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Individual poll voting card
interface PollVotingCardProps {
  poll: PollWithMeta;
  selectedOption: number | undefined;
  isAlreadyVoted: boolean;
  onSelectOption: (optionIndex: number) => void;
  onNext: () => void;
  isLastPoll: boolean;
  disabled?: boolean;
}

function PollVotingCard({
  poll,
  selectedOption,
  isAlreadyVoted,
  onSelectOption,
  onNext,
  isLastPoll,
  disabled,
}: PollVotingCardProps) {
  const totalVotes = poll.totalVotes || 0;

  // Format options with vote counts
  const options = poll.options.map((option: string, index: number) => ({
    id: `${poll.id}-${index}`,
    text: option,
    votes: Number(poll.votes[index]),
    percentage:
      totalVotes > 0 ? Math.round((Number(poll.votes[index]) / totalVotes) * 100) : 0,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{poll.title}</CardTitle>
            <CardDescription>
              {totalVotes} {totalVotes === 1 ? "vote" : "votes"} cast
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {isAlreadyVoted && (
              <Badge variant="secondary">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Already Voted
              </Badge>
            )}
            {selectedOption !== undefined && !isAlreadyVoted && (
              <Badge variant="default">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Selected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAlreadyVoted ? (
          // Show results if already voted
          <div className="space-y-3">
            {options.map((option) => (
              <div key={option.id} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{option.text}</span>
                  <span className="text-muted-foreground">
                    {option.votes} ({option.percentage}%)
                  </span>
                </div>
                <Progress value={option.percentage} className="h-2" />
              </div>
            ))}
            <p className="text-sm text-muted-foreground text-center pt-2">
              You have already voted on this poll
            </p>
          </div>
        ) : (
          // Show options for selection
          <>
            <RadioGroup
              value={selectedOption !== undefined ? selectedOption.toString() : ""}
              onValueChange={(value) => onSelectOption(parseInt(value))}
              disabled={disabled}
            >
              {options.map((option, index) => (
                <div
                  key={option.id}
                  className={`flex items-center space-x-3 p-3 border rounded-lg transition-colors ${
                    selectedOption === index ? "border-primary bg-primary/5" : ""
                  } ${disabled ? "opacity-50" : "hover:bg-muted/50"}`}
                >
                  <RadioGroupItem
                    value={index.toString()}
                    id={option.id}
                    disabled={disabled}
                  />
                  <Label
                    htmlFor={option.id}
                    className={`flex-1 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    {option.text}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {selectedOption !== undefined && !isLastPoll && (
              <Button
                onClick={onNext}
                disabled={disabled}
                className="w-full"
                variant="outline"
              >
                Next Poll
                <Vote className="h-4 w-4 ml-2" />
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
