/**
 * Privy Movement wallet utilities
 * Handles wallet creation and retrieval for Privy embedded wallets
 */

export interface PrivyLinkedAccount {
  type: string;
  chainType?: string;
  address?: string;
  publicKey?: string;
}

export interface PrivyUser {
  id: string;
  email?: { address: string };
  phone?: { number: string };
  linkedAccounts?: PrivyLinkedAccount[];
}

export interface MovementWallet {
  address: string;
  publicKey: string;
}

/**
 * Get the Movement (Aptos) wallet from a Privy user's linked accounts
 */
export function getMovementWallet(user: PrivyUser | null | undefined): MovementWallet | null {
  if (!user?.linkedAccounts) return null;

  const wallet = user.linkedAccounts.find(
    (account) => account.type === "wallet" && account.chainType === "aptos"
  );

  if (!wallet?.address || !wallet?.publicKey) return null;

  return {
    address: wallet.address,
    publicKey: wallet.publicKey,
  };
}

/**
 * Create a Movement wallet for the user if they don't already have one
 * Note: Uses 'any' for createWallet to match Privy's flexible typing
 */
export async function createMovementWallet(
  user: PrivyUser | null | undefined,
  createWallet: (params: { chainType: "aptos" }) => Promise<any>
): Promise<MovementWallet | null> {
  if (!user) return null;

  // Check if user already has a Movement wallet
  const existingWallet = getMovementWallet(user);
  if (existingWallet) {
    return existingWallet;
  }

  // Create new wallet
  try {
    const newWallet = await createWallet({ chainType: "aptos" });
    return {
      address: newWallet.address,
      publicKey: newWallet.publicKey,
    };
  } catch (error) {
    console.error("Failed to create Movement wallet:", error);
    throw error;
  }
}

/**
 * Get user display name from Privy user object
 */
export function getPrivyUserDisplayName(user: PrivyUser | null): string {
  if (!user) return "User";
  return user.email?.address || user.phone?.number || "User";
}
