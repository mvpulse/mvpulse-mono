/**
 * Token configuration for MVPulse
 * Supports multiple coin types (MOVE as legacy coin, PULSE and USDC as Fungible Assets)
 */

export const COIN_TYPES = {
  MOVE: 0,
  PULSE: 1,
  USDC: 2,
} as const;

export type CoinTypeId = (typeof COIN_TYPES)[keyof typeof COIN_TYPES];

// Token standard types
export type TokenStandard = "legacy_coin" | "fungible_asset";

// Network-specific contract addresses
const PULSE_ADDRESSES: Record<"testnet" | "mainnet", string> = {
  testnet: import.meta.env.VITE_TESTNET_PULSE_CONTRACT_ADDRESS || "",
  mainnet: import.meta.env.VITE_MAINNET_PULSE_CONTRACT_ADDRESS || "",
};

// PULSE FA Metadata addresses (different from contract address)
const PULSE_METADATA_ADDRESSES: Record<"testnet" | "mainnet", string> = {
  testnet: import.meta.env.VITE_TESTNET_PULSE_METADATA_ADDRESS || "",
  mainnet: import.meta.env.VITE_MAINNET_PULSE_METADATA_ADDRESS || "",
};

const USDC_ADDRESSES: Record<"testnet" | "mainnet", string> = {
  testnet: import.meta.env.VITE_TESTNET_USDC_CONTRACT_ADDRESS || "",
  mainnet: import.meta.env.VITE_MAINNET_USDC_CONTRACT_ADDRESS || "",
};

const SWAP_ADDRESSES: Record<"testnet" | "mainnet", string> = {
  testnet: import.meta.env.VITE_TESTNET_SWAP_CONTRACT_ADDRESS || "",
  mainnet: import.meta.env.VITE_MAINNET_SWAP_CONTRACT_ADDRESS || "",
};

const STAKING_ADDRESSES: Record<"testnet" | "mainnet", string> = {
  testnet: import.meta.env.VITE_TESTNET_STAKING_CONTRACT_ADDRESS || "",
  mainnet: import.meta.env.VITE_MAINNET_STAKING_CONTRACT_ADDRESS || "",
};

/**
 * Check if a token uses the Fungible Asset standard
 * MOVE uses legacy coin, PULSE and USDC use Fungible Asset
 */
export function getTokenStandard(coinTypeId: CoinTypeId): TokenStandard {
  switch (coinTypeId) {
    case COIN_TYPES.MOVE:
      return "legacy_coin";
    case COIN_TYPES.PULSE:
    case COIN_TYPES.USDC:
      return "fungible_asset";
    default:
      return "legacy_coin";
  }
}

/**
 * Get the FA metadata address for a Fungible Asset token
 * For PULSE: Returns the metadata object address (created via named_object)
 * For USDC: Returns the contract address (USDC.e FA metadata is at its contract address)
 */
export function getFAMetadataAddress(
  coinTypeId: CoinTypeId,
  network: "testnet" | "mainnet"
): string {
  switch (coinTypeId) {
    case COIN_TYPES.PULSE: {
      // PULSE FA metadata is at a named object address (not the contract address)
      const pulseMetadataAddress = PULSE_METADATA_ADDRESSES[network];
      return pulseMetadataAddress || "";
    }
    case COIN_TYPES.USDC: {
      // USDC.e FA metadata is at the contract address itself
      const usdcAddress = USDC_ADDRESSES[network];
      return usdcAddress || "";
    }
    default:
      return "";
  }
}

/**
 * Get the full type argument string for a coin type
 * Only applicable for legacy coins (MOVE)
 * @param coinTypeId - The coin type identifier (0 = MOVE, 1 = PULSE, 2 = USDC)
 * @param network - The network (testnet or mainnet)
 * @returns The full type argument string for Move transactions
 */
export function getCoinTypeArg(
  coinTypeId: CoinTypeId,
  network: "testnet" | "mainnet"
): string {
  switch (coinTypeId) {
    case COIN_TYPES.MOVE:
      return "0x1::aptos_coin::AptosCoin";
    case COIN_TYPES.PULSE: {
      // PULSE is now FA, but we still need this for some APIs
      const pulseAddress = PULSE_ADDRESSES[network];
      if (!pulseAddress) {
        console.warn(`PULSE contract address not configured for ${network}`);
        return "";
      }
      return pulseAddress; // Return just the address for FA
    }
    case COIN_TYPES.USDC: {
      const usdcAddress = USDC_ADDRESSES[network];
      if (!usdcAddress) {
        console.warn(`USDC contract address not configured for ${network}`);
        return "";
      }
      return usdcAddress; // Return just the address for FA
    }
    default:
      return "";
  }
}

/**
 * Get the PULSE contract address for a network
 */
export function getPulseContractAddress(network: "testnet" | "mainnet"): string {
  return PULSE_ADDRESSES[network];
}

/**
 * Get the USDC contract address for a network
 */
export function getUsdcContractAddress(network: "testnet" | "mainnet"): string {
  return USDC_ADDRESSES[network];
}

/**
 * Get the display symbol for a coin type
 */
export function getCoinSymbol(coinTypeId: CoinTypeId): string {
  switch (coinTypeId) {
    case COIN_TYPES.MOVE:
      return "MOVE";
    case COIN_TYPES.PULSE:
      return "PULSE";
    case COIN_TYPES.USDC:
      return "USDC";
    default:
      return "UNKNOWN";
  }
}

/**
 * Get the full display name for a coin type
 */
export function getCoinName(coinTypeId: CoinTypeId): string {
  switch (coinTypeId) {
    case COIN_TYPES.MOVE:
      return "Move Token";
    case COIN_TYPES.PULSE:
      return "Pulse Token";
    case COIN_TYPES.USDC:
      return "USD Coin";
    default:
      return "Unknown Token";
  }
}

/**
 * Get the number of decimals for a coin type
 */
export function getCoinDecimals(coinTypeId: CoinTypeId): number {
  switch (coinTypeId) {
    case COIN_TYPES.MOVE:
      return 8;
    case COIN_TYPES.PULSE:
      return 8;
    case COIN_TYPES.USDC:
      return 6; // USDC uses 6 decimals
    default:
      return 8;
  }
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
    standard: TokenStandard;
  }
> = {
  [COIN_TYPES.MOVE]: {
    id: COIN_TYPES.MOVE,
    symbol: "MOVE",
    name: "Move Token",
    decimals: 8,
    description: "Native token of Movement Network",
    standard: "legacy_coin",
  },
  [COIN_TYPES.PULSE]: {
    id: COIN_TYPES.PULSE,
    symbol: "PULSE",
    name: "Pulse Token",
    decimals: 8,
    description: "MVPulse governance and rewards token",
    standard: "fungible_asset",
  },
  [COIN_TYPES.USDC]: {
    id: COIN_TYPES.USDC,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    description: "USD-pegged stablecoin",
    standard: "fungible_asset",
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
  return (
    coinTypeId === COIN_TYPES.MOVE ||
    coinTypeId === COIN_TYPES.PULSE ||
    coinTypeId === COIN_TYPES.USDC
  );
}

/**
 * Get the resource type for balance queries
 * Only for legacy coins (MOVE)
 * @param coinTypeId - The coin type identifier
 * @param network - The network (testnet or mainnet)
 * @returns The CoinStore resource type for API queries
 */
export function getCoinStoreType(
  coinTypeId: CoinTypeId,
  network: "testnet" | "mainnet"
): string {
  if (getTokenStandard(coinTypeId) !== "legacy_coin") {
    console.warn(`getCoinStoreType called for FA token ${getCoinSymbol(coinTypeId)}`);
    return "";
  }
  const coinTypeArg = getCoinTypeArg(coinTypeId, network);
  return `0x1::coin::CoinStore<${coinTypeArg}>`;
}

/**
 * Get the swap contract address for a network
 */
export function getSwapContractAddress(network: "testnet" | "mainnet"): string {
  return SWAP_ADDRESSES[network];
}

/**
 * Get the staking contract address for a network
 */
export function getStakingContractAddress(network: "testnet" | "mainnet"): string {
  return STAKING_ADDRESSES[network];
}
