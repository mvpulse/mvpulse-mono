import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useNetwork } from "@/contexts/NetworkContext";

interface SponsorshipStatus {
  dailyUsed: number;
  dailyLimit: number;
  remaining: number;
  enabled: boolean;
}

interface GasSponsorshipContextType {
  sponsorshipEnabled: boolean;
  setSponsorshipEnabled: (enabled: boolean) => Promise<void>;
  sponsorshipStatus: SponsorshipStatus | null;
  refreshStatus: () => Promise<void>;
  loading: boolean;
}

const GasSponsorshipContext = createContext<GasSponsorshipContextType | null>(null);

const LOCAL_STORAGE_KEY = "mvpulse-gas-sponsorship-enabled";

export function GasSponsorshipProvider({ children }: { children: ReactNode }) {
  const { isConnected, address } = useWalletConnection();
  const { network } = useNetwork();

  const [sponsorshipEnabled, setSponsorshipEnabledState] = useState<boolean>(() => {
    // Initialize from localStorage, default to true
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored !== null ? stored === "true" : true;
  });
  const [sponsorshipStatus, setSponsorshipStatus] = useState<SponsorshipStatus | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch sponsorship status from backend
  const refreshStatus = useCallback(async () => {
    if (!isConnected || !address) {
      setSponsorshipStatus(null);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `/api/sponsorship-status?address=${address}&network=${network}`
      );
      const data = await response.json();

      if (data.success) {
        setSponsorshipStatus({
          dailyUsed: data.dailyUsed,
          dailyLimit: data.dailyLimit,
          remaining: data.remaining,
          enabled: data.enabled,
        });
        // Sync with backend preference
        if (data.enabled !== undefined) {
          setSponsorshipEnabledState(data.enabled);
          localStorage.setItem(LOCAL_STORAGE_KEY, String(data.enabled));
        }
      }
    } catch (error) {
      console.error("Failed to fetch sponsorship status:", error);
    } finally {
      setLoading(false);
    }
  }, [isConnected, address, network]);

  // Refresh status when wallet connects or network changes
  useEffect(() => {
    if (isConnected && address) {
      refreshStatus();
    }
  }, [isConnected, address, network, refreshStatus]);

  // Update sponsorship preference
  const setSponsorshipEnabled = useCallback(async (enabled: boolean) => {
    // Update local state immediately for responsiveness
    setSponsorshipEnabledState(enabled);
    localStorage.setItem(LOCAL_STORAGE_KEY, String(enabled));

    // Persist to backend if connected
    if (isConnected && address) {
      try {
        await fetch(`/api/user/settings/${address}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gasSponsorshipEnabled: enabled }),
        });
      } catch (error) {
        console.error("Failed to save sponsorship preference:", error);
        // Revert on error
        setSponsorshipEnabledState(!enabled);
        localStorage.setItem(LOCAL_STORAGE_KEY, String(!enabled));
      }
    }
  }, [isConnected, address]);

  return (
    <GasSponsorshipContext.Provider
      value={{
        sponsorshipEnabled,
        setSponsorshipEnabled,
        sponsorshipStatus,
        refreshStatus,
        loading,
      }}
    >
      {children}
    </GasSponsorshipContext.Provider>
  );
}

export function useGasSponsorship() {
  const context = useContext(GasSponsorshipContext);
  if (!context) {
    throw new Error("useGasSponsorship must be used within a GasSponsorshipProvider");
  }
  return context;
}
