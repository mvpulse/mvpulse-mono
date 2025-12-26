import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { DurationInput } from "@/components/ui/duration-input";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Search,
  Plus,
  Trash2,
  GripVertical,
  Coins,
  ListChecks,
  AlertCircle,
  Loader2,
  Wallet,
  Info,
  Calculator,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useContract } from "@/hooks/useContract";
import { useDurationInput } from "@/hooks/useDurationInput";
import {
  useCreateQuestionnaire,
  useUpdateQuestionnaire,
  QUESTIONNAIRE_STATUS,
  QUESTIONNAIRE_REWARD_TYPE,
} from "@/hooks/useQuestionnaire";
import { COIN_TYPES, getCoinSymbol, getFAMetadataAddress, CoinTypeId } from "@/lib/tokens";
import { formatBalance, parseToSmallestUnit } from "@/lib/balance";
import { useNetwork } from "@/contexts/NetworkContext";
import type { PollWithMeta, CreatePollInput } from "@/types/poll";
import { PLATFORM_FEE_BPS, calculatePlatformFee, calculateNetAmount } from "@/types/poll";
import { type PollFormData } from "@/components/poll";
import {
  CreationMethodSelector,
  useCreationMethodPreference,
  type CreationMethod,
  PollCreationModal,
  InlinePollCreator,
  TabbedPollSelector,
} from "@/components/questionnaire";

const STEPS = [
  { id: 1, title: "Basic Info", description: "Title and description" },
  { id: 2, title: "Select Polls", description: "Choose polls to include" },
  { id: 3, title: "Rewards", description: "Configure reward structure" },
  { id: 4, title: "Review", description: "Review and create" },
];

const CATEGORIES = [
  "General",
  "DeFi",
  "Gaming",
  "NFT",
  "Governance",
  "Community",
  "Survey",
  "Other",
];

export default function CreateQuestionnaire() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { network } = useNetwork();
  const {
    activeAddress,
    getAllPolls,
    createQuestionnairePool,
    createPollsBatch,
    loading: contractLoading,
  } = useContract();

  const createQuestionnaireMutation = useCreateQuestionnaire();
  const updateQuestionnaireMutation = useUpdateQuestionnaire();

  // Current step
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Basic Info
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("");

  // Duration state with unified input (default to custom for questionnaires)
  const durationInput = useDurationInput("custom");

  // Step 2: Poll Selection
  const [availablePolls, setAvailablePolls] = useState<PollWithMeta[]>([]);
  const [loadingPolls, setLoadingPolls] = useState(true);
  const [selectedPollIds, setSelectedPollIds] = useState<number[]>([]);
  const [pollSearchTerm, setPollSearchTerm] = useState("");

  // Poll creation within questionnaire
  const [creationMethod, setCreationMethod] = useCreationMethodPreference();
  const [pendingNewPolls, setPendingNewPolls] = useState<PollFormData[]>([]);
  const [isPollCreationModalOpen, setIsPollCreationModalOpen] = useState(false);

  // Step 3: Rewards
  const [rewardType, setRewardType] = useState<"per_poll" | "shared_pool">("per_poll");
  const [coinTypeId, setCoinTypeId] = useState<CoinTypeId>(COIN_TYPES.PULSE);
  const [totalRewardAmount, setTotalRewardAmount] = useState("");
  const [rewardPerCompletion, setRewardPerCompletion] = useState<"equal" | "fixed">("equal");
  const [fixedRewardAmount, setFixedRewardAmount] = useState("");
  const [maxCompleters, setMaxCompleters] = useState("");

  // Submission state
  const [isCreating, setIsCreating] = useState(false);

  // Calculate platform fee for shared pool rewards
  const rewardCalculations = useMemo(() => {
    if (rewardType !== "shared_pool" || !totalRewardAmount) {
      return { grossAmount: 0, fee: 0, netAmount: 0, rewardPerCompleter: 0, isValid: false };
    }

    const gross = parseFloat(totalRewardAmount) || 0;
    const decimals = coinTypeId === COIN_TYPES.USDC ? 6 : 8;
    const grossSmallest = gross * Math.pow(10, decimals);
    const fee = calculatePlatformFee(grossSmallest) / Math.pow(10, decimals);
    const net = calculateNetAmount(grossSmallest) / Math.pow(10, decimals);
    const max = parseInt(maxCompleters) || 0;

    let rewardPerCompleter = 0;
    if (rewardPerCompletion === "equal" && max > 0) {
      rewardPerCompleter = net / max;
    } else if (rewardPerCompletion === "fixed" && fixedRewardAmount) {
      rewardPerCompleter = parseFloat(fixedRewardAmount) || 0;
    }

    return {
      grossAmount: gross,
      fee,
      netAmount: net,
      rewardPerCompleter,
      isValid: gross > 0,
    };
  }, [rewardType, totalRewardAmount, coinTypeId, maxCompleters, rewardPerCompletion, fixedRewardAmount]);

  // Load available polls
  useEffect(() => {
    async function loadPolls() {
      setLoadingPolls(true);
      try {
        const polls = await getAllPolls();
        // Filter to only show active polls
        const activePolls = polls.filter((p) => p.isActive);
        setAvailablePolls(activePolls);
      } catch (err) {
        console.error("Failed to load polls:", err);
      } finally {
        setLoadingPolls(false);
      }
    }
    loadPolls();
  }, [getAllPolls]);

  // Filter polls based on search
  const filteredPolls = useMemo(() => {
    if (!pollSearchTerm) return availablePolls;
    const term = pollSearchTerm.toLowerCase();
    return availablePolls.filter(
      (p) =>
        p.title.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term)
    );
  }, [availablePolls, pollSearchTerm]);

  // Get selected polls in order
  const selectedPolls = useMemo(() => {
    return selectedPollIds
      .map((id) => availablePolls.find((p) => p.id === id))
      .filter((p): p is PollWithMeta => !!p);
  }, [selectedPollIds, availablePolls]);

  // Toggle poll selection
  const togglePollSelection = (pollId: number) => {
    setSelectedPollIds((prev) => {
      if (prev.includes(pollId)) {
        return prev.filter((id) => id !== pollId);
      }
      return [...prev, pollId];
    });
  };

  // Move poll up in order
  const movePollUp = (index: number) => {
    if (index === 0) return;
    setSelectedPollIds((prev) => {
      const newOrder = [...prev];
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      return newOrder;
    });
  };

  // Move poll down in order
  const movePollDown = (index: number) => {
    if (index === selectedPollIds.length - 1) return;
    setSelectedPollIds((prev) => {
      const newOrder = [...prev];
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      return newOrder;
    });
  };

  // Handler for new poll creation
  const handlePollCreated = (data: PollFormData) => {
    setPendingNewPolls((prev) => [...prev, data]);
    toast({
      title: "Poll Added",
      description: `"${data.title}" will be created when you submit the questionnaire.`,
    });
  };

  // Remove a pending poll
  const removePendingPoll = (index: number) => {
    setPendingNewPolls((prev) => prev.filter((_, i) => i !== index));
  };

  // Total polls count (existing selected + pending new)
  const totalPollsCount = selectedPollIds.length + pendingNewPolls.length;

  // Validation for each step
  const isStep1Valid = title.trim().length > 0 && durationInput.durationSecs > 0;
  const isStep2Valid = totalPollsCount >= 2;
  const isStep3Valid =
    rewardType === "per_poll" ||
    (rewardType === "shared_pool" && totalRewardAmount && parseFloat(totalRewardAmount) > 0);

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return isStep1Valid;
      case 2:
        return isStep2Valid;
      case 3:
        return isStep3Valid;
      default:
        return true;
    }
  };

  // Navigate steps
  const goNext = () => {
    if (currentStep < 4 && canProceed()) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // Calculate duration in seconds (now from hook)
  const getDurationSecs = () => durationInput.durationSecs;

  // Create questionnaire
  const handleCreate = async () => {
    if (!activeAddress) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to create a questionnaire.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      // Step 0: Create any pending new polls via batch transaction
      let allPollIds = [...selectedPollIds];

      if (pendingNewPolls.length > 0) {
        toast({
          title: "Creating Polls",
          description: `Creating ${pendingNewPolls.length} new poll(s)...`,
        });

        // Convert PollFormData to CreatePollInput
        const pollInputs: CreatePollInput[] = pendingNewPolls.map((poll) => ({
          title: poll.title,
          description: poll.description,
          options: poll.options,
          rewardPerVote: poll.rewardPerVote,
          maxVoters: poll.maxVoters,
          durationSecs: poll.durationSecs,
          fundAmount: poll.fundAmount,
          coinTypeId: poll.selectedToken,
        }));

        const batchResult = await createPollsBatch(pollInputs);

        if (!batchResult.success) {
          throw new Error("Failed to create polls");
        }

        // Add newly created poll IDs to the list
        allPollIds = [...allPollIds, ...batchResult.pollIds];

        toast({
          title: "Polls Created",
          description: `Successfully created ${batchResult.pollIds.length} new poll(s).`,
        });
      }

      // Step 1: Create questionnaire in database
      const questionnaire = await createQuestionnaireMutation.mutateAsync({
        creatorAddress: activeAddress,
        title,
        description,
        category: category || undefined,
        startTime: new Date(durationInput.startDate).toISOString(),
        endTime: new Date(durationInput.endDate).toISOString(),
        rewardType:
          rewardType === "per_poll"
            ? QUESTIONNAIRE_REWARD_TYPE.PER_POLL
            : QUESTIONNAIRE_REWARD_TYPE.SHARED_POOL,
        totalRewardAmount:
          rewardType === "shared_pool"
            ? parseToSmallestUnit(parseFloat(totalRewardAmount), coinTypeId === COIN_TYPES.USDC ? 6 : 8).toString()
            : "0",
        coinTypeId,
        rewardPerCompletion:
          rewardType === "shared_pool" && rewardPerCompletion === "fixed" && fixedRewardAmount
            ? parseToSmallestUnit(parseFloat(fixedRewardAmount), coinTypeId === COIN_TYPES.USDC ? 6 : 8).toString()
            : "0",
        maxCompleters: maxCompleters ? parseInt(maxCompleters) : undefined,
        pollIds: allPollIds,
      });

      // Step 2: If shared pool, create on-chain pool
      if (rewardType === "shared_pool" && parseFloat(totalRewardAmount) > 0) {
        const networkType = network === "mainnet" ? "mainnet" : "testnet";
        const faMetadataAddress = getFAMetadataAddress(coinTypeId, networkType);

        if (!faMetadataAddress) {
          throw new Error("FA metadata address not configured");
        }

        const fundAmount = parseToSmallestUnit(
          parseFloat(totalRewardAmount),
          coinTypeId === COIN_TYPES.USDC ? 6 : 8
        );
        const rewardPerCompletionAmount =
          rewardPerCompletion === "fixed" && fixedRewardAmount
            ? parseToSmallestUnit(parseFloat(fixedRewardAmount), coinTypeId === COIN_TYPES.USDC ? 6 : 8)
            : 0;
        const maxCompletersNum = maxCompleters ? parseInt(maxCompleters) : 0;

        const poolResult = await createQuestionnairePool(
          allPollIds,
          rewardPerCompletionAmount,
          maxCompletersNum,
          getDurationSecs(),
          fundAmount,
          faMetadataAddress,
          coinTypeId
        );

        if (poolResult.success) {
          // Update questionnaire with on-chain ID (assuming it's the next ID)
          // In a production app, you'd parse the event to get the actual ID
          await updateQuestionnaireMutation.mutateAsync({
            id: questionnaire.id,
            status: QUESTIONNAIRE_STATUS.ACTIVE,
          });

          toast({
            title: "Questionnaire Created!",
            description: "Your questionnaire with shared rewards is now live.",
          });
        }
      } else {
        // For per-poll rewards, just activate the questionnaire
        await updateQuestionnaireMutation.mutateAsync({
          id: questionnaire.id,
          status: QUESTIONNAIRE_STATUS.ACTIVE,
        });

        toast({
          title: "Questionnaire Created!",
          description: "Your questionnaire is now live.",
        });
      }

      navigate(`/questionnaire/${questionnaire.id}`);
    } catch (err) {
      console.error("Failed to create questionnaire:", err);
      toast({
        title: "Creation Failed",
        description: err instanceof Error ? err.message : "Failed to create questionnaire",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Not connected
  if (!activeAddress) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Connect Your Wallet</h3>
            <p className="text-muted-foreground mt-2">
              Please connect your wallet to create a questionnaire.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/questionnaires")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Questionnaires
        </Button>
        <h1 className="text-3xl font-bold mt-4">Create Questionnaire</h1>
        <p className="text-muted-foreground">
          Group polls together with optional shared rewards
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          {STEPS.map((step, index) => (
            <div
              key={step.id}
              className={`flex-1 ${index < STEPS.length - 1 ? "pr-4" : ""}`}
            >
              <div className="flex items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                    currentStep > step.id
                      ? "bg-primary border-primary text-primary-foreground"
                      : currentStep === step.id
                      ? "border-primary text-primary"
                      : "border-muted-foreground text-muted-foreground"
                  }`}
                >
                  {currentStep > step.id ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-sm font-medium">{step.id}</span>
                  )}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${
                      currentStep > step.id ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
              <div className="mt-2">
                <p
                  className={`text-sm font-medium ${
                    currentStep >= step.id
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.title}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="p-6">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter questionnaire title"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your questionnaire..."
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DurationInput
                mode={durationInput.mode}
                onModeChange={durationInput.setMode}
                fixedDuration={durationInput.fixedDuration}
                onFixedDurationChange={durationInput.setFixedDuration}
                startDate={durationInput.startDate}
                endDate={durationInput.endDate}
                onStartDateChange={durationInput.setStartDate}
                onEndDateChange={durationInput.setEndDate}
                label="Duration *"
              />
            </div>
          )}

          {/* Step 2: Select Polls */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* Creation Method Selector */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Add Polls</h4>
                  <p className="text-sm text-muted-foreground">
                    Select existing polls or create new ones
                  </p>
                </div>
                <CreationMethodSelector
                  value={creationMethod}
                  onChange={setCreationMethod}
                />
              </div>

              {/* Info note about poll creation */}
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Polls created here inherit the questionnaire's category and duration. Rewards are managed at the questionnaire level.
                </p>
              </div>

              {/* Tab-based UI */}
              {creationMethod === "tab" && (
                <TabbedPollSelector
                  availablePolls={filteredPolls}
                  selectedPollIds={selectedPollIds}
                  onSelectionChange={setSelectedPollIds}
                  onPollCreated={handlePollCreated}
                  isLoading={loadingPolls}
                  showIncentives={false}
                  defaultTab={availablePolls.length === 0 ? "create" : "existing"}
                  pendingNewPollsCount={pendingNewPolls.length}
                  inheritedCategory={category}
                  inheritedDurationSecs={durationInput.durationSecs}
                />
              )}

              {/* Modal-based UI */}
              {creationMethod === "modal" && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label>Search Polls</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsPollCreationModalOpen(true)}
                        className="gap-1"
                      >
                        <Plus className="h-4 w-4" />
                        Create New Poll
                      </Button>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={pollSearchTerm}
                        onChange={(e) => setPollSearchTerm(e.target.value)}
                        placeholder="Search by title or description..."
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    {/* Available Polls */}
                    <div>
                      <h4 className="font-medium mb-3">Available Polls</h4>
                      <div className="border rounded-lg h-[350px] overflow-y-auto">
                        {loadingPolls ? (
                          <div className="p-4 space-y-3">
                            {[...Array(4)].map((_, i) => (
                              <Skeleton key={i} className="h-16 w-full" />
                            ))}
                          </div>
                        ) : filteredPolls.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground">
                            <p>No active polls found</p>
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => setIsPollCreationModalOpen(true)}
                              className="mt-2"
                            >
                              Create your first poll
                            </Button>
                          </div>
                        ) : (
                          <div className="p-2 space-y-2">
                            {filteredPolls.map((poll) => (
                              <div
                                key={poll.id}
                                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                  selectedPollIds.includes(poll.id)
                                    ? "border-primary bg-primary/5"
                                    : "hover:bg-muted/50"
                                }`}
                                onClick={() => togglePollSelection(poll.id)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">
                                      {poll.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {poll.totalVotes} votes
                                    </p>
                                  </div>
                                  <Checkbox
                                    checked={selectedPollIds.includes(poll.id)}
                                    className="mt-0.5"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Selected Polls */}
                    <div>
                      <h4 className="font-medium mb-3">
                        Selected Polls ({totalPollsCount})
                      </h4>
                      <div className="border rounded-lg h-[350px] overflow-y-auto">
                        {totalPollsCount === 0 ? (
                          <div className="p-4 text-center text-muted-foreground">
                            Select at least 2 polls
                          </div>
                        ) : (
                          <div className="p-2 space-y-2">
                            {/* Existing selected polls */}
                            {selectedPolls.map((poll, index) => (
                              <div
                                key={poll.id}
                                className="p-3 border rounded-lg bg-muted/30"
                              >
                                <div className="flex items-center gap-2">
                                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium text-muted-foreground w-6">
                                    {index + 1}.
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">
                                      {poll.title}
                                    </p>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => movePollUp(index)}
                                      disabled={index === 0}
                                      className="h-7 w-7 p-0"
                                    >
                                      <ArrowLeft className="h-3 w-3 rotate-90" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => movePollDown(index)}
                                      disabled={index === selectedPollIds.length - 1}
                                      className="h-7 w-7 p-0"
                                    >
                                      <ArrowRight className="h-3 w-3 rotate-90" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => togglePollSelection(poll.id)}
                                      className="h-7 w-7 p-0 text-destructive"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {/* Pending new polls */}
                            {pendingNewPolls.map((poll, index) => (
                              <div
                                key={`pending-${index}`}
                                className="p-3 border rounded-lg bg-primary/5 border-primary/30"
                              >
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-[10px] shrink-0">
                                    NEW
                                  </Badge>
                                  <span className="text-sm font-medium text-muted-foreground w-6">
                                    {selectedPollIds.length + index + 1}.
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">
                                      {poll.title}
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removePendingPoll(index)}
                                    className="h-7 w-7 p-0 text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <PollCreationModal
                    open={isPollCreationModalOpen}
                    onOpenChange={setIsPollCreationModalOpen}
                    onPollCreated={handlePollCreated}
                    showIncentives={false}
                    inheritedCategory={category}
                    inheritedDurationSecs={durationInput.durationSecs}
                  />
                </>
              )}

              {/* Inline-based UI */}
              {creationMethod === "inline" && (
                <>
                  <div>
                    <Label>Search Polls</Label>
                    <div className="relative mt-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={pollSearchTerm}
                        onChange={(e) => setPollSearchTerm(e.target.value)}
                        placeholder="Search by title or description..."
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    {/* Available Polls + Inline Creator */}
                    <div className="space-y-4">
                      <h4 className="font-medium">Available Polls</h4>
                      <div className="border rounded-lg h-[300px] overflow-y-auto">
                        {loadingPolls ? (
                          <div className="p-4 space-y-3">
                            {[...Array(3)].map((_, i) => (
                              <Skeleton key={i} className="h-16 w-full" />
                            ))}
                          </div>
                        ) : filteredPolls.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground">
                            No active polls found
                          </div>
                        ) : (
                          <div className="p-2 space-y-2">
                            {filteredPolls.map((poll) => (
                              <div
                                key={poll.id}
                                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                  selectedPollIds.includes(poll.id)
                                    ? "border-primary bg-primary/5"
                                    : "hover:bg-muted/50"
                                }`}
                                onClick={() => togglePollSelection(poll.id)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">
                                      {poll.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {poll.totalVotes} votes
                                    </p>
                                  </div>
                                  <Checkbox
                                    checked={selectedPollIds.includes(poll.id)}
                                    className="mt-0.5"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Inline poll creator */}
                      <InlinePollCreator
                        onPollCreated={handlePollCreated}
                        showIncentives={false}
                        defaultOpen={availablePolls.length === 0}
                        inheritedCategory={category}
                        inheritedDurationSecs={durationInput.durationSecs}
                      />
                    </div>

                    {/* Selected Polls */}
                    <div>
                      <h4 className="font-medium mb-3">
                        Selected Polls ({totalPollsCount})
                      </h4>
                      <div className="border rounded-lg h-[400px] overflow-y-auto">
                        {totalPollsCount === 0 ? (
                          <div className="p-4 text-center text-muted-foreground">
                            Select at least 2 polls
                          </div>
                        ) : (
                          <div className="p-2 space-y-2">
                            {/* Existing selected polls */}
                            {selectedPolls.map((poll, index) => (
                              <div
                                key={poll.id}
                                className="p-3 border rounded-lg bg-muted/30"
                              >
                                <div className="flex items-center gap-2">
                                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium text-muted-foreground w-6">
                                    {index + 1}.
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">
                                      {poll.title}
                                    </p>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => movePollUp(index)}
                                      disabled={index === 0}
                                      className="h-7 w-7 p-0"
                                    >
                                      <ArrowLeft className="h-3 w-3 rotate-90" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => movePollDown(index)}
                                      disabled={index === selectedPollIds.length - 1}
                                      className="h-7 w-7 p-0"
                                    >
                                      <ArrowRight className="h-3 w-3 rotate-90" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => togglePollSelection(poll.id)}
                                      className="h-7 w-7 p-0 text-destructive"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {/* Pending new polls */}
                            {pendingNewPolls.map((poll, index) => (
                              <div
                                key={`pending-${index}`}
                                className="p-3 border rounded-lg bg-primary/5 border-primary/30"
                              >
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-[10px] shrink-0">
                                    NEW
                                  </Badge>
                                  <span className="text-sm font-medium text-muted-foreground w-6">
                                    {selectedPollIds.length + index + 1}.
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">
                                      {poll.title}
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removePendingPoll(index)}
                                    className="h-7 w-7 p-0 text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Pending polls summary (only for tab mode) */}
              {creationMethod === "tab" && pendingNewPolls.length > 0 && (
                <div className="p-4 border rounded-lg bg-muted/30">
                  <h4 className="font-medium mb-2">Pending New Polls ({pendingNewPolls.length})</h4>
                  <div className="space-y-2">
                    {pendingNewPolls.map((poll, index) => (
                      <div
                        key={`pending-${index}`}
                        className="flex items-center justify-between p-2 bg-background rounded border"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">NEW</Badge>
                          <span className="text-sm font-medium">{poll.title}</span>
                          <span className="text-xs text-muted-foreground">
                            ({poll.options.length} options)
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePendingPoll(index)}
                          className="h-7 w-7 p-0 text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {totalPollsCount > 0 && totalPollsCount < 2 && (
                <div className="flex items-center gap-2 text-amber-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>Add at least 2 polls for a questionnaire</span>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Rewards */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <Label className="text-base font-medium">Reward Structure</Label>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose how participants earn rewards
                </p>

                <RadioGroup
                  value={rewardType}
                  onValueChange={(v) => setRewardType(v as "per_poll" | "shared_pool")}
                  className="space-y-4"
                >
                  <div
                    className={`p-4 border rounded-lg cursor-pointer ${
                      rewardType === "per_poll" ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="per_poll" id="per_poll" className="mt-1" />
                      <div>
                        <Label htmlFor="per_poll" className="font-medium cursor-pointer">
                          Per-Poll Rewards
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Each poll has its own reward. Users earn rewards for each poll
                          they vote on (uses existing poll rewards).
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`p-4 border rounded-lg cursor-pointer ${
                      rewardType === "shared_pool" ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem
                        value="shared_pool"
                        id="shared_pool"
                        className="mt-1"
                      />
                      <div>
                        <Label htmlFor="shared_pool" className="font-medium cursor-pointer">
                          Shared Pool Rewards
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Single reward pool for the entire questionnaire. Only users who
                          complete ALL polls can claim from the shared pool.
                        </p>
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {rewardType === "shared_pool" && (
                <>
                  <div className="border-t pt-6 space-y-4">
                    <h4 className="font-medium">Shared Pool Configuration</h4>

                    {/* Info Banner */}
                    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50 flex items-start gap-2">
                      <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Fund your questionnaire's reward pool. A {PLATFORM_FEE_BPS / 100}% platform fee applies.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="coinType">Reward Token</Label>
                        <Select
                          value={coinTypeId.toString()}
                          onValueChange={(v) => setCoinTypeId(parseInt(v) as CoinTypeId)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">PULSE</SelectItem>
                            <SelectItem value="2">USDC</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="totalReward">Total Reward Amount *</Label>
                        <div className="relative mt-1">
                          <Input
                            id="totalReward"
                            type="number"
                            step="0.01"
                            min="0"
                            value={totalRewardAmount}
                            onChange={(e) => setTotalRewardAmount(e.target.value)}
                            placeholder="100"
                            className="pr-16"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {getCoinSymbol(coinTypeId)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="mb-2 block">Reward Distribution</Label>
                      <RadioGroup
                        value={rewardPerCompletion}
                        onValueChange={(v) =>
                          setRewardPerCompletion(v as "equal" | "fixed")
                        }
                        className="flex gap-4"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="equal" id="equal" />
                          <Label htmlFor="equal" className="cursor-pointer">
                            Equal split among completers
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="fixed" id="fixed" />
                          <Label htmlFor="fixed" className="cursor-pointer">
                            Fixed amount per completer
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {rewardPerCompletion === "fixed" && (
                      <div>
                        <Label htmlFor="fixedAmount">Amount per Completer</Label>
                        <div className="relative mt-1">
                          <Input
                            id="fixedAmount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={fixedRewardAmount}
                            onChange={(e) => setFixedRewardAmount(e.target.value)}
                            placeholder="10"
                            className="pr-16"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {getCoinSymbol(coinTypeId)}
                          </span>
                        </div>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="maxCompleters">
                        Max Completers (optional, leave empty for unlimited)
                      </Label>
                      <Input
                        id="maxCompleters"
                        type="number"
                        min="0"
                        value={maxCompleters}
                        onChange={(e) => setMaxCompleters(e.target.value)}
                        placeholder="100"
                        className="mt-1"
                      />
                    </div>

                    {/* Calculation Summary */}
                    {rewardCalculations.isValid && (
                      <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 space-y-2">
                        <div className="flex items-center gap-2 text-accent font-medium text-sm">
                          <Calculator className="w-3 h-3" />
                          Summary
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Deposit:</span>
                            <span className="font-mono font-medium">
                              {rewardCalculations.grossAmount.toFixed(4)} {getCoinSymbol(coinTypeId)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Platform Fee ({PLATFORM_FEE_BPS / 100}%):</span>
                            <span className="font-mono text-destructive">
                              -{rewardCalculations.fee.toFixed(4)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Net Reward Pool:</span>
                            <span className="font-mono font-medium text-green-600">
                              {rewardCalculations.netAmount.toFixed(4)}
                            </span>
                          </div>
                          {rewardCalculations.rewardPerCompleter > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Per completer:</span>
                              <span className="font-mono">
                                ~{rewardCalculations.rewardPerCompleter.toFixed(4)}
                              </span>
                            </div>
                          )}
                        </div>
                        {maxCompleters && (
                          <div className="pt-1.5 border-t border-accent/20 text-[10px] text-muted-foreground">
                            Max {maxCompleters} completers
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b">
                  <h4 className="font-medium">Basic Info</h4>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(1)}>
                    Edit
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Title:</span>
                    <p className="font-medium">{title}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Category:</span>
                    <p className="font-medium">{category || "None"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duration:</span>
                    <p className="font-medium">
                      {durationInput.mode === "fixed"
                        ? `${durationInput.fixedDuration === "1h" ? "1 Hour" : durationInput.fixedDuration === "24h" ? "24 Hours" : durationInput.fixedDuration === "3d" ? "3 Days" : "1 Week"}`
                        : `${new Date(durationInput.startDate).toLocaleString()} → ${new Date(durationInput.endDate).toLocaleString()}`}
                    </p>
                  </div>
                </div>
                {description && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Description:</span>
                    <p className="mt-1">{description}</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b">
                  <h4 className="font-medium">
                    Polls ({totalPollsCount})
                    {pendingNewPolls.length > 0 && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({selectedPollIds.length} existing + {pendingNewPolls.length} new)
                      </span>
                    )}
                  </h4>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)}>
                    Edit
                  </Button>
                </div>
                <div className="space-y-2">
                  {/* Existing polls */}
                  {selectedPolls.map((poll, index) => (
                    <div
                      key={poll.id}
                      className="flex items-center gap-2 text-sm p-2 bg-muted/30 rounded"
                    >
                      <span className="text-muted-foreground w-6">{index + 1}.</span>
                      <span className="flex-1 truncate">{poll.title}</span>
                      <Badge variant="secondary">{poll.totalVotes} votes</Badge>
                    </div>
                  ))}
                  {/* Pending new polls */}
                  {pendingNewPolls.map((poll, index) => (
                    <div
                      key={`pending-${index}`}
                      className="flex items-center gap-2 text-sm p-2 bg-primary/5 rounded border border-primary/20"
                    >
                      <span className="text-muted-foreground w-6">{selectedPollIds.length + index + 1}.</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">NEW</Badge>
                      <span className="flex-1 truncate">{poll.title}</span>
                      <span className="text-xs text-muted-foreground">{poll.options.length} options</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b">
                  <h4 className="font-medium">Rewards</h4>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(3)}>
                    Edit
                  </Button>
                </div>
                <div className="text-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Type:</span>
                    <Badge variant={rewardType === "shared_pool" ? "default" : "secondary"}>
                      {rewardType === "per_poll" ? "Per-Poll Rewards" : "Shared Pool"}
                    </Badge>
                  </div>
                  {rewardType === "shared_pool" && rewardCalculations.isValid && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Total Deposit:</span>{" "}
                        <span className="font-medium">
                          {rewardCalculations.grossAmount.toFixed(4)} {getCoinSymbol(coinTypeId)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Platform Fee ({PLATFORM_FEE_BPS / 100}%):</span>{" "}
                        <span className="font-medium text-destructive">
                          -{rewardCalculations.fee.toFixed(4)} {getCoinSymbol(coinTypeId)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Net Reward Pool:</span>{" "}
                        <span className="font-medium text-green-600">
                          {rewardCalculations.netAmount.toFixed(4)} {getCoinSymbol(coinTypeId)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Distribution:</span>{" "}
                        <span className="font-medium">
                          {rewardPerCompletion === "equal"
                            ? "Equal split among completers"
                            : `${fixedRewardAmount} ${getCoinSymbol(coinTypeId)} per completer`}
                        </span>
                      </div>
                      {maxCompleters && (
                        <div>
                          <span className="text-muted-foreground">Max Completers:</span>{" "}
                          <span className="font-medium">{maxCompleters}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={currentStep === 1 || isCreating}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {currentStep < 4 ? (
          <Button onClick={goNext} disabled={!canProceed()}>
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            disabled={isCreating || contractLoading}
            className="min-w-[150px]"
          >
            {isCreating || contractLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Create Questionnaire
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
