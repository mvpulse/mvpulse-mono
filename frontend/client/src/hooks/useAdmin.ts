/**
 * Hook for admin access control
 * Checks if the connected wallet address is in the admin whitelist
 */

import { useMemo } from "react";
import { useWalletConnection } from "@/hooks/useWalletConnection";

/**
 * Get the list of admin addresses from environment variable
 * Format: comma-separated addresses (case-insensitive)
 */
function getAdminAddresses(): string[] {
  const adminAddressesEnv = import.meta.env.VITE_ADMIN_ADDRESSES || "";
  if (!adminAddressesEnv) return [];

  return adminAddressesEnv
    .split(",")
    .map((addr: string) => addr.trim().toLowerCase())
    .filter((addr: string) => addr.length > 0);
}

/**
 * Check if an address is an admin
 */
export function isAdminAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const adminAddresses = getAdminAddresses();
  return adminAddresses.includes(address.toLowerCase());
}

/**
 * Hook for admin access control
 * Returns whether the connected wallet is an admin
 */
export function useAdmin() {
  const { isConnected, address } = useWalletConnection();

  const isAdmin = useMemo(() => {
    if (!isConnected || !address) return false;
    return isAdminAddress(address);
  }, [isConnected, address]);

  const adminAddresses = useMemo(() => getAdminAddresses(), []);

  return {
    isAdmin,
    isConnected,
    address,
    adminAddresses,
  };
}
