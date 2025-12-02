import { ReactNode } from "react";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { NetworkProvider, useNetwork } from "@/contexts/NetworkContext";

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

// Main provider that wraps NetworkProvider around everything
export function WalletProvider({ children }: WalletProviderProps) {
  return (
    <NetworkProvider>
      <WalletAdapterWrapper>{children}</WalletAdapterWrapper>
    </NetworkProvider>
  );
}
