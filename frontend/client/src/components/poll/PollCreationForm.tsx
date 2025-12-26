/**
 * PollCreationForm - Reusable poll creation form component
 *
 * Supports two modes:
 * - standalone: Executes createPoll transaction directly
 * - embedded: Returns poll data via callback for batch creation
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DurationInput } from "@/components/ui/duration-input";
import { Plus, Trash2, Sparkles, ArrowRight, ArrowLeft, Check, Loader2, Coins, Info, Calculator } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useContract } from "@/hooks/useContract";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useNetwork } from "@/contexts/NetworkContext";
import { useDurationInput, DURATION_OPTIONS, type DurationKey } from "@/hooks/useDurationInput";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { REWARD_TYPE, PLATFORM_FEE_BPS, calculatePlatformFee, calculateNetAmount } from "@/types/poll";
import { COIN_TYPES, getCoinSymbol, CoinTypeId } from "@/lib/tokens";
import { TransactionConfirmationDialog } from "@/components/TransactionConfirmationDialog";
import { showTransactionSuccessToast, showTransactionErrorToast } from "@/lib/transaction-feedback";

// Re-export duration types for backwards compatibility
export { DURATION_OPTIONS };
export type { DurationKey };

// Poll form data (used for embedded mode callback)
export interface PollFormData {
  title: string;
  description: string;
  category: string;
  duration: DurationKey;
  durationSecs: number; // actual duration in seconds
  options: string[];
  rewardType: number;
  selectedToken: CoinTypeId;
  rewardPerVote: number; // in octas
  maxVoters: number;
  fundAmount: number; // in octas (gross amount including fee)
}

// Initial form values (optional, for pre-populating)
export interface PollFormInitialValues {
  title?: string;
  description?: string;
  category?: string;
  duration?: DurationKey;
  options?: string[];
  rewardType?: number;
  selectedToken?: CoinTypeId;
  rewardPerVoter?: number; // in tokens (not octas)
  targetResponders?: number;
  totalFund?: number; // in tokens (not octas)
  maxResponders?: number;
}

export interface PollCreationFormProps {
  /** Form mode - standalone executes transaction, embedded returns data via callback */
  mode: 'standalone' | 'embedded';
  /** Whether to show the incentives step. Default: true for standalone, false for embedded */
  showIncentives?: boolean;
  /** Use compact layout for modal/inline usage */
  compact?: boolean;
  /** Initial form values */
  initialValues?: PollFormInitialValues;
  /** Callback when form is submitted in embedded mode */
  onSubmit?: (data: PollFormData) => void;
  /** Callback when poll is created in standalone mode (hash is transaction hash) */
  onPollCreated?: (hash: string) => void;
  /** Callback when cancel is clicked */
  onCancel?: () => void;
  /** Whether the form is currently submitting (for embedded mode) */
  isSubmitting?: boolean;
  /** Custom submit button text */
  submitButtonText?: string;
  /** Inherited category from parent questionnaire (hides category field) */
  inheritedCategory?: string;
  /** Inherited duration in seconds from parent questionnaire (hides duration field) */
  inheritedDurationSecs?: number;
}

export function PollCreationForm({
  mode,
  showIncentives: showIncentivesProp,
  compact = false,
  initialValues,
  onSubmit,
  onPollCreated,
  onCancel,
  isSubmitting = false,
  submitButtonText,
  inheritedCategory,
  inheritedDurationSecs,
}: PollCreationFormProps) {
  const { isConnected, isPrivyWallet } = useWalletConnection();
  const { createPoll, loading } = useContract();
  const { config } = useNetwork();

  // Determine if incentives should be shown
  const showIncentives = showIncentivesProp ?? (mode === 'standalone');

  // Calculate total steps based on whether incentives are shown
  const totalSteps = showIncentives ? 3 : 2;

  // Confirmation dialog state for Privy wallets
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // Check if we have inherited values (embedded in questionnaire)
  const hasInheritedCategory = inheritedCategory !== undefined;
  const hasInheritedDuration = inheritedDurationSecs !== undefined;

  // Form state
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState(initialValues?.title || "");
  const [description, setDescription] = useState(initialValues?.description || "");
  const [category, setCategory] = useState(inheritedCategory || initialValues?.category || "");

  // Duration state with unified input hook
  const durationInput = useDurationInput("fixed");
  const [options, setOptions] = useState<string[]>(
    initialValues?.options?.length ? initialValues.options : ["", ""]
  );

  // Compute effective duration (inherited or from input)
  const effectiveDurationSecs = hasInheritedDuration
    ? inheritedDurationSecs
    : durationInput.durationSecs;

  // Incentives state
  const [rewardType, setRewardType] = useState<number>(initialValues?.rewardType ?? REWARD_TYPE.NONE);
  const [selectedToken, setSelectedToken] = useState<CoinTypeId>(initialValues?.selectedToken ?? COIN_TYPES.PULSE);
  // Fixed per vote mode
  const [rewardPerVoter, setRewardPerVoter] = useState(initialValues?.rewardPerVoter?.toString() || "");
  const [targetResponders, setTargetResponders] = useState(initialValues?.targetResponders?.toString() || "");
  // Equal split mode
  const [totalFund, setTotalFund] = useState(initialValues?.totalFund?.toString() || "");
  const [maxResponders, setMaxResponders] = useState(initialValues?.maxResponders?.toString() || "");

  // Calculated values
  const calculations = useMemo(() => {
    if (rewardType === REWARD_TYPE.FIXED_PER_VOTE) {
      const reward = parseFloat(rewardPerVoter) || 0;
      const target = parseInt(targetResponders) || 0;
      const netAmount = reward * target;
      const grossAmount = netAmount > 0 ? Math.ceil((netAmount * 10000) / (10000 - PLATFORM_FEE_BPS) * 1e8) / 1e8 : 0;
      const fee = grossAmount - netAmount;

      return {
        grossAmount,
        fee,
        netAmount,
        rewardPerVoter: reward,
        maxVoters: target,
        isValid: reward > 0 && target > 0,
      };
    } else if (rewardType === REWARD_TYPE.EQUAL_SPLIT) {
      const gross = parseFloat(totalFund) || 0;
      const max = parseInt(maxResponders) || 0;
      const fee = calculatePlatformFee(gross * 1e8) / 1e8;
      const net = calculateNetAmount(gross * 1e8) / 1e8;
      const perVoter = max > 0 ? net / max : 0;

      return {
        grossAmount: gross,
        fee,
        netAmount: net,
        rewardPerVoter: perVoter,
        maxVoters: max,
        isValid: gross > 0 && max > 0,
      };
    }

    return {
      grossAmount: 0,
      fee: 0,
      netAmount: 0,
      rewardPerVoter: 0,
      maxVoters: 0,
      isValid: true, // No incentives is valid
    };
  }, [rewardType, rewardPerVoter, targetResponders, totalFund, maxResponders]);

  const addOption = () => setOptions([...options, ""]);
  const removeOption = (index: number) => setOptions(options.filter((_, i) => i !== index));
  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleNext = () => setStep((prev) => Math.min(prev + 1, totalSteps));
  const handleBack = () => setStep((prev) => Math.max(prev - 1, 1));

  const validateForm = useCallback((): boolean => {
    if (!title.trim()) {
      toast.error("Title is required");
      setStep(1);
      return false;
    }
    if (!description.trim()) {
      toast.error("Description is required");
      setStep(1);
      return false;
    }
    const validOptions = options.filter((o) => o.trim());
    if (validOptions.length < 2) {
      toast.error("At least 2 options are required");
      setStep(2);
      return false;
    }
    // Validate incentives only if shown
    if (showIncentives) {
      if (rewardType === REWARD_TYPE.FIXED_PER_VOTE && !calculations.isValid) {
        toast.error("Please specify reward per voter and target responders");
        setStep(3);
        return false;
      }
      if (rewardType === REWARD_TYPE.EQUAL_SPLIT && !calculations.isValid) {
        toast.error("Please specify total fund and max responders");
        setStep(3);
        return false;
      }
    }
    return true;
  }, [title, description, options, showIncentives, rewardType, calculations.isValid]);

  // Get form data for embedded mode
  const getFormData = useCallback((): PollFormData => {
    const validOptions = options.filter((o) => o.trim());

    // For fixed mode: reward_per_vote > 0, max_voters = target
    // For equal split: reward_per_vote = 0, max_voters = max responders
    const rewardPerVoteOctas = rewardType === REWARD_TYPE.FIXED_PER_VOTE
      ? Math.floor(calculations.rewardPerVoter * 1e8)
      : 0;
    const maxVoters = calculations.maxVoters;
    const fundAmountOctas = Math.floor(calculations.grossAmount * 1e8);

    return {
      title: title.trim(),
      description: description.trim(),
      category: hasInheritedCategory ? inheritedCategory : category,
      duration: durationInput.fixedDuration,
      durationSecs: effectiveDurationSecs,
      options: validOptions,
      rewardType,
      selectedToken,
      rewardPerVote: rewardPerVoteOctas,
      maxVoters,
      fundAmount: fundAmountOctas,
    };
  }, [title, description, category, durationInput.fixedDuration, effectiveDurationSecs, options, rewardType, selectedToken, calculations, hasInheritedCategory, inheritedCategory]);

  // Execute the poll creation transaction (standalone mode)
  const executeCreatePoll = async () => {
    setIsExecuting(true);

    try {
      const formData = getFormData();

      const result = await createPoll({
        title: formData.title,
        description: formData.description,
        options: formData.options,
        rewardPerVote: formData.rewardPerVote,
        maxVoters: formData.maxVoters,
        durationSecs: effectiveDurationSecs,
        fundAmount: formData.fundAmount,
        coinTypeId: formData.selectedToken,
      });

      showTransactionSuccessToast(
        result.hash,
        "Poll Created!",
        "Your poll has been deployed to the Movement network.",
        config.explorerUrl,
        result.sponsored
      );

      // Call the callback if provided
      if (onPollCreated) {
        onPollCreated(result.hash);
      }
    } catch (error) {
      console.error("Failed to create poll:", error);
      showTransactionErrorToast(
        "Failed to create poll",
        error instanceof Error ? error : "Transaction failed"
      );
    } finally {
      setIsExecuting(false);
      setShowConfirmation(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    if (mode === 'embedded') {
      // In embedded mode, just return the form data
      if (onSubmit) {
        onSubmit(getFormData());
      }
      return;
    }

    // Standalone mode - execute transaction
    if (!isConnected) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!config.contractAddress) {
      toast.error("Contract not available on this network");
      return;
    }

    // If Privy wallet + has incentives, show confirmation dialog first
    if (isPrivyWallet && calculations.grossAmount > 0) {
      setShowConfirmation(true);
      return;
    }

    // Otherwise execute directly (native wallets show their own confirmation)
    await executeCreatePoll();
  };

  const steps = showIncentives
    ? [
        { id: 1, title: "Basic Info" },
        { id: 2, title: "Options" },
        { id: 3, title: "Incentives" },
      ]
    : [
        { id: 1, title: "Basic Info" },
        { id: 2, title: "Options" },
      ];

  const isLoading = loading || isExecuting || isSubmitting;
  const isOnLastStep = step === totalSteps;

  // Determine submit button text
  const getSubmitButtonText = () => {
    if (submitButtonText) return submitButtonText;
    if (mode === 'embedded') return "Add Poll";
    return "Launch Poll";
  };

  return (
    <div className={cn("animate-in fade-in duration-300", compact ? "space-y-4" : "space-y-6")}>
      {/* Progress Stepper */}
      <div className={cn(compact ? "mb-4" : "mb-6")}>
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted -z-10" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary -z-10 transition-all duration-500"
            style={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }}
          />

          {steps.map((s) => (
            <div key={s.id} className="flex flex-col items-center gap-1 bg-background px-2">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors duration-300 font-bold text-xs",
                  step >= s.id
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-muted border-muted-foreground/20 text-muted-foreground"
                )}
              >
                {step > s.id ? <Check className="w-3 h-3" /> : s.id}
              </div>
              <span
                className={cn(
                  "text-xs font-medium transition-colors duration-300",
                  step >= s.id ? "text-primary" : "text-muted-foreground"
                )}
              >
                {s.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Basic Information */}
      {step === 1 && (
        <Card className={cn(
          "border-border/50 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-right-8 duration-300",
          compact && "shadow-none border-0 bg-transparent p-0"
        )}>
          {!compact && (
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Step 1: Basic Information</CardTitle>
            </CardHeader>
          )}
          <CardContent className={cn("space-y-4", compact && "p-0")}>
            <div className="space-y-2">
              <Label htmlFor="title">Poll Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Ecosystem Grant Proposal #12"
                className="bg-muted/30"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe what this poll is about..."
                className={cn("bg-muted/30", compact ? "min-h-[80px]" : "min-h-[100px]")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {/* Category - hidden when inherited from questionnaire */}
            {!hasInheritedCategory && (
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-muted/30">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="governance">Governance</SelectItem>
                    <SelectItem value="product">Product Research</SelectItem>
                    <SelectItem value="community">Community</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Duration - hidden when inherited from questionnaire */}
            {!hasInheritedDuration && (
              <DurationInput
                mode={durationInput.mode}
                onModeChange={durationInput.setMode}
                fixedDuration={durationInput.fixedDuration}
                onFixedDurationChange={durationInput.setFixedDuration}
                startDate={durationInput.startDate}
                endDate={durationInput.endDate}
                onStartDateChange={durationInput.setStartDate}
                onEndDateChange={durationInput.setEndDate}
                compact={compact}
                label="Duration *"
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Voting Options */}
      {step === 2 && (
        <Card className={cn(
          "border-border/50 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-right-8 duration-300",
          compact && "shadow-none border-0 bg-transparent p-0"
        )}>
          {!compact && (
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Step 2: Voting Options</CardTitle>
            </CardHeader>
          )}
          <CardContent className={cn("space-y-3", compact && "p-0")}>
            {options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder={`Option ${index + 1}`}
                  className="bg-muted/30"
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                />
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(index)}
                    className="text-destructive hover:bg-destructive/10 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" onClick={addOption} className="w-full border-dashed" size={compact ? "sm" : "default"}>
              <Plus className="w-4 h-4 mr-2" /> Add Option
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Incentives (optional) */}
      {step === 3 && showIncentives && (
        <Card className={cn(
          "border-border/50 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-right-8 duration-300",
          compact && "shadow-none border-0 bg-transparent p-0"
        )}>
          {!compact && (
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Coins className="w-4 h-4" />
                Step 3: Incentives (Optional)
              </CardTitle>
            </CardHeader>
          )}
          <CardContent className={cn("space-y-4", compact && "p-0")}>
            {/* Info Banner */}
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50 flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                Fund your poll to incentivize participation. A {PLATFORM_FEE_BPS / 100}% platform fee applies.
              </p>
            </div>

            {/* Token Selection */}
            <div className="space-y-2">
              <Label className="text-sm">Funding Token</Label>
              <RadioGroup
                value={selectedToken.toString()}
                onValueChange={(v) => setSelectedToken(parseInt(v) as CoinTypeId)}
                className="grid grid-cols-2 gap-2"
              >
                <div
                  className={cn(
                    "flex items-center space-x-2 rounded-md border p-2.5 cursor-pointer transition-all",
                    selectedToken === COIN_TYPES.PULSE
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => setSelectedToken(COIN_TYPES.PULSE)}
                >
                  <RadioGroupItem value={COIN_TYPES.PULSE.toString()} id="token-pulse-form" />
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-purple-500">P</span>
                    </div>
                    <Label htmlFor="token-pulse-form" className="cursor-pointer text-sm font-medium">PULSE</Label>
                  </div>
                </div>
                <div
                  className={cn(
                    "flex items-center space-x-2 rounded-md border p-2.5 cursor-pointer transition-all",
                    selectedToken === COIN_TYPES.USDC
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => setSelectedToken(COIN_TYPES.USDC)}
                >
                  <RadioGroupItem value={COIN_TYPES.USDC.toString()} id="token-usdc-form" />
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-green-500">$</span>
                    </div>
                    <Label htmlFor="token-usdc-form" className="cursor-pointer text-sm font-medium">USDC</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Reward Type Selection */}
            <div className="space-y-2">
              <Label className="text-sm">Reward Type</Label>
              <RadioGroup
                value={rewardType.toString()}
                onValueChange={(v) => setRewardType(parseInt(v))}
                className="grid grid-cols-3 gap-2"
              >
                <div
                  className={cn(
                    "flex items-center space-x-2 rounded-md border p-2 cursor-pointer transition-all",
                    rewardType === REWARD_TYPE.NONE
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => setRewardType(REWARD_TYPE.NONE)}
                >
                  <RadioGroupItem value={REWARD_TYPE.NONE.toString()} id="no-reward-form" />
                  <Label htmlFor="no-reward-form" className="cursor-pointer text-xs">None</Label>
                </div>

                <div
                  className={cn(
                    "flex items-center space-x-2 rounded-md border p-2 cursor-pointer transition-all",
                    rewardType === REWARD_TYPE.FIXED_PER_VOTE
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => setRewardType(REWARD_TYPE.FIXED_PER_VOTE)}
                >
                  <RadioGroupItem value={REWARD_TYPE.FIXED_PER_VOTE.toString()} id="fixed-form" />
                  <Label htmlFor="fixed-form" className="cursor-pointer text-xs">Fixed</Label>
                </div>

                <div
                  className={cn(
                    "flex items-center space-x-2 rounded-md border p-2 cursor-pointer transition-all",
                    rewardType === REWARD_TYPE.EQUAL_SPLIT
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => setRewardType(REWARD_TYPE.EQUAL_SPLIT)}
                >
                  <RadioGroupItem value={REWARD_TYPE.EQUAL_SPLIT.toString()} id="equal-form" />
                  <Label htmlFor="equal-form" className="cursor-pointer text-xs">Split</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Fixed Per Vote Inputs */}
            {rewardType === REWARD_TYPE.FIXED_PER_VOTE && (
              <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-background">
                <p className="text-xs text-muted-foreground">
                  Each respondent gets a fixed reward.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Reward per voter ({getCoinSymbol(selectedToken)})</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.1"
                      value={rewardPerVoter}
                      onChange={(e) => setRewardPerVoter(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Target responders</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="100"
                      value={targetResponders}
                      onChange={(e) => setTargetResponders(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Equal Split Inputs */}
            {rewardType === REWARD_TYPE.EQUAL_SPLIT && (
              <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-background">
                <p className="text-xs text-muted-foreground">
                  Total fund is split equally among all voters.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Total fund ({getCoinSymbol(selectedToken)})</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="10"
                      value={totalFund}
                      onChange={(e) => setTotalFund(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max responders</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="100"
                      value={maxResponders}
                      onChange={(e) => setMaxResponders(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Calculation Summary */}
            {rewardType !== REWARD_TYPE.NONE && calculations.isValid && (
              <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 space-y-2">
                <div className="flex items-center gap-2 text-accent font-medium text-sm">
                  <Calculator className="w-3 h-3" />
                  Summary
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Deposit:</span>
                    <span className="font-mono font-medium">{calculations.grossAmount.toFixed(4)} {getCoinSymbol(selectedToken)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform Fee:</span>
                    <span className="font-mono text-destructive">-{calculations.fee.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Net Pool:</span>
                    <span className="font-mono font-medium text-green-600">{calculations.netAmount.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Per voter:</span>
                    <span className="font-mono">~{calculations.rewardPerVoter.toFixed(4)}</span>
                  </div>
                </div>
                <div className="pt-1.5 border-t border-accent/20 text-[10px] text-muted-foreground">
                  Max {calculations.maxVoters} voters
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-2">
        {step === 1 ? (
          onCancel ? (
            <Button variant="ghost" onClick={onCancel} size={compact ? "sm" : "default"}>
              Cancel
            </Button>
          ) : (
            <div />
          )
        ) : (
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={isLoading}
            size={compact ? "sm" : "default"}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        )}

        {!isOnLastStep ? (
          <Button
            onClick={handleNext}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            size={compact ? "sm" : "default"}
          >
            Next <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={(mode === 'standalone' && !isConnected) || isLoading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            size={compact ? "sm" : "default"}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {mode === 'embedded' ? "Adding..." : "Creating..."}
              </>
            ) : (
              <>
                {getSubmitButtonText()} <Sparkles className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        )}
      </div>

      {/* Privy Wallet Confirmation Dialog (only for standalone mode) */}
      {mode === 'standalone' && (
        <TransactionConfirmationDialog
          open={showConfirmation}
          onOpenChange={setShowConfirmation}
          onConfirm={executeCreatePoll}
          onCancel={() => setShowConfirmation(false)}
          isLoading={isExecuting}
          title="Confirm Poll Creation"
          description="Create poll with voter incentives"
          amount={calculations.grossAmount}
          tokenSymbol={getCoinSymbol(selectedToken)}
          details={[
            { label: "Reward Pool", value: `${calculations.netAmount.toFixed(4)} ${getCoinSymbol(selectedToken)}` },
            { label: "Platform Fee", value: `${calculations.fee.toFixed(4)} ${getCoinSymbol(selectedToken)}` },
            { label: "Max Voters", value: calculations.maxVoters.toString() },
          ]}
        />
      )}
    </div>
  );
}

export default PollCreationForm;
