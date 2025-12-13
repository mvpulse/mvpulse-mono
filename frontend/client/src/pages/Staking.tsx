import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Wallet as WalletIcon,
  RefreshCcw,
  AlertTriangle,
  Loader2,
  Lock,
  Unlock,
  Clock,
  TrendingUp,
  ArrowUpRight,
  Coins,
  Shield,
  Users,
  ChevronRight,
} from "lucide-react";
import { TierRequirementsPopover } from "@/components/TierRequirementsPopover";
import { toast } from "sonner";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useNetwork } from "@/contexts/NetworkContext";
import { useStaking, LOCK_PERIODS, type StakePosition } from "@/hooks/useStaking";
import { getAllBalances, type AllBalances } from "@/lib/balance";
import { COIN_TYPES, getCoinDecimals } from "@/lib/tokens";
import { WalletSelectionModal } from "@/components/WalletSelectionModal";
import { TIER_NAMES, TIER_PULSE_THRESHOLDS, TIERS } from "@shared/schema";
import { useUserProfile } from "@/hooks/useUserProfile";

export default function StakingPage() {
  const { isConnected, address } = useWalletConnection();
  const { network, config } = useNetwork();
  const { profile, tier, stakedPulse, syncTier, isSyncingTier } = useUserProfile(address || undefined);

  const {
    isConfigured,
    totalStaked,
    positions,
    unlockableAmount,
    lockedAmount,
    poolTotalStaked,
    stakersCount,
    isLoading,
    isStaking,
    isUnstaking,
    stake,
    unstake,
    unstakeAll,
    refetch,
  } = useStaking();

  const [balances, setBalances] = useState<AllBalances | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Staking form state
  const [stakeAmount, setStakeAmount] = useState("");
  const [selectedLockPeriod, setSelectedLockPeriod] = useState(LOCK_PERIODS[0].seconds.toString());

  // Fetch balances
  const fetchBalance = useCallback(async () => {
    if (!address) return;

    setIsLoadingBalance(true);
    try {
      const balanceData = await getAllBalances(address, config.rpcUrl, network, config.fullnodeUrl);
      setBalances(balanceData);
    } catch (error) {
      console.error("Failed to fetch balances:", error);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [address, config.rpcUrl, config.fullnodeUrl, network]);

  useEffect(() => {
    if (address) {
      fetchBalance();
    }
  }, [address, fetchBalance]);

  // Get PULSE balance
  const pulseBalance = balances?.[COIN_TYPES.PULSE]?.balance ?? 0;
  const pulseBalanceFormatted = balances?.[COIN_TYPES.PULSE]?.balanceFormatted ?? "0.0000";

  // Calculate tier with potential new stake
  const calculatePotentialTier = (additionalStake: number) => {
    const currentTotalPulse = pulseBalance + totalStaked;
    const newTotalPulse = currentTotalPulse + additionalStake;

    if (newTotalPulse >= TIER_PULSE_THRESHOLDS[TIERS.PLATINUM]) return TIERS.PLATINUM;
    if (newTotalPulse >= TIER_PULSE_THRESHOLDS[TIERS.GOLD]) return TIERS.GOLD;
    if (newTotalPulse >= TIER_PULSE_THRESHOLDS[TIERS.SILVER]) return TIERS.SILVER;
    return TIERS.BRONZE;
  };

  // Handle stake
  const handleStake = async () => {
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const amount = parseFloat(stakeAmount);
    const amountInOctas = Math.floor(amount * 1e8);

    if (amountInOctas > pulseBalance) {
      toast.error("Insufficient PULSE balance");
      return;
    }

    try {
      const result = await stake({
        amount: amountInOctas,
        lockPeriod: parseInt(selectedLockPeriod),
      });

      toast.success("Staked successfully!", {
        description: `${amount.toFixed(2)} PULSE locked for ${LOCK_PERIODS.find(p => p.seconds.toString() === selectedLockPeriod)?.label}`,
        action: {
          label: "View",
          onClick: () => window.open(`${config.explorerUrl}/txn/${result.hash}?network=${network}`, "_blank"),
        },
      });

      // Clear form and refresh
      setStakeAmount("");
      setTimeout(() => {
        fetchBalance();
        refetch();
        // Sync tier with updated staked amount
        if (address) {
          const newStaked = (totalStaked + amountInOctas).toString();
          syncTier({ pulseBalance: (pulseBalance - amountInOctas).toString(), stakedAmount: newStaked });
        }
      }, 2000);
    } catch (error) {
      console.error("Stake failed:", error);
      toast.error("Failed to stake PULSE", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Handle unstake
  const handleUnstake = async (positionIndex: number) => {
    try {
      const position = positions[positionIndex];
      const result = await unstake({ positionIndex });

      toast.success("Unstaked successfully!", {
        description: `${(position.amount / 1e8).toFixed(2)} PULSE returned to your wallet`,
        action: {
          label: "View",
          onClick: () => window.open(`${config.explorerUrl}/txn/${result.hash}?network=${network}`, "_blank"),
        },
      });

      setTimeout(() => {
        fetchBalance();
        refetch();
        // Sync tier with updated balances
        if (address) {
          const newStaked = Math.max(0, totalStaked - position.amount).toString();
          syncTier({ pulseBalance: (pulseBalance + position.amount).toString(), stakedAmount: newStaked });
        }
      }, 2000);
    } catch (error) {
      console.error("Unstake failed:", error);
      toast.error("Failed to unstake PULSE", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Handle unstake all
  const handleUnstakeAll = async () => {
    try {
      const result = await unstakeAll();

      toast.success("Unstaked all unlocked positions!", {
        description: `${(unlockableAmount / 1e8).toFixed(2)} PULSE returned to your wallet`,
        action: {
          label: "View",
          onClick: () => window.open(`${config.explorerUrl}/txn/${result.hash}?network=${network}`, "_blank"),
        },
      });

      setTimeout(() => {
        fetchBalance();
        refetch();
        // Sync tier with updated balances
        if (address) {
          const newStaked = Math.max(0, totalStaked - unlockableAmount).toString();
          syncTier({ pulseBalance: (pulseBalance + unlockableAmount).toString(), stakedAmount: newStaked });
        }
      }, 2000);
    } catch (error) {
      console.error("Unstake all failed:", error);
      toast.error("Failed to unstake PULSE", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Set max amount
  const handleMaxAmount = () => {
    const amount = pulseBalance / 1e8;
    setStakeAmount(amount.toString());
  };

  // Format time remaining
  const formatTimeRemaining = (unlockAt: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = unlockAt - now;

    if (diff <= 0) return "Unlocked";

    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Calculate progress to next tier
  const getNextTierProgress = () => {
    const totalPulse = pulseBalance + totalStaked;

    if (tier >= TIERS.PLATINUM) return { progress: 100, nextTier: null, remaining: 0 };

    const thresholds = [
      { tier: TIERS.SILVER, threshold: TIER_PULSE_THRESHOLDS[TIERS.SILVER] },
      { tier: TIERS.GOLD, threshold: TIER_PULSE_THRESHOLDS[TIERS.GOLD] },
      { tier: TIERS.PLATINUM, threshold: TIER_PULSE_THRESHOLDS[TIERS.PLATINUM] },
    ];

    const nextTierInfo = thresholds.find(t => t.tier > tier);
    if (!nextTierInfo) return { progress: 100, nextTier: null, remaining: 0 };

    const currentThreshold = tier === TIERS.BRONZE ? 0 : TIER_PULSE_THRESHOLDS[tier as keyof typeof TIER_PULSE_THRESHOLDS];
    const range = nextTierInfo.threshold - currentThreshold;
    const progress = Math.min(100, ((totalPulse - currentThreshold) / range) * 100);
    const remaining = Math.max(0, nextTierInfo.threshold - totalPulse);

    return { progress, nextTier: TIER_NAMES[nextTierInfo.tier as keyof typeof TIER_NAMES], remaining };
  };

  const tierProgress = getNextTierProgress();

  // Not connected state
  if (!isConnected) {
    return (
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <Card className="border-dashed max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lock className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-6 text-center">
              Connect a wallet to stake PULSE and boost your tier.
            </p>
            <WalletSelectionModal>
              <Button size="lg">
                <WalletIcon className="w-4 h-4 mr-2" />
                Connect Wallet
              </Button>
            </WalletSelectionModal>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Staking not configured
  if (!isConfigured) {
    return (
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <Card className="border-dashed max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Staking Not Available</h2>
            <p className="text-muted-foreground mb-6 text-center">
              Staking contract is not configured for {config.name}. Please check back later.
            </p>
            <Link href="/wallet">
              <Button variant="outline">
                Back to Wallet
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-display font-bold flex items-center gap-2">
            <Lock className="w-8 h-8" />
            PULSE Staking
          </h1>
          <TierRequirementsPopover align="start" />
        </div>
        <p className="text-muted-foreground">
          Stake your PULSE tokens to boost your tier and unlock more daily votes
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Coins className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Your Staked</p>
                <p className="text-xl font-bold font-mono">
                  {(totalStaked / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <Unlock className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unlockable</p>
                <p className="text-xl font-bold font-mono">
                  {(unlockableAmount / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pool Total</p>
                <p className="text-xl font-bold font-mono">
                  {(poolTotalStaked / 1e8).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Stakers</p>
                <p className="text-xl font-bold font-mono">{stakersCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tier Progress Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Your Tier Progress
                <TierRequirementsPopover align="center" iconClassName="w-4 h-4 text-muted-foreground" />
              </CardTitle>
              <CardDescription>
                Your tier is calculated from wallet balance + staked PULSE
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-lg px-3 py-1">
                    {TIER_NAMES[tier as keyof typeof TIER_NAMES]}
                  </Badge>
                </div>
                {tierProgress.nextTier && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Next: {tierProgress.nextTier}</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Progress value={tierProgress.progress} className="h-3" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Total: {((pulseBalance + totalStaked) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 0 })} PULSE
                  </span>
                  {tierProgress.remaining > 0 && (
                    <span className="text-muted-foreground">
                      Need {(tierProgress.remaining / 1e8).toLocaleString(undefined, { maximumFractionDigits: 0 })} more
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Wallet Balance</p>
                  <p className="text-lg font-mono">{(pulseBalance / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })} PULSE</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Staked Amount</p>
                  <p className="text-lg font-mono">{(totalStaked / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })} PULSE</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stake Positions Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="w-5 h-5" />
                    Your Stake Positions
                  </CardTitle>
                  <CardDescription>
                    {positions.length} active position{positions.length !== 1 ? "s" : ""}
                  </CardDescription>
                </div>
                {unlockableAmount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUnstakeAll}
                    disabled={isUnstaking}
                  >
                    {isUnstaking ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Unlock className="w-4 h-4 mr-2" />
                    )}
                    Unstake All Unlocked
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : positions.length > 0 ? (
                <div className="space-y-3">
                  {positions.map((position, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-4 rounded-lg border ${
                        position.isUnlocked
                          ? "bg-green-500/10 border-green-500/30"
                          : "bg-muted/50 border-muted"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          position.isUnlocked ? "bg-green-500/20" : "bg-purple-500/20"
                        }`}>
                          {position.isUnlocked ? (
                            <Unlock className="w-5 h-5 text-green-500" />
                          ) : (
                            <Lock className="w-5 h-5 text-purple-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold font-mono">
                            {(position.amount / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })} PULSE
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Locked for {LOCK_PERIODS.find(p => p.seconds === position.lockDuration)?.label || `${Math.floor(position.lockDuration / 86400)} days`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {position.isUnlocked ? (
                            <Badge variant="secondary" className="bg-green-500/20 text-green-600">
                              Unlocked
                            </Badge>
                          ) : (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              {formatTimeRemaining(position.unlockAt)}
                            </div>
                          )}
                        </div>
                        {position.isUnlocked && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnstake(index)}
                            disabled={isUnstaking}
                          >
                            {isUnstaking ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              "Unstake"
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Lock className="w-12 h-12 mb-2 opacity-50" />
                  <p className="text-sm">No active stake positions</p>
                  <p className="text-xs">Stake PULSE to boost your tier</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column - 1/3 width */}
        <div className="space-y-6">
          {/* Stake PULSE Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Stake PULSE
                <TierRequirementsPopover align="end" iconClassName="w-4 h-4 text-muted-foreground" />
              </CardTitle>
              <CardDescription>
                Lock your PULSE to boost your tier
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Available Balance */}
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <p className="text-sm text-muted-foreground">Available to Stake</p>
                <p className="text-xl font-bold font-mono">
                  {pulseBalanceFormatted} PULSE
                </p>
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <Label>Amount to Stake</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={handleMaxAmount}>
                    Max
                  </Button>
                </div>
              </div>

              {/* Lock Period Select */}
              <div className="space-y-2">
                <Label>Lock Period</Label>
                <Select
                  value={selectedLockPeriod}
                  onValueChange={setSelectedLockPeriod}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCK_PERIODS.map((period) => (
                      <SelectItem key={period.seconds} value={period.seconds.toString()}>
                        {period.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Longer locks show greater commitment
                </p>
              </div>

              {/* Tier Preview */}
              {stakeAmount && parseFloat(stakeAmount) > 0 && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-sm text-muted-foreground mb-1">After staking:</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {TIER_NAMES[tier as keyof typeof TIER_NAMES]}
                    </Badge>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                    <Badge variant="default" className="bg-purple-600">
                      {TIER_NAMES[calculatePotentialTier(parseFloat(stakeAmount) * 1e8) as keyof typeof TIER_NAMES]}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Stake Button */}
              <Button
                className="w-full bg-purple-600 hover:bg-purple-700"
                onClick={handleStake}
                disabled={isStaking || !stakeAmount || parseFloat(stakeAmount) <= 0}
              >
                {isStaking ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Staking...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Stake PULSE
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How Staking Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-2">
                <Shield className="w-4 h-4 mt-0.5 text-purple-500 shrink-0" />
                <p>Staked PULSE counts towards your tier qualification</p>
              </div>
              <div className="flex gap-2">
                <Clock className="w-4 h-4 mt-0.5 text-purple-500 shrink-0" />
                <p>Choose a lock period from 7 days to 1 year</p>
              </div>
              <div className="flex gap-2">
                <Unlock className="w-4 h-4 mt-0.5 text-purple-500 shrink-0" />
                <p>Unstake anytime after the lock period ends</p>
              </div>
              <div className="flex gap-2">
                <TrendingUp className="w-4 h-4 mt-0.5 text-purple-500 shrink-0" />
                <p>Higher tiers unlock more daily votes</p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/wallet">
                <Button variant="outline" className="w-full justify-start">
                  <WalletIcon className="w-4 h-4 mr-2" />
                  View Wallet
                </Button>
              </Link>
              <Link href="/swap">
                <Button variant="outline" className="w-full justify-start">
                  <Coins className="w-4 h-4 mr-2" />
                  Get More PULSE
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
