import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  ArrowDownUp,
  AlertTriangle,
  Loader2,
  RefreshCcw,
  Wallet as WalletIcon,
  Droplets,
  TrendingUp,
  ArrowDown,
  Info,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useNetwork } from "@/contexts/NetworkContext";
import { useSwap, type PoolInfo, type SwapQuote, type LiquidityPosition } from "@/hooks/useSwap";
import { getAllBalances, type AllBalances } from "@/lib/balance";
import { COIN_TYPES, getCoinDecimals } from "@/lib/tokens";
import { WalletSelectionModal } from "@/components/WalletSelectionModal";
import { TransactionConfirmationDialog } from "@/components/TransactionConfirmationDialog";
import { showTransactionSuccessToast, showTransactionErrorToast } from "@/lib/transaction-feedback";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function SwapPage() {
  const { isConnected, address, isPrivyWallet } = useWalletConnection();
  const { network, config } = useNetwork();
  const {
    loading,
    error,
    swapAddress,
    getPoolInfo,
    getSwapQuote,
    getLpPosition,
    getSpotPrice,
    swapPulseToUsdc,
    swapUsdcToPulse,
    addLiquidity,
    removeLiquidity,
  } = useSwap();

  // State
  const [balances, setBalances] = useState<AllBalances | null>(null);
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [lpPosition, setLpPosition] = useState<LiquidityPosition | null>(null);
  const [spotPrice, setSpotPrice] = useState<number | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Swap state
  const [isPulseToUsdc, setIsPulseToUsdc] = useState(true);
  const [swapAmount, setSwapAmount] = useState("");
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [slippageTolerance, setSlippageTolerance] = useState(0.5); // 0.5%
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  // Liquidity state
  const [pulseAmount, setPulseAmount] = useState("");
  const [usdcAmount, setUsdcAmount] = useState("");
  const [removePercent, setRemovePercent] = useState(50);

  // Confirmation dialog state for Privy wallets
  const [showSwapConfirmation, setShowSwapConfirmation] = useState(false);
  const [showAddLiquidityConfirmation, setShowAddLiquidityConfirmation] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const isTestnet = network === "testnet";

  // Fetch all data
  const fetchData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [balanceData, poolData, lpData, priceData] = await Promise.all([
        address ? getAllBalances(address, config.rpcUrl, network, config.fullnodeUrl) : null,
        getPoolInfo(),
        address ? getLpPosition() : null,
        getSpotPrice(), // PULSE per USDC
      ]);

      setBalances(balanceData);
      setPoolInfo(poolData);
      setLpPosition(lpData);
      setSpotPrice(priceData);
    } catch (err) {
      console.error("Failed to fetch swap data:", err);
    } finally {
      setIsLoadingData(false);
    }
  }, [address, config.rpcUrl, network, getPoolInfo, getLpPosition, getSpotPrice]);

  // Fetch data on mount and when address changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch quote when swap amount changes
  useEffect(() => {
    const fetchQuote = async () => {
      const amount = parseFloat(swapAmount);
      if (isNaN(amount) || amount <= 0) {
        setSwapQuote(null);
        return;
      }

      setIsLoadingQuote(true);
      try {
        const decimals = isPulseToUsdc ? getCoinDecimals(COIN_TYPES.PULSE) : getCoinDecimals(COIN_TYPES.USDC);
        const amountInSmallest = Math.floor(amount * Math.pow(10, decimals));
        const quote = await getSwapQuote(amountInSmallest, isPulseToUsdc);
        setSwapQuote(quote);
      } catch (err) {
        console.error("Failed to fetch quote:", err);
        setSwapQuote(null);
      } finally {
        setIsLoadingQuote(false);
      }
    };

    const debounce = setTimeout(fetchQuote, 300);
    return () => clearTimeout(debounce);
  }, [swapAmount, isPulseToUsdc, getSwapQuote]);

  // Toggle swap direction
  const toggleDirection = () => {
    setIsPulseToUsdc(!isPulseToUsdc);
    setSwapAmount("");
    setSwapQuote(null);
  };

  // Set max amount
  const setMaxAmount = () => {
    if (!balances) return;
    const balance = isPulseToUsdc ? balances[COIN_TYPES.PULSE] : balances[COIN_TYPES.USDC];
    const decimals = isPulseToUsdc ? getCoinDecimals(COIN_TYPES.PULSE) : getCoinDecimals(COIN_TYPES.USDC);
    const maxAmount = balance.balance / Math.pow(10, decimals);
    setSwapAmount(maxAmount.toString());
  };

  // Execute swap transaction
  const executeSwap = async () => {
    if (!swapQuote) return;

    setIsExecuting(true);
    try {
      // Calculate minimum output with slippage
      const slippageMultiplier = 1 - slippageTolerance / 100;
      const minAmountOut = Math.floor(swapQuote.amountOut * slippageMultiplier);

      let result;
      if (isPulseToUsdc) {
        result = await swapPulseToUsdc(swapQuote.amountIn, minAmountOut);
      } else {
        result = await swapUsdcToPulse(swapQuote.amountIn, minAmountOut);
      }

      showTransactionSuccessToast(
        result.hash,
        "Swap Successful!",
        `Swapped ${swapAmount} ${inputSymbol} for ${swapQuote.amountOutFormatted} ${outputSymbol}`,
        config.explorerUrl,
        result.sponsored
      );
      setSwapAmount("");
      setSwapQuote(null);
      fetchData();
    } catch (err) {
      showTransactionErrorToast("Swap Failed", err instanceof Error ? err : "Transaction failed");
    } finally {
      setIsExecuting(false);
      setShowSwapConfirmation(false);
    }
  };

  // Handle swap button click
  const handleSwap = async () => {
    if (!swapQuote || loading) return;

    // If Privy wallet, show confirmation dialog first
    if (isPrivyWallet) {
      setShowSwapConfirmation(true);
      return;
    }

    // Otherwise execute directly (native wallets show their own confirmation)
    await executeSwap();
  };

  // Execute add liquidity transaction
  const executeAddLiquidity = async () => {
    const pulseAmt = parseFloat(pulseAmount);
    const usdcAmt = parseFloat(usdcAmount);

    setIsExecuting(true);
    try {
      const pulseInSmallest = Math.floor(pulseAmt * Math.pow(10, getCoinDecimals(COIN_TYPES.PULSE)));
      const usdcInSmallest = Math.floor(usdcAmt * Math.pow(10, getCoinDecimals(COIN_TYPES.USDC)));

      // Set minimum LP shares to 0 for simplicity (could add slippage protection)
      const result = await addLiquidity(pulseInSmallest, usdcInSmallest, 0);

      showTransactionSuccessToast(
        result.hash,
        "Liquidity Added!",
        `Added ${pulseAmount} PULSE and ${usdcAmount} USDC to the pool`,
        config.explorerUrl,
        result.sponsored
      );
      setPulseAmount("");
      setUsdcAmount("");
      fetchData();
    } catch (err) {
      showTransactionErrorToast("Failed to Add Liquidity", err instanceof Error ? err : "Transaction failed");
    } finally {
      setIsExecuting(false);
      setShowAddLiquidityConfirmation(false);
    }
  };

  // Handle add liquidity button click
  const handleAddLiquidity = async () => {
    const pulseAmt = parseFloat(pulseAmount);
    const usdcAmt = parseFloat(usdcAmount);

    if (isNaN(pulseAmt) || isNaN(usdcAmt) || pulseAmt <= 0 || usdcAmt <= 0) {
      toast.error("Please enter valid amounts");
      return;
    }

    // If Privy wallet, show confirmation dialog first
    if (isPrivyWallet) {
      setShowAddLiquidityConfirmation(true);
      return;
    }

    // Otherwise execute directly (native wallets show their own confirmation)
    await executeAddLiquidity();
  };

  // Handle remove liquidity (no confirmation needed - user receives funds)
  const handleRemoveLiquidity = async () => {
    if (!lpPosition || lpPosition.shares <= 0) {
      toast.error("No liquidity to remove");
      return;
    }

    try {
      const sharesToRemove = Math.floor(lpPosition.shares * (removePercent / 100));
      if (sharesToRemove <= 0) {
        toast.error("Amount too small");
        return;
      }

      // Calculate expected output with slippage protection
      const expectedPulse = Math.floor(lpPosition.pulseValue * (removePercent / 100));
      const expectedUsdc = Math.floor(lpPosition.stableValue * (removePercent / 100));
      const slippageMultiplier = 1 - slippageTolerance / 100;
      const minPulse = Math.floor(expectedPulse * slippageMultiplier);
      const minUsdc = Math.floor(expectedUsdc * slippageMultiplier);

      const result = await removeLiquidity(sharesToRemove, minPulse, minUsdc);

      showTransactionSuccessToast(
        result.hash,
        "Liquidity Removed!",
        `Removed ${removePercent}% of your liquidity position`,
        config.explorerUrl,
        result.sponsored
      );
      setRemovePercent(50);
      fetchData();
    } catch (err) {
      showTransactionErrorToast("Failed to Remove Liquidity", err instanceof Error ? err : "Transaction failed");
    }
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ArrowDownUp className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-6 text-center">
              Connect a wallet to swap PULSE and USDC tokens.
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

  // No swap contract configured
  if (!swapAddress) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Swap contract not configured for {network}. Please check your environment configuration.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const inputSymbol = isPulseToUsdc ? "PULSE" : "USDC";
  const outputSymbol = isPulseToUsdc ? "USDC" : "PULSE";
  const inputBalance = isPulseToUsdc ? balances?.[COIN_TYPES.PULSE] : balances?.[COIN_TYPES.USDC];
  const outputBalance = isPulseToUsdc ? balances?.[COIN_TYPES.USDC] : balances?.[COIN_TYPES.PULSE];

  const highPriceImpact = swapQuote && swapQuote.priceImpactBps > 500; // > 5%

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Swap</h1>
          <p className="text-muted-foreground">Trade PULSE and USDC tokens</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchData} disabled={isLoadingData}>
            <RefreshCcw className={`w-4 h-4 ${isLoadingData ? "animate-spin" : ""}`} />
          </Button>
          <Badge variant={isTestnet ? "secondary" : "default"}>
            {config.name}
          </Badge>
        </div>
      </div>

      {/* Pool Info Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Pool Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingData && !poolInfo ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : poolInfo ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">PULSE Reserve</p>
                <p className="font-mono font-semibold">{poolInfo.pulseReserveFormatted}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">USDC Reserve</p>
                <p className="font-mono font-semibold">{poolInfo.stableReserveFormatted}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Swap Fee</p>
                <p className="font-mono font-semibold">{(poolInfo.feeBps / 100).toFixed(2)}%</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Price (PULSE/USDC)</p>
                <p className="font-mono font-semibold">{spotPrice?.toFixed(6) ?? "—"}</p>
              </div>
            </div>
          ) : (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Pool not initialized. Add initial liquidity to start trading.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="swap" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="swap">Swap</TabsTrigger>
          <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
        </TabsList>

        {/* Swap Tab */}
        <TabsContent value="swap" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Swap Tokens</CardTitle>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Settings className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <div className="space-y-3">
                      <Label>Slippage Tolerance</Label>
                      <div className="flex gap-2">
                        {[0.1, 0.5, 1.0].map((value) => (
                          <Button
                            key={value}
                            variant={slippageTolerance === value ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSlippageTolerance(value)}
                          >
                            {value}%
                          </Button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={slippageTolerance}
                          onChange={(e) => setSlippageTolerance(parseFloat(e.target.value) || 0.5)}
                          className="w-20"
                          min={0}
                          max={50}
                          step={0.1}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>From</Label>
                  <span className="text-sm text-muted-foreground">
                    Balance: {inputBalance?.balanceFormatted ?? "0.0000"} {inputSymbol}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0.0"
                    value={swapAmount}
                    onChange={(e) => setSwapAmount(e.target.value)}
                    className="font-mono"
                  />
                  <Button variant="outline" onClick={setMaxAmount}>
                    Max
                  </Button>
                  <Badge variant="secondary" className="px-3">
                    {inputSymbol}
                  </Badge>
                </div>
              </div>

              {/* Toggle Button */}
              <div className="flex justify-center">
                <Button variant="ghost" size="icon" onClick={toggleDirection}>
                  <ArrowDown className="w-4 h-4" />
                </Button>
              </div>

              {/* Output */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>To</Label>
                  <span className="text-sm text-muted-foreground">
                    Balance: {outputBalance?.balanceFormatted ?? "0.0000"} {outputSymbol}
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 px-3 py-2 bg-muted rounded-md font-mono text-lg">
                    {isLoadingQuote ? (
                      <Skeleton className="h-6 w-24" />
                    ) : (
                      swapQuote?.amountOutFormatted ?? "0.0000"
                    )}
                  </div>
                  <Badge variant="secondary" className="px-3">
                    {outputSymbol}
                  </Badge>
                </div>
              </div>

              {/* Quote Info */}
              {swapQuote && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rate</span>
                    <span className="font-mono">1 {inputSymbol} = {swapQuote.rate} {outputSymbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price Impact</span>
                    <span className={`font-mono ${highPriceImpact ? "text-red-500" : ""}`}>
                      {swapQuote.priceImpactPercent}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Min. Received</span>
                    <span className="font-mono">
                      {((swapQuote.amountOut * (1 - slippageTolerance / 100)) / Math.pow(10, isPulseToUsdc ? 6 : 8)).toFixed(4)} {outputSymbol}
                    </span>
                  </div>
                </div>
              )}

              {/* High Price Impact Warning */}
              {highPriceImpact && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    High price impact! Your trade will move the market price significantly.
                  </AlertDescription>
                </Alert>
              )}

              {/* Swap Button */}
              <Button
                className="w-full"
                size="lg"
                onClick={handleSwap}
                disabled={loading || !swapQuote || !swapAmount}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Swapping...
                  </>
                ) : (
                  <>
                    <ArrowDownUp className="w-4 h-4 mr-2" />
                    Swap {inputSymbol} for {outputSymbol}
                  </>
                )}
              </Button>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Liquidity Tab */}
        <TabsContent value="liquidity" className="space-y-4">
          {/* Your Position */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Droplets className="w-5 h-5" />
                Your Liquidity Position
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingData && !lpPosition ? (
                <Skeleton className="h-24" />
              ) : lpPosition && lpPosition.shares > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">LP Shares</p>
                      <p className="font-mono font-semibold">{lpPosition.shares.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Pool Share</p>
                      <p className="font-mono font-semibold">{lpPosition.poolPercentage.toFixed(4)}%</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">PULSE Value</p>
                      <p className="font-mono font-semibold">{lpPosition.pulseValueFormatted}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">USDC Value</p>
                      <p className="font-mono font-semibold">{lpPosition.stableValueFormatted}</p>
                    </div>
                  </div>

                  {/* Remove Liquidity */}
                  <div className="space-y-3 pt-4 border-t">
                    <Label>Remove Liquidity</Label>
                    <div className="flex gap-2">
                      {[25, 50, 75, 100].map((percent) => (
                        <Button
                          key={percent}
                          variant={removePercent === percent ? "default" : "outline"}
                          size="sm"
                          onClick={() => setRemovePercent(percent)}
                        >
                          {percent}%
                        </Button>
                      ))}
                    </div>
                    <Slider
                      value={[removePercent]}
                      onValueChange={(value) => setRemovePercent(value[0])}
                      max={100}
                      step={1}
                      className="my-4"
                    />
                    <div className="p-3 bg-muted/50 rounded-lg text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">PULSE to receive</span>
                        <span className="font-mono">
                          ~{((lpPosition.pulseValue * removePercent / 100) / Math.pow(10, 8)).toFixed(4)} PULSE
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-muted-foreground">USDC to receive</span>
                        <span className="font-mono">
                          ~{((lpPosition.stableValue * removePercent / 100) / Math.pow(10, 6)).toFixed(4)} USDC
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={handleRemoveLiquidity}
                      disabled={loading || lpPosition.shares <= 0}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Removing...
                        </>
                      ) : (
                        "Remove Liquidity"
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Droplets className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>You have no liquidity in this pool</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add Liquidity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Liquidity</CardTitle>
              <CardDescription>
                Provide liquidity to earn {poolInfo ? (poolInfo.feeBps / 100).toFixed(2) : "0.30"}% on swaps
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* PULSE Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>PULSE Amount</Label>
                  <span className="text-sm text-muted-foreground">
                    Balance: {balances?.[COIN_TYPES.PULSE]?.balanceFormatted ?? "0.0000"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0.0"
                    value={pulseAmount}
                    onChange={(e) => setPulseAmount(e.target.value)}
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (balances) {
                        const max = balances[COIN_TYPES.PULSE].balance / Math.pow(10, 8);
                        setPulseAmount(max.toString());
                      }
                    }}
                  >
                    Max
                  </Button>
                </div>
              </div>

              {/* USDC Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>USDC Amount</Label>
                  <span className="text-sm text-muted-foreground">
                    Balance: {balances?.[COIN_TYPES.USDC]?.balanceFormatted ?? "0.0000"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0.0"
                    value={usdcAmount}
                    onChange={(e) => setUsdcAmount(e.target.value)}
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (balances) {
                        const max = balances[COIN_TYPES.USDC].balance / Math.pow(10, 6);
                        setUsdcAmount(max.toString());
                      }
                    }}
                  >
                    Max
                  </Button>
                </div>
              </div>

              {/* Info */}
              {poolInfo && poolInfo.totalLpShares > 0 && spotPrice && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Current pool ratio: 1 USDC = {spotPrice.toFixed(4)} PULSE.
                    For optimal LP, match this ratio.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                className="w-full"
                onClick={handleAddLiquidity}
                disabled={loading || !pulseAmount || !usdcAmount}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding Liquidity...
                  </>
                ) : (
                  <>
                    <Droplets className="w-4 h-4 mr-2" />
                    Add Liquidity
                  </>
                )}
              </Button>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Privy Wallet Confirmation Dialogs */}
      <TransactionConfirmationDialog
        open={showSwapConfirmation}
        onOpenChange={setShowSwapConfirmation}
        onConfirm={executeSwap}
        onCancel={() => setShowSwapConfirmation(false)}
        isLoading={isExecuting}
        title="Confirm Swap"
        description={`Swap ${inputSymbol} for ${outputSymbol}`}
        amount={parseFloat(swapAmount) || 0}
        tokenSymbol={inputSymbol}
        details={swapQuote ? [
          { label: "You Receive", value: `${swapQuote.amountOutFormatted} ${outputSymbol}` },
          { label: "Rate", value: `1 ${inputSymbol} = ${swapQuote.rate} ${outputSymbol}` },
          { label: "Price Impact", value: `${swapQuote.priceImpactPercent}%` },
          { label: "Slippage Tolerance", value: `${slippageTolerance}%` },
        ] : []}
      />

      <TransactionConfirmationDialog
        open={showAddLiquidityConfirmation}
        onOpenChange={setShowAddLiquidityConfirmation}
        onConfirm={executeAddLiquidity}
        onCancel={() => setShowAddLiquidityConfirmation(false)}
        isLoading={isExecuting}
        title="Confirm Add Liquidity"
        description="Provide liquidity to the PULSE/USDC pool"
        amount={parseFloat(pulseAmount) || 0}
        tokenSymbol="PULSE"
        details={[
          { label: "PULSE Amount", value: `${pulseAmount || "0"} PULSE` },
          { label: "USDC Amount", value: `${usdcAmount || "0"} USDC` },
        ]}
      />
    </div>
  );
}
