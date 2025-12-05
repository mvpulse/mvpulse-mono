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
import {
  Wallet as WalletIcon,
  Copy,
  ExternalLink,
  RefreshCcw,
  AlertTriangle,
  Loader2,
  Droplets,
  ArrowDownUp,
  Vote,
  Eye,
  EyeOff,
  Send,
  Download,
  Gift,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { useNetwork } from "@/contexts/NetworkContext";
import { getAllBalances, type AllBalances, parseToSmallestUnit } from "@/lib/balance";
import { COIN_TYPES, getCoinDecimals, getPulseContractAddress, type CoinTypeId } from "@/lib/tokens";
import { WalletSelectionModal } from "@/components/WalletSelectionModal";
import { createAptosClient } from "@/lib/contract";
import { submitPrivyTransaction } from "@/lib/privy-transactions";
import { useActivityEvents } from "@/hooks/useActivityEvents";
import { formatRelativeTime } from "@/lib/events";

export default function WalletPage() {
  const { isConnected, address, isPrivyWallet } = useWalletConnection();
  const { isFunding, isAccountFunded, fundWallet, displayName, walletAddress: privyAddress, publicKey: privyPublicKey, signRawHash } = usePrivyWallet();
  const { signAndSubmitTransaction } = useWallet();
  const { network, config } = useNetwork();

  const [balances, setBalances] = useState<AllBalances | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [hideBalances, setHideBalances] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Transfer state
  const [selectedToken, setSelectedToken] = useState<CoinTypeId>(COIN_TYPES.PULSE);
  const [transferAmount, setTransferAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  const isTestnet = network === "testnet";
  const client = createAptosClient(config);

  // Activity events
  const { data: activityEvents, isLoading: isLoadingActivity } = useActivityEvents(address || undefined);

  // Fetch all balances
  const fetchBalance = useCallback(async () => {
    if (!address) return;

    setIsLoadingBalance(true);
    try {
      const balanceData = await getAllBalances(address, config.rpcUrl, network);
      setBalances(balanceData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch balances:", error);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [address, config.rpcUrl, network]);

  // Fetch balances on mount and when address changes
  useEffect(() => {
    if (address) {
      fetchBalance();
    } else {
      setBalances(null);
    }
  }, [address, fetchBalance]);

  // Copy address to clipboard
  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success("Address copied to clipboard");
    }
  };

  // Open explorer
  const openExplorer = () => {
    if (address) {
      window.open(
        `${config.explorerUrl}/account/${address}?network=${network}`,
        "_blank"
      );
    }
  };

  // Handle fund wallet
  const handleFundWallet = async () => {
    await fundWallet();
    // Refresh balance after funding
    setTimeout(fetchBalance, 2000);
  };

  // Get selected token balance
  const getSelectedBalance = () => {
    if (!balances) return 0;
    return balances[selectedToken]?.balance ?? 0;
  };

  // Get formatted selected balance
  const getFormattedSelectedBalance = () => {
    if (!balances) return "0.0000";
    return balances[selectedToken]?.balanceFormatted ?? "0.0000";
  };

  // Set max amount
  const handleMaxAmount = () => {
    const balance = getSelectedBalance();
    const decimals = getCoinDecimals(selectedToken);
    const amount = balance / Math.pow(10, decimals);
    setTransferAmount(amount.toString());
  };

  // Handle transfer
  const handleTransfer = async () => {
    if (!address || !recipientAddress || !transferAmount) {
      toast.error("Please fill in all fields");
      return;
    }

    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    // Validate recipient address
    if (!recipientAddress.startsWith("0x") || recipientAddress.length !== 66) {
      toast.error("Please enter a valid address (0x followed by 64 hex characters)");
      return;
    }

    const balance = getSelectedBalance();
    const decimals = getCoinDecimals(selectedToken);
    const amountInSmallestUnit = parseToSmallestUnit(amount, decimals);

    if (amountInSmallestUnit > balance) {
      toast.error("Insufficient balance");
      return;
    }

    setIsTransferring(true);

    try {
      let hash: string;

      if (selectedToken === COIN_TYPES.PULSE) {
        // PULSE transfer using FA
        const pulseContract = getPulseContractAddress(network);
        const payload = {
          function: `${pulseContract}::pulse::transfer` as `${string}::${string}::${string}`,
          typeArguments: [] as [],
          functionArguments: [recipientAddress, amountInSmallestUnit.toString()],
        };

        if (isPrivyWallet) {
          if (!privyAddress || !privyPublicKey || !signRawHash) {
            throw new Error("Privy wallet not properly connected");
          }
          hash = await submitPrivyTransaction(client, privyAddress, privyPublicKey, signRawHash, payload);
        } else {
          const response = await signAndSubmitTransaction({ data: payload });
          hash = response.hash;
        }
      } else if (selectedToken === COIN_TYPES.MOVE) {
        // MOVE transfer using aptos_account::transfer
        const payload = {
          function: "0x1::aptos_account::transfer" as `${string}::${string}::${string}`,
          typeArguments: [] as [],
          functionArguments: [recipientAddress, amountInSmallestUnit.toString()],
        };

        if (isPrivyWallet) {
          if (!privyAddress || !privyPublicKey || !signRawHash) {
            throw new Error("Privy wallet not properly connected");
          }
          hash = await submitPrivyTransaction(client, privyAddress, privyPublicKey, signRawHash, payload);
        } else {
          const response = await signAndSubmitTransaction({ data: payload });
          hash = response.hash;
        }
      } else {
        // USDC transfer not supported (external token)
        toast.error("USDC transfers are not supported");
        return;
      }

      toast.success("Transfer successful!", {
        description: `Transaction: ${hash.slice(0, 10)}...`,
        action: {
          label: "View",
          onClick: () => window.open(`${config.explorerUrl}/txn/${hash}`, "_blank"),
        },
      });

      // Clear form and refresh balance
      setTransferAmount("");
      setRecipientAddress("");
      setTimeout(fetchBalance, 2000);
    } catch (error) {
      console.error("Transfer failed:", error);
      toast.error("Transfer failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  // Format last updated time
  const formatLastUpdated = () => {
    if (!lastUpdated) return "";
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  // Truncate address for display
  const truncateAddress = (addr: string) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Token display config
  const tokenConfig = [
    { id: COIN_TYPES.PULSE, symbol: "PULSE", color: "purple", bgClass: "bg-purple-500/10 border-purple-500/20" },
    { id: COIN_TYPES.MOVE, symbol: "MOVE", color: "blue", bgClass: "bg-blue-500/10 border-blue-500/20" },
    { id: COIN_TYPES.USDC, symbol: "USDC", color: "green", bgClass: "bg-green-500/10 border-green-500/20" },
  ];

  // Not connected state
  if (!isConnected) {
    return (
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <Card className="border-dashed max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <WalletIcon className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-6 text-center">
              Connect a wallet to view your balance and manage your account.
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

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold flex items-center gap-2">
          <WalletIcon className="w-8 h-8" />
          My Wallet
        </h1>
        <p className="text-muted-foreground">Manage your tokens and view transaction history</p>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Wallet Balance Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Wallet Balance
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setHideBalances(!hideBalances)}
                    >
                      {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    Last updated: {formatLastUpdated() || "Never"}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchBalance}
                  disabled={isLoadingBalance}
                >
                  <RefreshCcw className={`w-4 h-4 mr-1 ${isLoadingBalance ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Total Portfolio Box */}
              <div className="bg-gradient-to-r from-purple-600 to-purple-400 rounded-lg p-6 text-white">
                <p className="text-purple-100 text-sm mb-1">Total PULSE Balance</p>
                <p className="text-3xl font-bold font-mono">
                  {hideBalances ? "••••••" : (balances?.[COIN_TYPES.PULSE]?.balanceFormatted ?? "0.0000")}
                  <span className="text-lg ml-2 text-purple-100">PULSE</span>
                </p>
              </div>

              {/* Token List */}
              <div className="space-y-3">
                {tokenConfig.map((token) => (
                  <div
                    key={token.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${token.bgClass}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full bg-${token.color}-500/20 flex items-center justify-center`}>
                        <span className={`text-${token.color}-500 font-bold text-sm`}>
                          {token.symbol.slice(0, 2)}
                        </span>
                      </div>
                      <span className="font-medium">{token.symbol}</span>
                    </div>
                    <div className="text-right">
                      {isLoadingBalance ? (
                        <Skeleton className="h-6 w-24" />
                      ) : (
                        <p className="font-mono font-bold">
                          {hideBalances ? "••••••" : (balances?.[token.id]?.balanceFormatted ?? "0.0000")}
                          <span className="text-muted-foreground text-sm ml-1">{token.symbol}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Wallet Address */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Wallet Address:</span>
                  <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                    {truncateAddress(address || "")}
                  </code>
                </div>
                <Button variant="ghost" size="sm" onClick={copyAddress}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>

              {/* Account Status */}
              {balances && !balances[COIN_TYPES.MOVE]?.exists && (
                <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <AlertDescription className="text-yellow-600 dark:text-yellow-400">
                    This account hasn't been initialized on-chain yet. Fund it with some MOVE to activate it.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>
                Your on-chain transaction history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {isLoadingActivity ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : activityEvents && activityEvents.length > 0 ? (
                  activityEvents.map((event, index) => (
                    <div
                      key={`${event.type}-${event.pollId}-${index}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          event.type === 'vote'
                            ? 'bg-purple-500/20'
                            : event.type === 'reward_claimed'
                            ? 'bg-green-500/20'
                            : 'bg-blue-500/20'
                        }`}>
                          {event.type === 'vote' ? (
                            <Vote className="w-5 h-5 text-purple-500" />
                          ) : event.type === 'reward_claimed' ? (
                            <Gift className="w-5 h-5 text-green-500" />
                          ) : (
                            <Clock className="w-5 h-5 text-blue-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {event.type === 'vote'
                              ? `Voted on Poll #${event.pollId}`
                              : event.type === 'reward_claimed'
                              ? `Claimed reward from Poll #${event.pollId}`
                              : `Created Poll #${event.pollId}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeTime(event.timestamp)}
                          </p>
                        </div>
                      </div>
                      {event.type === 'reward_claimed' && event.amount && (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                          +{(event.amount / 1e8).toFixed(2)} PULSE
                        </Badge>
                      )}
                      {event.type === 'vote' && (
                        <Badge variant="secondary" className="bg-purple-500/10 text-purple-600">
                          Voted
                        </Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Clock className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">No recent activity</p>
                    <p className="text-xs">Your votes and rewards will appear here</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column - 1/3 width */}
        <div className="space-y-6">
          {/* Quick Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/swap">
                <Button className="w-full justify-start bg-purple-600 hover:bg-purple-700">
                  <ArrowDownUp className="w-4 h-4 mr-2" />
                  Swap Tokens
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={copyAddress}
              >
                <Download className="w-4 h-4 mr-2" />
                Receive PULSE
              </Button>
              <Link href="/polls">
                <Button variant="outline" className="w-full justify-start">
                  <Vote className="w-4 h-4 mr-2" />
                  Participate in Polls
                </Button>
              </Link>
              {/* Get MOVE - Testnet only for Privy wallets */}
              {isPrivyWallet && isTestnet && (
                <Button
                  variant="outline"
                  className="w-full justify-start border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
                  onClick={handleFundWallet}
                  disabled={isFunding}
                >
                  {isFunding ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Funding...
                    </>
                  ) : (
                    <>
                      <Droplets className="w-4 h-4 mr-2" />
                      Get MOVE (Faucet)
                    </>
                  )}
                </Button>
              )}
              {isAccountFunded && isPrivyWallet && isTestnet && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Gift className="w-3 h-3" />
                  Account has been funded
                </p>
              )}
            </CardContent>
          </Card>

          {/* Transfer Tokens Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Transfer Tokens
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Token Select */}
              <div className="space-y-2">
                <Label>Token</Label>
                <Select
                  value={selectedToken.toString()}
                  onValueChange={(val) => setSelectedToken(parseInt(val) as CoinTypeId)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={COIN_TYPES.PULSE.toString()}>PULSE</SelectItem>
                    <SelectItem value={COIN_TYPES.MOVE.toString()}>MOVE</SelectItem>
                    <SelectItem value={COIN_TYPES.USDC.toString()} disabled>
                      USDC (coming soon)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Balance: {getFormattedSelectedBalance()} {tokenConfig.find(t => t.id === selectedToken)?.symbol}
                </p>
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <Label>Amount</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={handleMaxAmount}>
                    Max
                  </Button>
                </div>
              </div>

              {/* Recipient Address */}
              <div className="space-y-2">
                <Label>Recipient Address</Label>
                <Input
                  placeholder="0x..."
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                />
              </div>

              {/* Transfer Button */}
              <Button
                className="w-full"
                onClick={handleTransfer}
                disabled={isTransferring || !transferAmount || !recipientAddress}
              >
                {isTransferring ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Transferring...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Transfer {tokenConfig.find(t => t.id === selectedToken)?.symbol}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Wallet Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Wallet Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Address</span>
                <div className="flex items-center gap-1">
                  <code className="text-xs font-mono">{truncateAddress(address || "")}</code>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyAddress}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Network</span>
                <Badge variant={isTestnet ? "secondary" : "default"}>
                  {config.name}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Wallet Type</span>
                <span className="text-sm">{isPrivyWallet ? "Privy Wallet" : "Native Wallet"}</span>
              </div>
              {isPrivyWallet && displayName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Account</span>
                  <span className="text-sm">{displayName}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Explore Card */}
          <Card>
            <CardHeader>
              <CardTitle>Explore</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={openExplorer}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View on Explorer
              </Button>
              {isTestnet && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.open("https://faucet.movementnetwork.xyz/", "_blank")}
                >
                  <Droplets className="w-4 h-4 mr-2" />
                  Movement Faucet
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Mainnet Notice for Privy */}
          {isPrivyWallet && !isTestnet && (
            <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-600 dark:text-yellow-400 text-sm">
                <strong>Mainnet:</strong> To fund your Privy wallet, send MOVE tokens from an exchange or another wallet.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
