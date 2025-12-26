import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Coins,
  Users,
  CheckCircle2,
  Clock,
  Gift,
  Loader2,
  AlertCircle,
  Trophy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useContract } from "@/hooks/useContract";
import { formatBalance } from "@/lib/balance";
import { getCoinSymbol, getCoinDecimals, CoinTypeId } from "@/lib/tokens";
import { QUESTIONNAIRE_REWARD_TYPE } from "@/hooks/useQuestionnaire";

interface SharedPoolRewardCardProps {
  questionnaireId: string;
  onChainId: number | null;
  rewardType: number;
  totalRewardAmount: string;
  rewardPerCompletion: string;
  maxCompleters: number | null;
  coinTypeId: number;
  completionCount: number;
  walletAddress: string | undefined;
  isComplete: boolean;
  onClaimSuccess?: () => void;
}

export function SharedPoolRewardCard({
  questionnaireId,
  onChainId,
  rewardType,
  totalRewardAmount,
  rewardPerCompletion,
  maxCompleters,
  coinTypeId,
  completionCount,
  walletAddress,
  isComplete,
  onClaimSuccess,
}: SharedPoolRewardCardProps) {
  const { toast } = useToast();
  const {
    getQuestionnairePool,
    hasClaimedQuestionnaire,
    claimQuestionnaireReward,
    markQuestionnaireCompleted,
    loading: contractLoading,
  } = useContract();

  // Pool state from contract
  const [poolData, setPoolData] = useState<{
    reward_pool: number;
    reward_per_completion: number;
    completers: string[];
    claimed: string[];
    status: number;
    end_time: number;
  } | null>(null);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [isRegisteredCompleter, setIsRegisteredCompleter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // Load pool data
  useEffect(() => {
    async function loadPoolData() {
      if (rewardType !== QUESTIONNAIRE_REWARD_TYPE.SHARED_POOL || !onChainId) {
        setLoading(false);
        return;
      }

      try {
        const pool = await getQuestionnairePool(onChainId);
        if (pool) {
          setPoolData(pool);

          if (walletAddress) {
            const normalizedAddress = walletAddress.toLowerCase();
            setIsRegisteredCompleter(
              pool.completers.some(
                (c) => c.toLowerCase() === normalizedAddress
              )
            );
            setHasClaimed(
              pool.claimed.some((c) => c.toLowerCase() === normalizedAddress)
            );
          }
        }
      } catch (err) {
        console.error("Failed to load pool data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPoolData();
  }, [onChainId, rewardType, getQuestionnairePool, walletAddress]);

  // If not shared pool, don't render
  if (rewardType !== QUESTIONNAIRE_REWARD_TYPE.SHARED_POOL) {
    return null;
  }

  // If no on-chain pool yet, show placeholder
  if (!onChainId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Shared Pool Rewards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>Reward pool not yet configured on-chain</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const coinType = coinTypeId as CoinTypeId;
  const symbol = getCoinSymbol(coinType);
  const decimals = getCoinDecimals(coinType);

  // Calculate reward per user
  const calculateRewardPerUser = () => {
    if (!poolData) return 0;

    if (poolData.reward_per_completion > 0) {
      return poolData.reward_per_completion;
    }

    // Equal split
    const totalCompleters = poolData.completers.length;
    if (totalCompleters === 0) return poolData.reward_pool;
    return Math.floor(poolData.reward_pool / totalCompleters);
  };

  const rewardPerUser = calculateRewardPerUser();
  const formattedReward = formatBalance(rewardPerUser, decimals);

  // Check if claiming is open (status 2 = CLAIMING_OR_DISTRIBUTION)
  const isClaimingOpen = poolData?.status === 2;
  const isActive = poolData?.status === 0;
  const isEnded = poolData ? Date.now() / 1000 > poolData.end_time : false;

  // Register as completer
  const handleRegisterCompletion = async () => {
    if (!onChainId) return;

    setIsRegistering(true);
    try {
      const result = await markQuestionnaireCompleted(onChainId);
      if (result.success) {
        setIsRegisteredCompleter(true);
        toast({
          title: "Registered!",
          description: "You've been registered as a questionnaire completer.",
        });
      }
    } catch (err) {
      console.error("Failed to register completion:", err);
      toast({
        title: "Registration Failed",
        description: err instanceof Error ? err.message : "Failed to register completion",
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  // Claim reward
  const handleClaim = async () => {
    if (!onChainId) return;

    setIsClaiming(true);
    try {
      const result = await claimQuestionnaireReward(onChainId);
      if (result.success) {
        setHasClaimed(true);
        toast({
          title: "Reward Claimed!",
          description: `You received ${formattedReward} ${symbol}`,
        });
        onClaimSuccess?.();
      }
    } catch (err) {
      console.error("Failed to claim reward:", err);
      toast({
        title: "Claim Failed",
        description: err instanceof Error ? err.message : "Failed to claim reward",
        variant: "destructive",
      });
    } finally {
      setIsClaiming(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading reward pool...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Shared Pool Rewards
          </CardTitle>
          <Badge
            variant={
              hasClaimed
                ? "secondary"
                : isClaimingOpen
                ? "default"
                : isActive
                ? "outline"
                : "secondary"
            }
          >
            {hasClaimed
              ? "Claimed"
              : isClaimingOpen
              ? "Claiming Open"
              : isActive
              ? "Active"
              : "Closed"}
          </Badge>
        </div>
        <CardDescription>
          Complete all polls to earn from the shared reward pool
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pool Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Total Pool</p>
              <p className="font-semibold">
                {formatBalance(Number(totalRewardAmount), decimals)} {symbol}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Completers</p>
              <p className="font-semibold">
                {poolData?.completers.length || 0}
                {maxCompleters ? ` / ${maxCompleters}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Reward Per User */}
        <div className="p-4 bg-primary/5 rounded-lg text-center">
          <p className="text-sm text-muted-foreground mb-1">Your Reward</p>
          <p className="text-2xl font-bold text-primary">
            {formattedReward} {symbol}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {poolData?.reward_per_completion && poolData.reward_per_completion > 0
              ? "Fixed amount per completer"
              : "Equal split among completers"}
          </p>
        </div>

        {/* Status and Actions */}
        {!walletAddress ? (
          <div className="text-center py-4 text-muted-foreground">
            <p>Connect your wallet to claim rewards</p>
          </div>
        ) : hasClaimed ? (
          <div className="flex items-center justify-center gap-2 py-4 text-green-600">
            <Trophy className="h-5 w-5" />
            <span className="font-medium">Reward Claimed!</span>
          </div>
        ) : !isComplete ? (
          <div className="text-center py-4">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">
              Complete all polls to be eligible for rewards
            </p>
          </div>
        ) : !isRegisteredCompleter ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>You've completed all polls!</span>
            </div>
            <Button
              onClick={handleRegisterCompletion}
              disabled={isRegistering || contractLoading}
              className="w-full"
            >
              {isRegistering ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Register as Completer
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Register on-chain to be eligible for rewards
            </p>
          </div>
        ) : !isClaimingOpen ? (
          <div className="text-center py-4">
            <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">
              Claiming period has not started yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              The creator will open claims when the questionnaire ends
            </p>
          </div>
        ) : (
          <Button
            onClick={handleClaim}
            disabled={isClaiming || contractLoading}
            className="w-full"
            size="lg"
          >
            {isClaiming ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Claiming...
              </>
            ) : (
              <>
                <Gift className="h-4 w-4 mr-2" />
                Claim {formattedReward} {symbol}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
