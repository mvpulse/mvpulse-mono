import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type NetworkType = "testnet" | "mainnet";

interface NetworkConfig {
  name: string;
  contractAddress: string;
  rpcUrl: string;
  chainId: number;
  explorerUrl: string;
}

interface NetworkContextType {
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  config: NetworkConfig;
}

const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig> = {
  testnet: {
    name: "Testnet",
    contractAddress: import.meta.env.VITE_TESTNET_CONTRACT_ADDRESS || "",
    rpcUrl: import.meta.env.VITE_TESTNET_RPC_URL || "https://aptos.testnet.porto.movementlabs.xyz/v1",
    chainId: Number(import.meta.env.VITE_TESTNET_CHAIN_ID) || 177,
    explorerUrl: "https://explorer.movementnetwork.xyz",
  },
  mainnet: {
    name: "Mainnet",
    contractAddress: import.meta.env.VITE_MAINNET_CONTRACT_ADDRESS || "",
    rpcUrl: import.meta.env.VITE_MAINNET_RPC_URL || "https://mainnet.movementnetwork.xyz/v1",
    chainId: Number(import.meta.env.VITE_MAINNET_CHAIN_ID) || 126,
    explorerUrl: "https://explorer.movementnetwork.xyz",
  },
};

const STORAGE_KEY = "movepoll_network";

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<NetworkType>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "mainnet" || stored === "testnet") {
        return stored;
      }
    }
    return "testnet"; // Default to testnet
  });

  const setNetwork = (newNetwork: NetworkType) => {
    setNetworkState(newNetwork);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, newNetwork);
    }
  };

  const config = NETWORK_CONFIGS[network];

  return (
    <NetworkContext.Provider value={{ network, setNetwork, config }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
}

export { NETWORK_CONFIGS };
export type { NetworkConfig };
