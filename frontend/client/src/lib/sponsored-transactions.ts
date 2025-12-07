/**
 * Sponsored transaction utilities for Movement network
 * Supports both Privy embedded wallets and native Aptos wallets via Shinami Gas Station
 */

import {
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
  SimpleTransaction,
  Aptos,
  AccountAuthenticator,
} from "@aptos-labs/ts-sdk";

export interface SponsoredTransactionResult {
  hash: string;
  sponsored: boolean;
}

export interface TransactionData {
  function: `${string}::${string}::${string}`;
  typeArguments: string[];
  functionArguments: (string | number | boolean | string[])[];
}

export interface SignRawHashFunction {
  (params: { address: string; chainType: "aptos"; hash: `0x${string}` }): Promise<{
    signature: string;
  }>;
}

// Native wallet signTransaction return type (from wallet adapter)
export interface NativeSignTransactionResult {
  authenticator: AccountAuthenticator;
  rawTransaction: Uint8Array;
}

export type NativeSignTransactionFunction = (args: {
  transactionOrPayload: any;
  asFeePayer?: boolean;
}) => Promise<NativeSignTransactionResult>;

export interface SponsorshipResponse {
  success: boolean;
  transactionHash?: string;
  fallbackRequired?: boolean;
  error?: string;
  reason?: string;
  dailyUsed?: number;
  dailyLimit?: number;
}

/**
 * Convert a Uint8Array to hex string
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Clean public key - remove 0x prefix and handle 33-byte keys
 */
function cleanPublicKey(publicKeyHex: string): string {
  let clean = publicKeyHex.startsWith("0x") ? publicKeyHex.slice(2) : publicKeyHex;
  // If public key is 66 characters (33 bytes), remove the first byte (00 prefix)
  if (clean.length === 66) {
    clean = clean.slice(2);
  }
  return clean;
}

/**
 * Clean signature - remove 0x prefix
 */
function cleanSignature(signature: string): string {
  return signature.startsWith("0x") ? signature.slice(2) : signature;
}

/**
 * Build a fee-payer transaction for sponsorship
 */
async function buildFeePayerTransaction(
  aptos: Aptos,
  sender: string,
  data: TransactionData
) {
  return await aptos.transaction.build.simple({
    sender,
    withFeePayer: true,
    data,
  });
}

/**
 * Submit transaction to sponsorship backend
 */
async function submitToSponsor(
  serializedTransaction: string,
  senderSignature: string,
  senderAddress: string,
  network: "testnet" | "mainnet"
): Promise<SponsorshipResponse> {
  try {
    const response = await fetch("/api/sponsor-transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serializedTransaction,
        senderSignature,
        senderAddress,
        network,
      }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Sponsorship request failed:", error);
    return {
      success: false,
      fallbackRequired: true,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Submit sponsored transaction for PRIVY wallet
 */
export async function submitPrivySponsoredTransaction(
  aptos: Aptos,
  walletAddress: string,
  publicKeyHex: string,
  signRawHash: SignRawHashFunction,
  transactionData: TransactionData,
  network: "testnet" | "mainnet"
): Promise<SponsoredTransactionResult> {
  // 1. Build fee-payer transaction
  const rawTxn = await buildFeePayerTransaction(aptos, walletAddress, transactionData);

  // 2. Generate signing message and sign with Privy
  const message = generateSigningMessageForTransaction(rawTxn);
  const { signature: rawSignature } = await signRawHash({
    address: walletAddress,
    chainType: "aptos",
    hash: `0x${toHex(message)}`,
  });

  // 3. Create authenticator
  const senderAuthenticator = new AccountAuthenticatorEd25519(
    new Ed25519PublicKey(cleanPublicKey(publicKeyHex)),
    new Ed25519Signature(cleanSignature(rawSignature))
  );

  // 4. Serialize for backend
  const simpleTransaction = new SimpleTransaction(rawTxn.rawTransaction);
  const serializedTransaction = simpleTransaction.bcsToHex().toString();
  const serializedSignature = senderAuthenticator.bcsToHex().toString();

  // 5. Submit to sponsorship backend
  const result = await submitToSponsor(
    serializedTransaction,
    serializedSignature,
    walletAddress,
    network
  );

  if (!result.success || result.fallbackRequired) {
    throw new Error(result.error || result.reason || "Sponsorship failed");
  }

  // 6. Wait for confirmation
  const executed = await aptos.waitForTransaction({
    transactionHash: result.transactionHash!,
  });

  if (!executed.success) {
    throw new Error("Transaction failed on chain");
  }

  return {
    hash: result.transactionHash!,
    sponsored: true,
  };
}

/**
 * Submit sponsored transaction for NATIVE wallet (Petra, Nightly, etc.)
 */
export async function submitNativeSponsoredTransaction(
  aptos: Aptos,
  walletAddress: string,
  signTransaction: NativeSignTransactionFunction,
  transactionData: TransactionData,
  network: "testnet" | "mainnet"
): Promise<SponsoredTransactionResult> {
  // 1. Build fee-payer transaction
  const rawTxn = await buildFeePayerTransaction(aptos, walletAddress, transactionData);

  // 2. Sign with native wallet (returns AccountAuthenticator directly!)
  const { authenticator } = await signTransaction({
    transactionOrPayload: rawTxn,
    asFeePayer: false, // We're the sender, not the fee payer
  });

  // 3. Serialize for backend
  const simpleTransaction = new SimpleTransaction(rawTxn.rawTransaction);
  const serializedTransaction = simpleTransaction.bcsToHex().toString();
  const serializedSignature = authenticator.bcsToHex().toString();

  // 4. Submit to sponsorship backend
  const result = await submitToSponsor(
    serializedTransaction,
    serializedSignature,
    walletAddress,
    network
  );

  if (!result.success || result.fallbackRequired) {
    throw new Error(result.error || result.reason || "Sponsorship failed");
  }

  // 5. Wait for confirmation
  const executed = await aptos.waitForTransaction({
    transactionHash: result.transactionHash!,
  });

  if (!executed.success) {
    throw new Error("Transaction failed on chain");
  }

  return {
    hash: result.transactionHash!,
    sponsored: true,
  };
}

/**
 * Check if sponsorship is available for an address
 */
export async function checkSponsorshipAvailability(
  walletAddress: string,
  network: "testnet" | "mainnet"
): Promise<{ available: boolean; dailyUsed: number; dailyLimit: number }> {
  try {
    const response = await fetch(
      `/api/sponsorship-status?address=${walletAddress}&network=${network}`
    );
    const result = await response.json();
    return {
      available: result.success && result.remaining > 0,
      dailyUsed: result.dailyUsed || 0,
      dailyLimit: result.dailyLimit || 50,
    };
  } catch {
    return { available: false, dailyUsed: 0, dailyLimit: 50 };
  }
}
