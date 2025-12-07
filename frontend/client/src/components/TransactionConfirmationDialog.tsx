/**
 * Transaction Confirmation Dialog for Privy wallets
 * Shows transaction details before execution since Privy signs silently
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";

export interface TransactionDetail {
  label: string;
  value: string;
}

export interface TransactionConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
  title: string;
  description: string;
  amount: number;
  tokenSymbol: string;
  details?: TransactionDetail[];
}

export function TransactionConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  isLoading,
  title,
  description,
  amount,
  tokenSymbol,
  details,
}: TransactionConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning Banner */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              You are about to transfer funds from your wallet. Please review the details below.
            </p>
          </div>

          {/* Transaction Summary */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="font-mono font-semibold text-lg">
                {amount.toFixed(4)} {tokenSymbol}
              </span>
            </div>
          </div>

          {/* Additional Details */}
          {details && details.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Details</p>
              <div className="rounded-lg border bg-background p-3 space-y-2">
                {details.map((detail, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{detail.label}</span>
                    <span className="font-mono">{detail.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Confirm Transfer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
