import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { useNetwork, NetworkType, NETWORK_CONFIGS } from "@/contexts/NetworkContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Globe } from "lucide-react";
import { toast } from "sonner";

export function NetworkSwitcher() {
  const { network, setNetwork } = useNetwork();
  const { connected, changeNetwork } = useWallet();

  const handleNetworkChange = async (newNetwork: NetworkType) => {
    // Check if mainnet is available
    if (newNetwork === "mainnet" && !NETWORK_CONFIGS.mainnet.contractAddress) {
      toast.error("Mainnet not available", {
        description: "Contract has not been deployed to mainnet yet.",
      });
      return;
    }

    // Update the network context
    setNetwork(newNetwork);

    // If wallet is connected, try to change the network in the wallet
    if (connected && changeNetwork) {
      try {
        // Map to Aptos SDK Network enum
        const aptosNetwork = newNetwork === "mainnet" ? Network.MAINNET : Network.TESTNET;
        await changeNetwork(aptosNetwork);
        toast.success(`Switched to ${NETWORK_CONFIGS[newNetwork].name}`, {
          description: "Wallet network has been updated.",
        });
      } catch (error) {
        console.error("Failed to change wallet network:", error);
        toast.warning(`Switched to ${NETWORK_CONFIGS[newNetwork].name}`, {
          description: "Please manually switch your wallet network.",
        });
      }
    } else {
      toast.success(`Switched to ${NETWORK_CONFIGS[newNetwork].name}`);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={network} onValueChange={(value) => handleNetworkChange(value as NetworkType)}>
        <SelectTrigger className="w-[130px] h-9">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="testnet">
            <div className="flex items-center gap-2">
              <span>Testnet</span>
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                Porto
              </Badge>
            </div>
          </SelectItem>
          <SelectItem value="mainnet" disabled={!NETWORK_CONFIGS.mainnet.contractAddress}>
            <div className="flex items-center gap-2">
              <span>Mainnet</span>
              {!NETWORK_CONFIGS.mainnet.contractAddress && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">
                  Soon
                </Badge>
              )}
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
