/**
 * Balance fetching utilities for Movement network
 */

export interface AccountBalance {
  balance: number; // In octas (1 MOVE = 100,000,000 octas)
  balanceFormatted: string; // Human readable format
  exists: boolean;
}

/**
 * Fetch the MOVE balance for an account
 * @param address - The account address
 * @param rpcUrl - The RPC endpoint URL
 */
export async function getAccountBalance(
  address: string,
  rpcUrl: string
): Promise<AccountBalance> {
  try {
    const response = await fetch(
      `${rpcUrl}/accounts/${address}/resource/0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>`
    );

    if (!response.ok) {
      if (response.status === 404) {
        // Account doesn't exist or has no coins
        return {
          balance: 0,
          balanceFormatted: "0.0000",
          exists: false,
        };
      }
      throw new Error(`Failed to fetch balance: ${response.statusText}`);
    }

    const data = await response.json();
    const balance = parseInt(data.data.coin.value, 10);

    return {
      balance,
      balanceFormatted: formatBalance(balance),
      exists: true,
    };
  } catch (error) {
    console.error("Error fetching balance:", error);
    return {
      balance: 0,
      balanceFormatted: "0.0000",
      exists: false,
    };
  }
}

/**
 * Format balance from octas to MOVE with proper decimals
 * @param octas - Balance in octas
 * @param decimals - Number of decimal places (default: 4)
 */
export function formatBalance(octas: number, decimals: number = 4): string {
  const move = octas / 100_000_000;
  return move.toFixed(decimals);
}

/**
 * Parse MOVE amount to octas
 * @param move - Amount in MOVE
 */
export function parseToOctas(move: number): number {
  return Math.floor(move * 100_000_000);
}
