/**
 * Token configuration for MVPulse
 * Supports multiple coin types (MOVE, PULSE)
 */

export const COIN_TYPES = {
  MOVE: 0,
  PULSE: 1,
} as const;

export type CoinTypeId = (typeof COIN_TYPES)[keyof typeof COIN_TYPES];

// Network-specific PULSE contract addresses
const PULSE_ADDRESSES: Record<"testnet" | "mainnet", string> = {
  testnet: import.meta.env.VITE_TESTNET_PULSE_CONTRACT_ADDRESS || "",
  mainnet: import.meta.env.VITE_MAINNET_PULSE_CONTRACT_ADDRESS || "",
};

/**
 * Get the full type argument string for a coin type
 * @param coinTypeId - The coin type identifier (0 = MOVE, 1 = PULSE)
 * @param network - The network (testnet or mainnet)
 * @returns The full type argument string for Move transactions
 */
export function getCoinTypeArg(
  coinTypeId: CoinTypeId,
  network: "testnet" | "mainnet"
): string {
  if (coinTypeId === COIN_TYPES.MOVE) {
    return "0x1::aptos_coin::AptosCoin";
  }
  const pulseAddress = PULSE_ADDRESSES[network];
  if (!pulseAddress) {
    console.warn(`PULSE contract address not configured for ${network}`);
    return "";
  }
  return `${pulseAddress}::pulse::PULSE`;
}

/**
 * Get the display symbol for a coin type
 */
export function getCoinSymbol(coinTypeId: CoinTypeId): string {
  return coinTypeId === COIN_TYPES.MOVE ? "MOVE" : "PULSE";
}

/**
 * Get the full display name for a coin type
 */
export function getCoinName(coinTypeId: CoinTypeId): string {
  return coinTypeId === COIN_TYPES.MOVE ? "Move Token" : "Pulse Token";
}

/**
 * Token metadata for display purposes
 */
export const COIN_METADATA: Record<
  CoinTypeId,
  {
    id: CoinTypeId;
    symbol: string;
    name: string;
    decimals: number;
    description: string;
  }
> = {
  [COIN_TYPES.MOVE]: {
    id: COIN_TYPES.MOVE,
    symbol: "MOVE",
    name: "Move Token",
    decimals: 8,
    description: "Native token of Movement Network",
  },
  [COIN_TYPES.PULSE]: {
    id: COIN_TYPES.PULSE,
    symbol: "PULSE",
    name: "Pulse Token",
    decimals: 8,
    description: "MVPulse governance and rewards token",
  },
};

/**
 * Get all supported coin types
 */
export function getSupportedCoinTypes(): typeof COIN_METADATA {
  return COIN_METADATA;
}

/**
 * Check if a coin type ID is valid
 */
export function isValidCoinType(coinTypeId: number): coinTypeId is CoinTypeId {
  return coinTypeId === COIN_TYPES.MOVE || coinTypeId === COIN_TYPES.PULSE;
}

/**
 * Get the resource type for balance queries
 * @param coinTypeId - The coin type identifier
 * @param network - The network (testnet or mainnet)
 * @returns The CoinStore resource type for API queries
 */
export function getCoinStoreType(
  coinTypeId: CoinTypeId,
  network: "testnet" | "mainnet"
): string {
  const coinTypeArg = getCoinTypeArg(coinTypeId, network);
  return `0x1::coin::CoinStore<${coinTypeArg}>`;
}
