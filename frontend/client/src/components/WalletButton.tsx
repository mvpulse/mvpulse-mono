import { useEffect, useRef } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { WalletSelectionModal } from "./WalletSelectionModal";
import { Wallet, LogOut, Copy, ExternalLink, Loader2, AlertTriangle, Coins, Settings } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { useNetwork } from "@/contexts/NetworkContext";

export function WalletButton() {
  const { connected, account, disconnect, wallet } = useWallet();
  const {
    isPrivyWallet,
    walletAddress: privyAddress,
    displayName,
    logout: privyLogout,
    isFunding,
    isAccountFunded,
    fundingError,
  } = usePrivyWallet();

  const { network } = useNetwork();

  // Track previous funding state for toast notifications
  const prevIsFunding = useRef(false);
  const prevFundingError = useRef<string | null>(null);

  const isMainnet = network === "mainnet";

  // Show toast when funding completes or fails
  useEffect(() => {
    if (prevIsFunding.current && !isFunding) {
      // Funding just completed
      if (isAccountFunded && !fundingError) {
        toast.success("Wallet Ready!", {
          description: "Your account has been funded with testnet MOVE tokens.",
        });
      }
    }
    prevIsFunding.current = isFunding;
  }, [isFunding, isAccountFunded, fundingError]);

  useEffect(() => {
    if (fundingError && fundingError !== prevFundingError.current) {
      toast.error("Wallet Funding Failed", {
        description: fundingError,
      });
    }
    prevFundingError.current = fundingError;
  }, [fundingError]);

  // Determine which wallet is active
  const isNativeWallet = connected && !isPrivyWallet;
  const activeAddress = isPrivyWallet ? privyAddress : account?.address?.toString();
  const isConnected = isPrivyWallet || isNativeWallet;

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyAddress = () => {
    if (activeAddress) {
      navigator.clipboard.writeText(activeAddress);
      toast.success("Address copied to clipboard");
    }
  };

  const viewOnExplorer = () => {
    if (activeAddress) {
      window.open(
        `https://explorer.movementnetwork.xyz/account/${activeAddress}?network=mainnet`,
        "_blank"
      );
    }
  };

  const handleDisconnect = async () => {
    if (isPrivyWallet) {
      await privyLogout();
      toast.success("Logged out from Privy");
    } else if (isNativeWallet) {
      disconnect();
      toast.success("Wallet disconnected");
    }
  };

  if (!isConnected) {
    return (
      <WalletSelectionModal>
        <Button variant="outline" size="sm" className="gap-2">
          <Wallet className="w-4 h-4" />
          Connect Wallet
        </Button>
      </WalletSelectionModal>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {isFunding ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-muted-foreground">Funding...</span>
            </>
          ) : (
            <>
              {isPrivyWallet ? (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  Privy
                </Badge>
              ) : (
                (wallet as { icon?: string; name?: string } | null)?.icon && (
                  <img src={(wallet as { icon?: string; name?: string }).icon} alt={(wallet as { name?: string }).name || "Wallet"} className="w-4 h-4" />
                )
              )}
              {activeAddress ? truncateAddress(activeAddress) : "Connected"}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {isPrivyWallet && (
          <>
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Signed in as {displayName}
            </div>
            {isMainnet && (
              <div className="px-2 py-2 mx-2 mb-1 text-xs bg-yellow-500/10 border border-yellow-500/30 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <span className="text-yellow-600 dark:text-yellow-400">
                    Mainnet auto-funding coming soon. Please fund your wallet manually.
                  </span>
                </div>
              </div>
            )}
            <DropdownMenuSeparator />
          </>
        )}
        <Link href="/wallet">
          <DropdownMenuItem className="cursor-pointer">
            <Coins className="w-4 h-4 mr-2" />
            Wallet
          </DropdownMenuItem>
        </Link>
        <Link href="/settings">
          <DropdownMenuItem className="cursor-pointer">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </DropdownMenuItem>
        </Link>
        <DropdownMenuItem onClick={copyAddress} className="cursor-pointer">
          <Copy className="w-4 h-4 mr-2" />
          Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem onClick={viewOnExplorer} className="cursor-pointer">
          <ExternalLink className="w-4 h-4 mr-2" />
          View on Explorer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDisconnect}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {isPrivyWallet ? "Logout" : "Disconnect"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
