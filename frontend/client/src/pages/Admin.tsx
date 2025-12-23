import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  Settings,
  Zap,
  Clock,
  Coins,
  Users,
  RefreshCcw,
  Info,
  Lock,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useAdmin } from "@/hooks/useAdmin";
import { useContract } from "@/hooks/useContract";
import { usePollCount } from "@/hooks/usePolls";
import { useNetwork } from "@/contexts/NetworkContext";
import { WalletSelectionModal } from "@/components/WalletSelectionModal";
import {
  isIndexerOptimizationEnabled,
  setIndexerOptimizationEnabled,
  FEATURE_FLAGS,
} from "@/lib/feature-flags";
import type { PlatformConfig } from "@/types/poll";

export default function Admin() {
  const { isAdmin, isConnected, address, adminAddresses } = useAdmin();
  const { getPlatformConfig, contractAddress } = useContract();
  const { data: pollCount, isLoading: pollCountLoading } = usePollCount();
  const { network } = useNetwork();

  const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [indexerOptEnabled, setIndexerOptEnabled] = useState(() => isIndexerOptimizationEnabled());

  // Fetch platform config
  useEffect(() => {
    async function fetchConfig() {
      if (!contractAddress) {
        setIsLoadingConfig(false);
        return;
      }
      setIsLoadingConfig(true);
      try {
        const config = await getPlatformConfig();
        setPlatformConfig(config);
      } catch (error) {
        console.error("Failed to fetch platform config:", error);
      } finally {
        setIsLoadingConfig(false);
      }
    }
    fetchConfig();
  }, [getPlatformConfig, contractAddress]);

  const handleIndexerOptToggle = (enabled: boolean) => {
    setIndexerOptimizationEnabled(enabled);
    setIndexerOptEnabled(enabled);
    toast.success(
      enabled
        ? "Indexer optimization enabled globally"
        : "Indexer optimization disabled globally"
    );
  };

  const refreshConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const config = await getPlatformConfig();
      setPlatformConfig(config);
      toast.success("Platform config refreshed");
    } catch (error) {
      toast.error("Failed to refresh config");
    } finally {
      setIsLoadingConfig(false);
    }
  };

  // Format claim period for display
  const formatClaimPeriod = (seconds: number): string => {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 86400)} days`;
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <ShieldAlert className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold">Platform Administration</h1>
            <p className="text-muted-foreground">Manage platform settings and feature flags</p>
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Connect Wallet</p>
            <p className="text-muted-foreground text-center mb-6">
              Connect an admin wallet to access platform settings
            </p>
            <WalletSelectionModal>
              <Button className="gap-2">
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </Button>
            </WalletSelectionModal>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not admin state
  if (!isAdmin) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <ShieldAlert className="w-8 h-8 text-destructive" />
          <div>
            <h1 className="text-3xl font-display font-bold">Access Denied</h1>
            <p className="text-muted-foreground">You don't have admin privileges</p>
          </div>
        </div>

        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lock className="w-12 h-12 text-destructive mb-4" />
            <p className="text-lg font-medium mb-2">Admin Access Required</p>
            <p className="text-muted-foreground text-center mb-4">
              This page is restricted to platform administrators.
            </p>
            <div className="text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-lg font-mono">
              Connected: {address?.slice(0, 10)}...{address?.slice(-8)}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin view
  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold">Platform Administration</h1>
            <p className="text-muted-foreground">Manage platform settings and feature flags</p>
          </div>
        </div>
        <Badge className="bg-green-500/20 text-green-500 border-green-500/50">
          <ShieldCheck className="w-3 h-3 mr-1" /> Admin
        </Badge>
      </div>

      {/* Platform Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Polls</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {pollCountLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{pollCount ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground capitalize">{network}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Platform Fee</CardTitle>
            <Coins className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingConfig ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {platformConfig ? `${platformConfig.feeBps / 100}%` : "-"}
              </div>
            )}
            <p className="text-xs text-muted-foreground">On reward distribution</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Claim Period</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingConfig ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">
                {platformConfig ? formatClaimPeriod(platformConfig.claimPeriodSecs) : "-"}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Before finalization</p>
          </CardContent>
        </Card>
      </div>

      {/* Platform Config Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Platform Configuration
            </CardTitle>
            <CardDescription>Current on-chain platform settings</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refreshConfig} disabled={isLoadingConfig}>
            <RefreshCcw className={`w-4 h-4 mr-2 ${isLoadingConfig ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingConfig ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : platformConfig ? (
            <>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
                <div>
                  <p className="font-medium">Treasury Address</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {platformConfig.treasury.slice(0, 20)}...{platformConfig.treasury.slice(-16)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
                <div>
                  <p className="font-medium">Total Fees Collected</p>
                  <p className="text-sm text-muted-foreground">
                    {(platformConfig.totalFeesCollected / 1e8).toFixed(4)} MOVE
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
                <div>
                  <p className="font-medium">Contract Address</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {contractAddress?.slice(0, 20)}...{contractAddress?.slice(-16)}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>
                Unable to load platform configuration. Make sure the contract is deployed.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Feature Flags
          </CardTitle>
          <CardDescription>
            Toggle platform-wide features. Changes apply immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
            <div className="flex-1">
              <p className="font-medium">Indexer Optimization</p>
              <p className="text-sm text-muted-foreground mt-1">
                Uses Movement Indexer for faster data retrieval. Enables parallel RPC calls,
                React Query caching (60s), and batch vote/claim status checks.
              </p>
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                Key: {FEATURE_FLAGS.USE_INDEXER_OPTIMIZATION}
              </p>
            </div>
            <Switch
              checked={indexerOptEnabled}
              onCheckedChange={handleIndexerOptToggle}
            />
          </div>

          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription className="text-sm">
              Feature flags are stored in localStorage and apply to all users on this browser.
              Users can also toggle features individually in their Settings page.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Admin Addresses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Admin Addresses
          </CardTitle>
          <CardDescription>
            Wallet addresses with admin access to this page
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {adminAddresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No admin addresses configured</p>
            ) : (
              adminAddresses.map((addr, i) => (
                <div
                  key={addr}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                >
                  <span className="font-mono text-sm">{addr}</span>
                  {addr === address?.toLowerCase() && (
                    <Badge variant="outline" className="text-green-500 border-green-500/50">
                      You
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            To add or remove admins, update the <code className="bg-muted px-1 rounded">VITE_ADMIN_ADDRESSES</code> environment variable.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
