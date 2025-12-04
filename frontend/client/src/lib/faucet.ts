/**
 * Faucet utility for funding new accounts on Movement testnet
 */

const FAUCET_URLS: Record<string, string> = {
  testnet: "https://faucet.testnet.movementnetwork.xyz",
};

// Amount to fund new accounts (1 MOVE = 100,000,000 octas)
const DEFAULT_FUND_AMOUNT = 100_000_000;

interface FaucetResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Fund an account using the Movement testnet faucet
 * @param address - The account address to fund
 * @param network - Network type (currently only testnet is supported)
 * @param amount - Amount in octas (default: 1 MOVE)
 */
export async function fundAccount(
  address: string,
  network: "testnet" | "mainnet" = "testnet",
  amount: number = DEFAULT_FUND_AMOUNT
): Promise<FaucetResult> {
  // Faucet only works on testnet
  if (network !== "testnet") {
    return {
      success: false,
      error: "Faucet is only available on testnet",
    };
  }

  const faucetUrl = FAUCET_URLS[network];
  if (!faucetUrl) {
    return {
      success: false,
      error: `No faucet URL configured for ${network}`,
    };
  }

  try {
    const response = await fetch(
      `${faucetUrl}/mint?address=${address}&amount=${amount}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Faucet request failed: ${errorText}`,
      };
    }

    const data = await response.json();

    // Faucet returns an array of transaction hashes
    const txHash = Array.isArray(data) ? data[0] : data;

    return {
      success: true,
      txHash,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown faucet error",
    };
  }
}

/**
 * Check if an account exists on-chain (has been funded)
 * @param address - The account address to check
 * @param rpcUrl - The RPC endpoint URL
 */
export async function checkAccountExists(
  address: string,
  rpcUrl: string
): Promise<boolean> {
  try {
    const response = await fetch(`${rpcUrl}/accounts/${address}`);
    return response.ok;
  } catch {
    return false;
  }
}
