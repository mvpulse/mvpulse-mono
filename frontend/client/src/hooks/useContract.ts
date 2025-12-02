import { useState, useCallback, useMemo } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { createAptosClient, getFunctionId, formatTimeRemaining, isPollActive } from "@/lib/contract";
import type { Poll, PollWithMeta, CreatePollInput, VoteInput, TransactionResult } from "@/types/poll";

export function useContract() {
  const { config } = useNetwork();
  const { signAndSubmitTransaction, account } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => createAptosClient(config), [config]);
  const contractAddress = config.contractAddress;

  // Helper to enrich poll with computed fields
  const enrichPoll = useCallback((poll: Poll): PollWithMeta => {
    const totalVotes = poll.votes.reduce((sum, v) => sum + v, 0);
    const votePercentages = poll.votes.map((v) =>
      totalVotes > 0 ? Math.round((v / totalVotes) * 100) : 0
    );
    return {
      ...poll,
      totalVotes,
      isActive: isPollActive(poll),
      timeRemaining: formatTimeRemaining(poll.end_time),
      votePercentages,
    };
  }, []);

  // Create a new poll
  const createPoll = useCallback(
    async (input: CreatePollInput): Promise<TransactionResult> => {
      if (!signAndSubmitTransaction) {
        throw new Error("Wallet not connected");
      }

      setLoading(true);
      setError(null);

      try {
        const response = await signAndSubmitTransaction({
          data: {
            function: getFunctionId(contractAddress, "create_poll"),
            typeArguments: [],
            functionArguments: [
              contractAddress, // registry_addr
              input.title,
              input.description,
              input.options,
              input.rewardPerVote.toString(),
              input.durationSecs.toString(),
            ],
          },
        });

        return {
          hash: response.hash,
          success: true,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create poll";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signAndSubmitTransaction, contractAddress]
  );

  // Vote on a poll
  const vote = useCallback(
    async (input: VoteInput): Promise<TransactionResult> => {
      if (!signAndSubmitTransaction) {
        throw new Error("Wallet not connected");
      }

      setLoading(true);
      setError(null);

      try {
        const response = await signAndSubmitTransaction({
          data: {
            function: getFunctionId(contractAddress, "vote"),
            typeArguments: [],
            functionArguments: [
              contractAddress, // registry_addr
              input.pollId.toString(),
              input.optionIndex.toString(),
            ],
          },
        });

        return {
          hash: response.hash,
          success: true,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to vote";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signAndSubmitTransaction, contractAddress]
  );

  // Close a poll
  const closePoll = useCallback(
    async (pollId: number): Promise<TransactionResult> => {
      if (!signAndSubmitTransaction) {
        throw new Error("Wallet not connected");
      }

      setLoading(true);
      setError(null);

      try {
        const response = await signAndSubmitTransaction({
          data: {
            function: getFunctionId(contractAddress, "close_poll"),
            typeArguments: [],
            functionArguments: [
              contractAddress, // registry_addr
              pollId.toString(),
            ],
          },
        });

        return {
          hash: response.hash,
          success: true,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to close poll";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signAndSubmitTransaction, contractAddress]
  );

  // Get a single poll by ID (view function)
  const getPoll = useCallback(
    async (pollId: number): Promise<PollWithMeta | null> => {
      if (!contractAddress) return null;

      try {
        const result = await client.view({
          payload: {
            function: getFunctionId(contractAddress, "get_poll"),
            typeArguments: [],
            functionArguments: [contractAddress, pollId.toString()],
          },
        });

        if (result && result[0]) {
          const poll = result[0] as Poll;
          return enrichPoll(poll);
        }
        return null;
      } catch (err) {
        console.error("Failed to get poll:", err);
        return null;
      }
    },
    [client, contractAddress, enrichPoll]
  );

  // Get total poll count (view function)
  const getPollCount = useCallback(async (): Promise<number> => {
    if (!contractAddress) return 0;

    try {
      const result = await client.view({
        payload: {
          function: getFunctionId(contractAddress, "get_poll_count"),
          typeArguments: [],
          functionArguments: [contractAddress],
        },
      });

      if (result && result[0] !== undefined) {
        return Number(result[0]);
      }
      return 0;
    } catch (err) {
      console.error("Failed to get poll count:", err);
      return 0;
    }
  }, [client, contractAddress]);

  // Check if user has voted (view function)
  const hasVoted = useCallback(
    async (pollId: number, voterAddress?: string): Promise<boolean> => {
      const address = voterAddress || account?.address;
      if (!contractAddress || !address) return false;

      try {
        const result = await client.view({
          payload: {
            function: getFunctionId(contractAddress, "has_voted"),
            typeArguments: [],
            functionArguments: [contractAddress, pollId.toString(), address],
          },
        });

        return Boolean(result && result[0]);
      } catch (err) {
        console.error("Failed to check vote status:", err);
        return false;
      }
    },
    [client, contractAddress, account?.address]
  );

  // Get all polls (fetches each poll individually)
  const getAllPolls = useCallback(async (): Promise<PollWithMeta[]> => {
    const count = await getPollCount();
    if (count === 0) return [];

    const polls: PollWithMeta[] = [];
    for (let i = 0; i < count; i++) {
      const poll = await getPoll(i);
      if (poll) {
        polls.push(poll);
      }
    }

    return polls;
  }, [getPollCount, getPoll]);

  return {
    // State
    loading,
    error,
    contractAddress,

    // Write functions
    createPoll,
    vote,
    closePoll,

    // Read functions
    getPoll,
    getPollCount,
    hasVoted,
    getAllPolls,

    // Helpers
    enrichPoll,
  };
}
