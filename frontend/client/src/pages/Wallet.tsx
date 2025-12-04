import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Wallet as WalletIcon,
  Copy,
  ExternalLink,
  RefreshCcw,
  Coins,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Droplets,
} from "lucide-react";
import { toast } from "sonner";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { useNetwork } from "@/contexts/NetworkContext";
import { getAccountBalance, type AccountBalance } from "@/lib/balance";
import { WalletSelectionModal } from "@/components/WalletSelectionModal";

export default function WalletPage() {
  const { isConnected, address, isPrivyWallet, isNativeWallet } = useWalletConnection();
  const { isFunding, isAccountFunded, fundWallet, displayName } = usePrivyWallet();
  const { network, config } = useNetwork();

  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const isTestnet = network === "testnet";

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    if (!address) return;

    setIsLoadingBalance(true);
    try {
      const balanceData = await getAccountBalance(address, config.rpcUrl);
      setBalance(balanceData);
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [address, config.rpcUrl]);

  // Fetch balance on mount and when address changes
  useEffect(() => {
    if (address) {
      fetchBalance();
    } else {
      setBalance(null);
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

  // Not connected state
  if (!isConnected) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <Card className="border-dashed">
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
    <div className="container max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Wallet</h1>
          <p className="text-muted-foreground">Manage your wallet and view balances</p>
        </div>
        <Badge variant={isTestnet ? "secondary" : "default"}>
          {config.name}
        </Badge>
      </div>

      {/* Wallet Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <WalletIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">
                  {isPrivyWallet ? "Privy Wallet" : "Native Wallet"}
                </CardTitle>
                <CardDescription>
                  {isPrivyWallet ? displayName : "External wallet connected"}
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-green-500 border-green-500/50">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Address */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Address</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded-md text-sm font-mono truncate">
                {address}
              </code>
              <Button variant="outline" size="icon" onClick={copyAddress}>
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={openExplorer}>
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Balance */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground">Balance</label>
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
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <Coins className="w-8 h-8 text-primary" />
              {isLoadingBalance ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <div>
                  <p className="text-3xl font-bold font-mono">
                    {balance?.balanceFormatted ?? "0.0000"}
                  </p>
                  <p className="text-sm text-muted-foreground">MOVE</p>
                </div>
              )}
            </div>
          </div>

          {/* Account Status */}
          {balance && !balance.exists && (
            <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-600 dark:text-yellow-400">
                This account hasn't been initialized on-chain yet. Fund it with some MOVE to activate it.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Fund Wallet Card - Testnet Only for Privy */}
      {isPrivyWallet && isTestnet && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-blue-500" />
              Testnet Faucet
            </CardTitle>
            <CardDescription>
              Get free testnet MOVE tokens to test the application
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
              <div>
                <p className="font-medium">Request Testnet MOVE</p>
                <p className="text-sm text-muted-foreground">
                  Receive 1 MOVE from the testnet faucet
                </p>
              </div>
              <Button
                onClick={handleFundWallet}
                disabled={isFunding}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isFunding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Funding...
                  </>
                ) : (
                  <>
                    <Droplets className="w-4 h-4 mr-2" />
                    Get MOVE
                  </>
                )}
              </Button>
            </div>
            {isAccountFunded && (
              <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Account has been funded
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mainnet Notice for Privy */}
      {isPrivyWallet && !isTestnet && (
        <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="text-yellow-600 dark:text-yellow-400">
            <strong>Mainnet:</strong> To fund your Privy wallet, you'll need to send MOVE tokens from an exchange or another wallet to the address above.
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="outline" className="justify-start" onClick={openExplorer}>
            <ExternalLink className="w-4 h-4 mr-2" />
            View on Explorer
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => window.open("https://faucet.movementnetwork.xyz/", "_blank")}
            disabled={!isTestnet}
          >
            <Droplets className="w-4 h-4 mr-2" />
            Movement Faucet
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
