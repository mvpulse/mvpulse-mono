/**
 * Privy transaction utilities for Movement network
 * Handles transaction building, signing, and submission for Privy embedded wallets
 */

import {
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
  Aptos,
} from "@aptos-labs/ts-sdk";

export interface SignRawHashFunction {
  (params: { address: string; chainType: "aptos"; hash: `0x${string}` }): Promise<{
    signature: string;
  }>;
}

export interface TransactionData {
  function: `${string}::${string}::${string}`;
  typeArguments: string[];
  functionArguments: (string | number | boolean | string[] | string[][])[];
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
 * Submit a transaction using Privy wallet signing
 * This is the main function used for all Privy wallet transactions
 */
export async function submitPrivyTransaction(
  aptos: Aptos,
  walletAddress: string,
  publicKeyHex: string,
  signRawHash: SignRawHashFunction,
  transactionData: TransactionData
): Promise<string> {
  try {
    // 1. Build the transaction
    const rawTxn = await aptos.transaction.build.simple({
      sender: walletAddress,
      data: transactionData,
    });

    // 2. Generate signing message
    const message = generateSigningMessageForTransaction(rawTxn);

    // 3. Sign with Privy wallet
    const { signature: rawSignature } = await signRawHash({
      address: walletAddress,
      chainType: "aptos",
      hash: `0x${toHex(message)}`,
    });

    // 4. Create authenticator
    const senderAuthenticator = new AccountAuthenticatorEd25519(
      new Ed25519PublicKey(cleanPublicKey(publicKeyHex)),
      new Ed25519Signature(cleanSignature(rawSignature))
    );

    // 5. Submit the signed transaction
    const committedTransaction = await aptos.transaction.submit.simple({
      transaction: rawTxn,
      senderAuthenticator,
    });

    // 6. Wait for confirmation
    const executed = await aptos.waitForTransaction({
      transactionHash: committedTransaction.hash,
    });

    if (!executed.success) {
      throw new Error("Transaction failed on chain");
    }

    return committedTransaction.hash;
  } catch (error) {
    console.error("Privy transaction error:", error);
    throw error;
  }
}
