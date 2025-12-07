import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Settings as SettingsIcon,
  Fuel,
  RefreshCcw,
  Info,
  Wallet,
  Network,
} from "lucide-react";
import { toast } from "sonner";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useNetwork } from "@/contexts/NetworkContext";
import { useGasSponsorship } from "@/contexts/GasSponsorshipContext";
import { WalletSelectionModal } from "@/components/WalletSelectionModal";

export default function SettingsPage() {
  const { isConnected, address, isPrivyWallet, isNativeWallet } = useWalletConnection();
  const { network } = useNetwork();
  const {
    sponsorshipEnabled,
    setSponsorshipEnabled,
    sponsorshipStatus,
    refreshStatus,
    loading: sponsorshipLoading,
  } = useGasSponsorship();

  const [isUpdating, setIsUpdating] = useState(false);

  const handleSponsorshipToggle = async (enabled: boolean) => {
    setIsUpdating(true);
    try {
      await setSponsorshipEnabled(enabled);
      toast.success(
        enabled
          ? "Gas sponsorship enabled - transactions will be free!"
          : "Gas sponsorship disabled - you will pay transaction fees"
      );
    } catch (error) {
      toast.error("Failed to update setting");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="container max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <SettingsIcon className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold">Settings</h1>
            <p className="text-muted-foreground">Manage your preferences</p>
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Connect Wallet</p>
            <p className="text-muted-foreground text-center mb-6">
              Connect your wallet to access settings
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

  return (
    <div className="container max-w-3xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-3 mb-8">
        <SettingsIcon className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-display font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Gas Sponsorship Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="w-5 h-5 text-primary" />
              Gas Sponsorship
            </CardTitle>
            <CardDescription>
              Free transactions powered by MVPulse and Shinami
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
              <div className="flex-1">
                <p className="font-medium">Use sponsored gas (free transactions)</p>
                <p className="text-sm text-muted-foreground mt-1">
                  When enabled, transaction fees are covered by MVPulse.
                  You won't need MOVE tokens for gas.
                </p>
              </div>
              <Switch
                checked={sponsorshipEnabled}
                onCheckedChange={handleSponsorshipToggle}
                disabled={isUpdating || sponsorshipLoading}
              />
            </div>

            {/* Daily Usage */}
            {sponsorshipStatus && (
              <div className="p-4 rounded-lg border bg-background">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Daily Usage</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refreshStatus}
                    disabled={sponsorshipLoading}
                    className="h-8 px-2"
                  >
                    <RefreshCcw className={`w-4 h-4 ${sponsorshipLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{
                          width: `${(sponsorshipStatus.dailyUsed / sponsorshipStatus.dailyLimit) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-mono">
                    {sponsorshipStatus.dailyUsed}/{sponsorshipStatus.dailyLimit}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {sponsorshipStatus.remaining > 0
                    ? `${sponsorshipStatus.remaining} sponsored transactions remaining today`
                    : "Daily limit reached - transactions will use your wallet balance"}
                </p>
              </div>
            )}

            {/* Info Banner */}
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription className="text-sm">
                Gas sponsorship covers transaction fees on the Movement network.
                When your daily limit is reached or sponsorship is unavailable,
                transactions will automatically fall back to using your wallet balance.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Wallet Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Connected Wallet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
              <div>
                <p className="text-sm text-muted-foreground">Address</p>
                <p className="font-mono text-sm truncate max-w-[300px]">
                  {address}
                </p>
              </div>
              <Badge variant={isPrivyWallet ? "default" : "secondary"}>
                {isPrivyWallet ? "Privy" : "Native"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Network Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="w-5 h-5" />
              Network
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
              <div>
                <p className="text-sm text-muted-foreground">Current Network</p>
                <p className="font-medium capitalize">{network}</p>
              </div>
              <Badge variant={network === "mainnet" ? "default" : "outline"}>
                {network === "mainnet" ? "Mainnet" : "Testnet"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
