import { Aptos, AptosConfig } from "@aptos-labs/ts-sdk";
import type { NetworkConfig } from "@/contexts/NetworkContext";

// Module name for the poll contract
export const MODULE_NAME = "poll";

// Create an Aptos client for the given network config
export function createAptosClient(config: NetworkConfig): Aptos {
  const aptosConfig = new AptosConfig({
    fullnode: config.rpcUrl,
  });
  return new Aptos(aptosConfig);
}

// Build the full function ID for contract calls
export function getFunctionId(
  contractAddress: string,
  functionName: string
): `${string}::${string}::${string}` {
  return `${contractAddress}::${MODULE_NAME}::${functionName}`;
}

// Poll status constants (matching the Move contract)
export const POLL_STATUS = {
  ACTIVE: 0,
  CLOSED: 1,
} as const;

// Helper to format poll status
export function formatPollStatus(status: number): string {
  switch (status) {
    case POLL_STATUS.ACTIVE:
      return "active";
    case POLL_STATUS.CLOSED:
      return "closed";
    default:
      return "unknown";
  }
}

// Helper to check if poll is active
export function isPollActive(poll: { status: number; end_time: number }): boolean {
  const now = Math.floor(Date.now() / 1000);
  return poll.status === POLL_STATUS.ACTIVE && poll.end_time > now;
}

// Helper to format time remaining
export function formatTimeRemaining(endTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTime - now;

  if (remaining <= 0) {
    return "Ended";
  }

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h left`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  } else {
    return `${minutes}m left`;
  }
}

// Helper to truncate address
export function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
