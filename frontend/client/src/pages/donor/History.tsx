import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { DonorLayout } from "@/components/layouts/DonorLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  ExternalLink,
  Compass,
  Coins,
  Calendar,
} from "lucide-react";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useNetwork } from "@/contexts/NetworkContext";
import { getCoinSymbol, type CoinTypeId } from "@/lib/tokens";

// Local storage key for tracking user's fundings
const FUNDING_HISTORY_KEY = "mvpulse_funding_history";

interface FundingRecord {
  pollId: number;
  amount: number;
  coinTypeId: number;
  timestamp: number;
  txHash: string;
}

function getFundingHistory(address: string): FundingRecord[] {
  try {
    const data = localStorage.getItem(`${FUNDING_HISTORY_KEY}_${address}`);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortenHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export default function DonorHistory() {
  const { isConnected, address } = useWalletConnection();
  const { config } = useNetwork();

  const [fundingHistory, setFundingHistory] = useState<FundingRecord[]>([]);

  // Load funding history from local storage
  useEffect(() => {
    if (address) {
      setFundingHistory(getFundingHistory(address));
    }
  }, [address]);

  // Calculate totals by token
  const totalsByToken = useMemo(() => {
    const totals: Record<string, number> = {};
    fundingHistory.forEach((f) => {
      const coinSymbol = getCoinSymbol(f.coinTypeId as CoinTypeId);
      totals[coinSymbol] = (totals[coinSymbol] || 0) + (f.amount / 1e8);
    });
    return totals;
  }, [fundingHistory]);

  if (!isConnected) {
    return (
      <DonorLayout title="Funding History" description="Your contribution transaction history">
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-600 dark:text-yellow-400">
              Please connect your wallet to view your funding history.
            </p>
          </CardContent>
        </Card>
      </DonorLayout>
    );
  }

  return (
    <DonorLayout title="Funding History" description="Your contribution transaction history">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total Contributions</p>
              <Coins className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold font-mono mt-2">{fundingHistory.length}</p>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        {Object.entries(totalsByToken).map(([token, amount]) => (
          <Card key={token} className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Total {token}</p>
                <Badge variant="outline">{token}</Badge>
              </div>
              <p className="text-3xl font-bold font-mono mt-2">{amount.toFixed(4)}</p>
              <p className="text-xs text-muted-foreground mt-1">Contributed</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* History Table */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fundingHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">
                No funding history yet.
              </p>
              <Link href="/donor/explore">
                <Button>
                  <Compass className="w-4 h-4 mr-2" /> Explore Polls
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Poll ID</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Transaction</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fundingHistory.map((record, index) => {
                    const coinSymbol = getCoinSymbol(record.coinTypeId as CoinTypeId);
                    return (
                      <TableRow key={`${record.txHash}-${index}`}>
                        <TableCell className="text-muted-foreground">
                          {formatDate(record.timestamp)}
                        </TableCell>
                        <TableCell>
                          <Link href={`/poll/${record.pollId}`}>
                            <Button variant="link" className="p-0 h-auto">
                              #{record.pollId}
                            </Button>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(record.amount / 1e8).toFixed(4)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{coinSymbol}</Badge>
                        </TableCell>
                        <TableCell>
                          <a
                            href={`${config.explorerUrl}/txn/${record.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            {shortenHash(record.txHash)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </DonorLayout>
  );
}
