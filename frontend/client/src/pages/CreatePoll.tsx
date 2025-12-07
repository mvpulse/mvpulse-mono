import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, Sparkles, ArrowRight, ArrowLeft, Check, Loader2, Wallet, Coins, Info, Calculator, Bot } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useContract } from "@/hooks/useContract";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useNetwork } from "@/contexts/NetworkContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { REWARD_TYPE, PLATFORM_FEE_BPS, calculatePlatformFee, calculateNetAmount, COIN_TYPE } from "@/types/poll";
import { COIN_TYPES, getCoinSymbol, CoinTypeId } from "@/lib/tokens";
import { TransactionConfirmationDialog } from "@/components/TransactionConfirmationDialog";
import { showTransactionSuccessToast, showTransactionErrorToast } from "@/lib/transaction-feedback";

// Duration options in seconds
const DURATION_OPTIONS = {
  "1h": 3600,
  "24h": 86400,
  "3d": 259200,
  "1w": 604800,
};

// AI-generated poll type (matching AIChatAssistant)
interface AIGeneratedPoll {
  title: string;
  description: string;
  category: string;
  options: string[];
  duration: string;
  rewardType: number;
  selectedToken: number;
  totalFund: number;
  maxResponders: number;
  rewardPerVoter?: number;
}

export default function CreatePoll() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { isConnected, isPrivyWallet } = useWalletConnection();
  const { createPoll, loading } = useContract();
  const { config } = useNetwork();

  // Confirmation dialog state for Privy wallets
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // Form state
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [duration, setDuration] = useState<keyof typeof DURATION_OPTIONS>("24h");
  const [options, setOptions] = useState(["", ""]);
  const [fromAI, setFromAI] = useState(false);

  // Incentives state
  const [rewardType, setRewardType] = useState<number>(REWARD_TYPE.NONE);
  const [selectedToken, setSelectedToken] = useState<CoinTypeId>(COIN_TYPES.MOVE);
  // Fixed per vote mode
  const [rewardPerVoter, setRewardPerVoter] = useState("");
  const [targetResponders, setTargetResponders] = useState("");
  // Equal split mode
  const [totalFund, setTotalFund] = useState("");
  const [maxResponders, setMaxResponders] = useState("");

  // Load AI-generated poll from sessionStorage if coming from AI assistant
  useEffect(() => {
    if (searchString.includes("from=ai")) {
      const storedPoll = sessionStorage.getItem("ai-generated-poll");
      if (storedPoll) {
        try {
          const poll: AIGeneratedPoll = JSON.parse(storedPoll);
          setTitle(poll.title);
          setDescription(poll.description);
          setCategory(poll.category || "");
          setDuration(poll.duration as keyof typeof DURATION_OPTIONS);
          setOptions(poll.options.length >= 2 ? poll.options : ["", ""]);
          setRewardType(poll.rewardType);
          setSelectedToken(poll.selectedToken as CoinTypeId);
          setFromAI(true);

          if (poll.rewardType === REWARD_TYPE.FIXED_PER_VOTE) {
            setRewardPerVoter(poll.rewardPerVoter?.toString() || "");
            setTargetResponders(poll.maxResponders.toString());
          } else if (poll.rewardType === REWARD_TYPE.EQUAL_SPLIT) {
            setTotalFund(poll.totalFund.toString());
            setMaxResponders(poll.maxResponders.toString());
          }

          // Clear the stored poll after loading
          sessionStorage.removeItem("ai-generated-poll");

          toast.success("Poll loaded from AI assistant!", {
            description: "Review and customize before launching.",
          });
        } catch (e) {
          console.error("Failed to parse AI-generated poll:", e);
        }
      }
    }
  }, [searchString]);

  // Calculated values
  const calculations = useMemo(() => {
    const feePercent = PLATFORM_FEE_BPS / 100;

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

  const handleNext = () => setStep((prev) => Math.min(prev + 1, 3));
  const handleBack = () => setStep((prev) => Math.max(prev - 1, 1));

  const validateForm = (): boolean => {
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
    // Validate incentives
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
    return true;
  };

  // Execute the poll creation transaction
  const executeCreatePoll = async () => {
    setIsExecuting(true);

    try {
      const validOptions = options.filter((o) => o.trim());

      // For fixed mode: reward_per_vote > 0, max_voters = target
      // For equal split: reward_per_vote = 0, max_voters = max responders
      const rewardPerVoteOctas = rewardType === REWARD_TYPE.FIXED_PER_VOTE
        ? Math.floor(calculations.rewardPerVoter * 1e8)
        : 0;
      const maxVoters = calculations.maxVoters;
      const fundAmountOctas = Math.floor(calculations.grossAmount * 1e8);

      const result = await createPoll({
        title: title.trim(),
        description: description.trim(),
        options: validOptions,
        rewardPerVote: rewardPerVoteOctas,
        maxVoters,
        durationSecs: DURATION_OPTIONS[duration],
        fundAmount: fundAmountOctas,
        coinTypeId: selectedToken,
      });

      showTransactionSuccessToast(
        result.hash,
        "Poll Created!",
        "Your poll has been deployed to the Movement network.",
        config.explorerUrl,
        result.sponsored
      );

      // Navigate to dashboard after success
      setTimeout(() => setLocation("/dashboard"), 1500);
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

  const handleCreate = async () => {
    console.log("handleCreate called", { isConnected, contractAddress: config.contractAddress });

    if (!isConnected) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!config.contractAddress) {
      toast.error("Contract not available on this network");
      return;
    }

    if (!validateForm()) {
      console.log("Form validation failed");
      return;
    }

    console.log("Form validated, creating poll...");

    // If Privy wallet + has incentives, show confirmation dialog first
    if (isPrivyWallet && calculations.grossAmount > 0) {
      setShowConfirmation(true);
      return;
    }

    // Otherwise execute directly (native wallets show their own confirmation)
    await executeCreatePoll();
  };

  const steps = [
    { id: 1, title: "Basic Info" },
    { id: 2, title: "Voting Options" },
    { id: 3, title: "Incentives" },
  ];

  return (
    <div className="container max-w-3xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Create New Poll</h1>
          <p className="text-muted-foreground">
            {fromAI ? (
              <span className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                Generated by AI - Review and customize before launching
              </span>
            ) : (
              "Design your survey and set incentives."
            )}
          </p>
        </div>
        {!fromAI && (
          <Button variant="outline" className="gap-2 border-primary/50 text-primary hover:bg-primary/10">
            <Sparkles className="w-4 h-4" /> AI Assist
          </Button>
        )}
      </div>

      {/* Wallet Connection Warning */}
      {!isConnected && (
        <Card className="mb-6 border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-4">
            <Wallet className="w-5 h-5 text-yellow-500" />
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to create a poll.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Progress Stepper */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted -z-10" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary -z-10 transition-all duration-500"
            style={{ width: `${((step - 1) / 2) * 100}%` }}
          />

          {steps.map((s) => (
            <div key={s.id} className="flex flex-col items-center gap-2 bg-background px-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors duration-300 font-bold text-sm",
                  step >= s.id
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-muted border-muted-foreground/20 text-muted-foreground"
                )}
              >
                {step > s.id ? <Check className="w-4 h-4" /> : s.id}
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

      <div className="grid gap-6 min-h-[400px]">
        {/* Step 1: Basic Information */}
        {step === 1 && (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-right-8 duration-300">
            <CardHeader>
              <CardTitle>Step 1: Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  className="bg-muted/30 min-h-[100px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                <div className="space-y-2">
                  <Label>Duration *</Label>
                  <Select value={duration} onValueChange={(v) => setDuration(v as keyof typeof DURATION_OPTIONS)}>
                    <SelectTrigger className="bg-muted/30">
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">1 Hour</SelectItem>
                      <SelectItem value="24h">24 Hours</SelectItem>
                      <SelectItem value="3d">3 Days</SelectItem>
                      <SelectItem value="1w">1 Week</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Voting Options */}
        {step === 2 && (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-right-8 duration-300">
            <CardHeader>
              <CardTitle>Step 2: Voting Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" onClick={addOption} className="w-full border-dashed">
                <Plus className="w-4 h-4 mr-2" /> Add Option
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Incentives */}
        {step === 3 && (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-right-8 duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="w-5 h-5" />
                Step 3: Incentives (Optional)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Info Banner */}
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Fund your poll to incentivize participation. A {PLATFORM_FEE_BPS / 100}% platform fee applies.
                  Distribution method is chosen when you close the poll.
                </p>
              </div>

              {/* Token Selection */}
              <div className="space-y-3">
                <Label>Funding Token</Label>
                <RadioGroup
                  value={selectedToken.toString()}
                  onValueChange={(v) => setSelectedToken(parseInt(v) as CoinTypeId)}
                  className="grid grid-cols-2 gap-3"
                >
                  <div
                    className={cn(
                      "flex items-center space-x-3 rounded-md border p-3 cursor-pointer transition-all",
                      selectedToken === COIN_TYPES.MOVE
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedToken(COIN_TYPES.MOVE)}
                  >
                    <RadioGroupItem value={COIN_TYPES.MOVE.toString()} id="token-move" />
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-blue-500">M</span>
                      </div>
                      <Label htmlFor="token-move" className="cursor-pointer font-medium">MOVE</Label>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex items-center space-x-3 rounded-md border p-3 cursor-pointer transition-all",
                      selectedToken === COIN_TYPES.PULSE
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedToken(COIN_TYPES.PULSE)}
                  >
                    <RadioGroupItem value={COIN_TYPES.PULSE.toString()} id="token-pulse" />
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-purple-500">P</span>
                      </div>
                      <Label htmlFor="token-pulse" className="cursor-pointer font-medium">PULSE</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {/* Reward Type Selection */}
              <div className="space-y-3">
                <Label>Reward Type</Label>
                <RadioGroup
                  value={rewardType.toString()}
                  onValueChange={(v) => setRewardType(parseInt(v))}
                  className="grid grid-cols-1 md:grid-cols-3 gap-3"
                >
                  {/* No Rewards */}
                  <div
                    className={cn(
                      "flex items-center space-x-3 rounded-md border p-3 cursor-pointer transition-all",
                      rewardType === REWARD_TYPE.NONE
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                    onClick={() => setRewardType(REWARD_TYPE.NONE)}
                  >
                    <RadioGroupItem value={REWARD_TYPE.NONE.toString()} id="no-reward" />
                    <Label htmlFor="no-reward" className="cursor-pointer text-sm">No Rewards</Label>
                  </div>

                  {/* Fixed Per Vote */}
                  <div
                    className={cn(
                      "flex items-center space-x-3 rounded-md border p-3 cursor-pointer transition-all",
                      rewardType === REWARD_TYPE.FIXED_PER_VOTE
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                    onClick={() => setRewardType(REWARD_TYPE.FIXED_PER_VOTE)}
                  >
                    <RadioGroupItem value={REWARD_TYPE.FIXED_PER_VOTE.toString()} id="fixed" />
                    <Label htmlFor="fixed" className="cursor-pointer text-sm">Fixed Per Vote</Label>
                  </div>

                  {/* Equal Split */}
                  <div
                    className={cn(
                      "flex items-center space-x-3 rounded-md border p-3 cursor-pointer transition-all",
                      rewardType === REWARD_TYPE.EQUAL_SPLIT
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                    onClick={() => setRewardType(REWARD_TYPE.EQUAL_SPLIT)}
                  >
                    <RadioGroupItem value={REWARD_TYPE.EQUAL_SPLIT.toString()} id="equal" />
                    <Label htmlFor="equal" className="cursor-pointer text-sm">Equal Split</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Fixed Per Vote Inputs */}
              {rewardType === REWARD_TYPE.FIXED_PER_VOTE && (
                <div className="space-y-4 p-4 rounded-lg border border-border/50 bg-background">
                  <p className="text-sm text-muted-foreground">
                    Each respondent gets a fixed reward. Total fund is auto-calculated.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Reward per voter ({getCoinSymbol(selectedToken)})</Label>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0.1"
                        value={rewardPerVoter}
                        onChange={(e) => setRewardPerVoter(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Target responders</Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="100"
                        value={targetResponders}
                        onChange={(e) => setTargetResponders(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Equal Split Inputs */}
              {rewardType === REWARD_TYPE.EQUAL_SPLIT && (
                <div className="space-y-4 p-4 rounded-lg border border-border/50 bg-background">
                  <p className="text-sm text-muted-foreground">
                    Total fund is split equally among all voters. Reward per voter is auto-calculated.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Total fund ({getCoinSymbol(selectedToken)})</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="10"
                        value={totalFund}
                        onChange={(e) => setTotalFund(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max responders</Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="100"
                        value={maxResponders}
                        onChange={(e) => setMaxResponders(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Calculation Summary */}
              {rewardType !== REWARD_TYPE.NONE && calculations.isValid && (
                <div className="p-4 rounded-lg bg-accent/10 border border-accent/20 space-y-2">
                  <div className="flex items-center gap-2 text-accent font-medium">
                    <Calculator className="w-4 h-4" />
                    Summary
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Deposit:</span>
                      <span className="font-mono font-medium">{calculations.grossAmount.toFixed(4)} {getCoinSymbol(selectedToken)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Platform Fee ({PLATFORM_FEE_BPS / 100}%):</span>
                      <span className="font-mono text-destructive">-{calculations.fee.toFixed(4)} {getCoinSymbol(selectedToken)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Net Reward Pool:</span>
                      <span className="font-mono font-medium text-green-600">{calculations.netAmount.toFixed(4)} {getCoinSymbol(selectedToken)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Per voter:</span>
                      <span className="font-mono font-medium">~{calculations.rewardPerVoter.toFixed(4)} {getCoinSymbol(selectedToken)}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-accent/20 text-xs text-muted-foreground">
                    Max {calculations.maxVoters} voters can participate
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={step === 1 || loading}
            className={cn(step === 1 && "invisible")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>

          {step < 3 ? (
            <Button onClick={handleNext} className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
              Next Step <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={!isConnected || loading || isExecuting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8"
            >
              {loading || isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...
                </>
              ) : (
                <>
                  Launch Poll <Sparkles className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Privy Wallet Confirmation Dialog */}
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
    </div>
  );
}
