/**
 * Centralized transaction feedback utilities
 * Provides consistent toast notifications for all transaction types
 */

import { toast } from "sonner";

/**
 * Show a success toast for completed transactions
 * Includes a "View TX" action button linking to the block explorer
 */
export function showTransactionSuccessToast(
  hash: string,
  message: string,
  description: string,
  explorerUrl: string,
  sponsored?: boolean
): void {
  const finalDescription = sponsored
    ? `${description} (Gas Sponsored)`
    : description;

  toast.success(message, {
    description: finalDescription,
    action: {
      label: "View TX",
      onClick: () => window.open(`${explorerUrl}/txn/${hash}?network=testnet`, "_blank"),
    },
  });
}

/**
 * Show an error toast for failed transactions
 */
export function showTransactionErrorToast(
  message: string,
  error: Error | string
): void {
  toast.error(message, {
    description: typeof error === "string" ? error : error.message,
  });
}
