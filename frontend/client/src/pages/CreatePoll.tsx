import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, Sparkles, ArrowRight, ArrowLeft, Check, Loader2, Wallet } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useContract } from "@/hooks/useContract";
import { useNetwork } from "@/contexts/NetworkContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Duration options in seconds
const DURATION_OPTIONS = {
  "1h": 3600,
  "24h": 86400,
  "3d": 259200,
  "1w": 604800,
};

export default function CreatePoll() {
  const [, setLocation] = useLocation();
  const { connected } = useWallet();
  const { createPoll, loading } = useContract();
  const { config } = useNetwork();

  // Form state
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [duration, setDuration] = useState<keyof typeof DURATION_OPTIONS>("24h");
  const [options, setOptions] = useState(["", ""]);
  const [distribution, setDistribution] = useState("equal");
  const [rewardAmount, setRewardAmount] = useState("");

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
    return true;
  };

  const handleCreate = async () => {
    if (!connected) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!config.contractAddress) {
      toast.error("Contract not available on this network");
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      const validOptions = options.filter((o) => o.trim());
      const rewardPerVote = rewardAmount ? Math.floor(parseFloat(rewardAmount) * 1e8) : 0; // Convert to octas

      const result = await createPoll({
        title: title.trim(),
        description: description.trim(),
        options: validOptions,
        rewardPerVote,
        durationSecs: DURATION_OPTIONS[duration],
      });

      toast.success("Poll Created!", {
        description: "Your poll has been deployed to the Movement network.",
        action: {
          label: "View TX",
          onClick: () => window.open(`${config.explorerUrl}/txn/${result.hash}?network=testnet`, "_blank"),
        },
      });

      // Navigate to dashboard after success
      setTimeout(() => setLocation("/dashboard"), 1500);
    } catch (error) {
      console.error("Failed to create poll:", error);
      toast.error("Failed to create poll", {
        description: error instanceof Error ? error.message : "Transaction failed",
      });
    }
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
          <p className="text-muted-foreground">Design your survey and set incentives.</p>
        </div>
        <Button variant="outline" className="gap-2 border-primary/50 text-primary hover:bg-primary/10">
          <Sparkles className="w-4 h-4" /> AI Assist
        </Button>
      </div>

      {/* Wallet Connection Warning */}
      {!connected && (
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
              <CardTitle>Step 3: Incentives (Optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Token Type</Label>
                  <Select defaultValue="move">
                    <SelectTrigger className="bg-muted/30">
                      <SelectValue placeholder="Select token" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="move">MOVE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reward Per Vote (MOVE)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    className="bg-muted/30"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Distribution Method</Label>
                <RadioGroup
                  defaultValue="equal"
                  onValueChange={setDistribution}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <div
                    className={cn(
                      "flex items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm cursor-pointer transition-all",
                      distribution === "equal" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    )}
                  >
                    <RadioGroupItem value="equal" id="equal" className="mt-1" />
                    <div className="space-y-1">
                      <Label htmlFor="equal" className="font-medium cursor-pointer">
                        Equal Split
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Total fund is divided equally among all participants when the poll closes.
                      </p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm cursor-pointer transition-all",
                      distribution === "fixed" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    )}
                  >
                    <RadioGroupItem value="fixed" id="fixed" className="mt-1" />
                    <div className="space-y-1">
                      <Label htmlFor="fixed" className="font-medium cursor-pointer">
                        Fixed Amount
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Each participant receives a fixed amount until the fund runs out.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
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
              disabled={!connected || loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8"
            >
              {loading ? (
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
    </div>
  );
}
