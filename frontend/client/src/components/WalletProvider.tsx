import { ReactNode } from "react";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClientProvider } from "@tanstack/react-query";
import { NetworkProvider, useNetwork } from "@/contexts/NetworkContext";
import { queryClient } from "@/lib/queryClient";

interface WalletProviderProps {
  children: ReactNode;
}

// Inner component that uses the network context
function WalletAdapterWrapper({ children }: { children: ReactNode }) {
  const { network } = useNetwork();

  // Map our network type to Aptos SDK Network enum
  const aptosNetwork = network === "mainnet" ? Network.MAINNET : Network.TESTNET;

  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      dappConfig={{
        network: aptosNetwork,
      }}
      onError={(error) => {
        console.error("Wallet error:", error);
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
}

// Main provider that wraps NetworkProvider, PrivyProvider, and WalletAdapter
export function WalletProvider({ children }: WalletProviderProps) {
  const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;

  if (!privyAppId) {
    console.warn("VITE_PRIVY_APP_ID is not set. Privy integration will not work.");
  }

  return (
    <QueryClientProvider client={queryClient}>
      <NetworkProvider>
        <PrivyProvider
          appId={privyAppId || "placeholder"}
          config={{
            loginMethods: ["email", "google", "twitter", "discord", "github"],
            appearance: {
              theme: "dark",
            },
          }}
        >
          <WalletAdapterWrapper>{children}</WalletAdapterWrapper>
        </PrivyProvider>
      </NetworkProvider>
    </QueryClientProvider>
  );
}
