import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/extended-chains";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { createMovementWallet, getMovementWallet } from "@/lib/privy-movement";
import { useNetwork } from "@/contexts/NetworkContext";

// Type extension for wallet adapter wallets with name/icon properties
type WalletWithMeta = { name: string; icon?: string };

interface WalletSelectionModalProps {
  children: React.ReactNode;
}

export function WalletSelectionModal({ children }: WalletSelectionModalProps) {
  const [open, setOpen] = useState(false);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const { wallets, connect } = useWallet();
  const { ready, authenticated, user } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { network } = useNetwork();

  const isMainnet = network === "mainnet";

  // Check for Movement wallet
  const movementWallet = getMovementWallet(user);

  // Filter and sort wallets - prioritize Nightly
  // Cast wallets to include name/icon properties from the base Wallet interface
  const filteredWallets = (wallets as unknown as WalletWithMeta[])
    .filter((wallet, index, self) => {
      // Remove duplicates based on wallet name
      return index === self.findIndex((w) => w.name === wallet.name);
    })
    .sort((a, b) => {
      // Nightly always first
      if (a.name.toLowerCase().includes("nightly")) return -1;
      if (b.name.toLowerCase().includes("nightly")) return 1;
      return 0;
    });

  const handleWalletSelect = async (walletName: string) => {
    try {
      await connect(walletName);
      setOpen(false);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  };

  const handleWalletCreation = async (privyUser: typeof user) => {
    try {
      setIsCreatingWallet(true);
      // Cast createWallet to match the expected type
      await createMovementWallet(
        privyUser as any,
        createWallet as (params: { chainType: "aptos" }) => Promise<any>
      );
      setOpen(false);
    } catch (error) {
      console.error("Wallet creation error:", error);
    } finally {
      setIsCreatingWallet(false);
    }
  };

  const { login } = useLogin({
    onComplete: async ({ user: loginUser }) => {
      try {
        await handleWalletCreation(loginUser);
      } catch (error) {
        console.error("Error in login completion:", error);
        setIsCreatingWallet(false);
      }
    },
    onError: (error) => {
      console.error("Login failed:", error);
      setIsCreatingWallet(false);
    },
  });

  const handlePrivyLogin = async () => {
    try {
      setIsCreatingWallet(true);

      if (!authenticated) {
        await login({
          loginMethods: ["email", "twitter", "google", "github", "discord"],
          disableSignup: false,
        });
      } else {
        // User is already authenticated, just create wallet
        await handleWalletCreation(user);
      }
    } catch (error) {
      console.error("Privy login error:", error);
      setIsCreatingWallet(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Choose a wallet to connect to Movement Network
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Privy Social Login Option */}
          <div className="space-y-3">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-1">Login with Privy</h3>
              <p className="text-sm text-muted-foreground">
                Secure social login with automatic wallet creation
              </p>
            </div>

            {/* Mainnet Warning */}
            {isMainnet && (
              <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <AlertDescription className="text-yellow-600 dark:text-yellow-400 text-sm">
                  <strong>Mainnet Notice:</strong> Auto-funding for Privy wallets is coming soon.
                  You'll need to manually fund your wallet with MOVE tokens after connecting.
                </AlertDescription>
              </Alert>
            )}

            <Button
              variant="default"
              className="w-full justify-center h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium"
              onClick={handlePrivyLogin}
              disabled={isCreatingWallet || !ready}
            >
              {isCreatingWallet ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Setting up wallet...</span>
                </div>
              ) : authenticated && movementWallet ? (
                <span>Wallet Connected</span>
              ) : authenticated ? (
                <span>Setup Movement Wallet</span>
              ) : (
                <span>Continue with Privy</span>
              )}
            </Button>

            {authenticated && user && (
              <div className="space-y-2">
                {/* User Authentication Status */}
                <div className="text-sm text-muted-foreground text-center bg-muted/50 p-3 rounded-lg">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>
                      Authenticated as:{" "}
                      {user.email?.address || user.phone?.number || "User"}
                    </span>
                  </div>
                </div>

                {/* Movement Wallet Status */}
                {movementWallet ? (
                  <div className="text-sm text-center bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 rounded-lg">
                    <div className="flex items-center justify-center space-x-2 mb-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="font-medium text-blue-700 dark:text-blue-300">
                        Movement Wallet Connected
                      </span>
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-mono">
                      {movementWallet.address?.slice(0, 6)}...
                      {movementWallet.address?.slice(-4)}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-center bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-3 rounded-lg">
                    <div className="flex items-center justify-center space-x-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span className="text-orange-700 dark:text-orange-300">
                        Click above to create Movement Wallet
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative my-4">
            <Separator />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-background px-2 text-xs text-muted-foreground">
                OR
              </span>
            </div>
          </div>

          {/* Native Wallet Options */}
          <div className="space-y-3">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-1">Connect Native Wallet</h3>
              <p className="text-xs text-muted-foreground">
                Use your existing Aptos wallet
              </p>
            </div>
            <div className="space-y-2">
              {filteredWallets.length === 0 ? (
                <div className="text-center py-4 border border-dashed rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">
                    No wallets detected
                  </p>
                  <a
                    href="https://nightly.app/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    Install Nightly Wallet
                  </a>
                </div>
              ) : (
                filteredWallets.map((wallet) => (
                  <Button
                    key={wallet.name}
                    variant="outline"
                    className="w-full justify-start h-12 hover:bg-accent"
                    onClick={() => handleWalletSelect(wallet.name)}
                  >
                    <div className="flex items-center space-x-3">
                      {wallet.icon && (
                        <img
                          src={wallet.icon}
                          alt={wallet.name}
                          className="w-6 h-6 rounded"
                        />
                      )}
                      <span className="font-medium">{wallet.name}</span>
                    </div>
                  </Button>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
