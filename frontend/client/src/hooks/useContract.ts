import { useState, useCallback, useMemo } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { createAptosClient, getFunctionId, formatTimeRemaining, isPollActive } from "@/lib/contract";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { submitPrivyTransaction } from "@/lib/privy-transactions";
import { CoinTypeId, COIN_TYPES } from "@/lib/tokens";
import type { Poll, PollWithMeta, CreatePollInput, VoteInput, TransactionResult, PlatformConfig } from "@/types/poll";

export function useContract() {
  const { config } = useNetwork();
  const { signAndSubmitTransaction, account } = useWallet();
  const {
    isPrivyWallet,
    walletAddress: privyAddress,
    publicKey: privyPublicKey,
    signRawHash,
  } = usePrivyWallet();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => createAptosClient(config), [config]);
  const contractAddress = config.contractAddress;

  // Get the active wallet address (Privy or native)
  const activeAddress = isPrivyWallet ? privyAddress : account?.address?.toString();

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

  // Helper function to execute transaction with dual-path support
  const executeTransaction = useCallback(
    async (
      functionName: string,
      functionArguments: (string | number | boolean | string[])[],
      errorMessage: string,
      typeArguments: string[] = []
    ): Promise<TransactionResult> => {
      if (isPrivyWallet) {
        if (!privyAddress || !privyPublicKey || !signRawHash) {
          throw new Error("Privy wallet not properly connected");
        }

        const hash = await submitPrivyTransaction(
          client,
          privyAddress,
          privyPublicKey,
          signRawHash,
          {
            function: getFunctionId(contractAddress, functionName),
            typeArguments,
            functionArguments,
          }
        );

        return { hash, success: true };
      } else {
        if (!signAndSubmitTransaction) {
          throw new Error("Wallet not connected");
        }

        const response = await signAndSubmitTransaction({
          data: {
            function: getFunctionId(contractAddress, functionName),
            typeArguments,
            functionArguments,
          },
        });

        return { hash: response.hash, success: true };
      }
    },
    [isPrivyWallet, privyAddress, privyPublicKey, signRawHash, signAndSubmitTransaction, client, contractAddress]
  );

  // Create a new poll
  const createPoll = useCallback(
    async (input: CreatePollInput): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        const coinTypeId = input.coinTypeId ?? COIN_TYPES.MOVE;
        // Use the correct function based on coin type
        const functionName = coinTypeId === COIN_TYPES.PULSE
          ? "create_poll_with_pulse"
          : "create_poll_with_move";

        return await executeTransaction(
          functionName,
          [
            contractAddress, // registry_addr
            input.title,
            input.description,
            input.options,
            input.rewardPerVote.toString(),
            input.maxVoters.toString(),
            input.durationSecs.toString(),
            input.fundAmount.toString(),
          ],
          "Failed to create poll"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create poll";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // Fund an existing poll
  const fundPoll = useCallback(
    async (pollId: number, amount: number, coinTypeId: CoinTypeId = COIN_TYPES.MOVE): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        const functionName = coinTypeId === COIN_TYPES.PULSE
          ? "fund_poll_with_pulse"
          : "fund_poll_with_move";

        return await executeTransaction(
          functionName,
          [contractAddress, pollId.toString(), amount.toString()],
          "Failed to fund poll"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fund poll";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // Claim reward (for Manual Pull mode)
  const claimReward = useCallback(
    async (pollId: number, coinTypeId: CoinTypeId = COIN_TYPES.MOVE): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        const functionName = coinTypeId === COIN_TYPES.PULSE
          ? "claim_reward_pulse"
          : "claim_reward_move";

        return await executeTransaction(
          functionName,
          [contractAddress, pollId.toString()],
          "Failed to claim reward"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to claim reward";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // Distribute rewards to all voters (for Manual Push mode)
  const distributeRewards = useCallback(
    async (pollId: number, coinTypeId: CoinTypeId = COIN_TYPES.MOVE): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        const functionName = coinTypeId === COIN_TYPES.PULSE
          ? "distribute_rewards_pulse"
          : "distribute_rewards_move";

        return await executeTransaction(
          functionName,
          [contractAddress, pollId.toString()],
          "Failed to distribute rewards"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to distribute rewards";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // Withdraw remaining funds from a poll
  const withdrawRemaining = useCallback(
    async (pollId: number, coinTypeId: CoinTypeId = COIN_TYPES.MOVE): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        const functionName = coinTypeId === COIN_TYPES.PULSE
          ? "withdraw_remaining_pulse"
          : "withdraw_remaining_move";

        return await executeTransaction(
          functionName,
          [contractAddress, pollId.toString()],
          "Failed to withdraw funds"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to withdraw funds";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // Vote on a poll
  const vote = useCallback(
    async (input: VoteInput): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        return await executeTransaction(
          "vote",
          [
            contractAddress, // registry_addr
            input.pollId.toString(),
            input.optionIndex.toString(),
          ],
          "Failed to vote"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to vote";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // Close a poll and set distribution mode
  const closePoll = useCallback(
    async (pollId: number, distributionMode: number): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        return await executeTransaction(
          "close_poll",
          [
            contractAddress, // registry_addr
            pollId.toString(),
            distributionMode.toString(),
          ],
          "Failed to close poll"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to close poll";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
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
      const address = voterAddress || activeAddress;
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
    [client, contractAddress, activeAddress]
  );

  // Check if user has claimed reward (view function)
  const hasClaimed = useCallback(
    async (pollId: number, claimerAddress?: string): Promise<boolean> => {
      const address = claimerAddress || activeAddress;
      if (!contractAddress || !address) return false;

      try {
        const result = await client.view({
          payload: {
            function: getFunctionId(contractAddress, "has_claimed"),
            typeArguments: [],
            functionArguments: [contractAddress, pollId.toString(), address],
          },
        });

        return Boolean(result && result[0]);
      } catch (err) {
        console.error("Failed to check claim status:", err);
        return false;
      }
    },
    [client, contractAddress, activeAddress]
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

  // Get platform configuration (view function)
  const getPlatformConfig = useCallback(async (): Promise<PlatformConfig | null> => {
    if (!contractAddress) return null;

    try {
      const result = await client.view({
        payload: {
          function: getFunctionId(contractAddress, "get_platform_config"),
          typeArguments: [],
          functionArguments: [contractAddress],
        },
      });

      if (result && result.length >= 3) {
        return {
          feeBps: Number(result[0]),
          treasury: String(result[1]),
          totalFeesCollected: Number(result[2]),
        };
      }
      return null;
    } catch (err) {
      console.error("Failed to get platform config:", err);
      return null;
    }
  }, [client, contractAddress]);

  return {
    // State
    loading,
    error,
    contractAddress,
    // Wallet info
    isPrivyWallet,
    activeAddress,

    // Write functions
    createPoll,
    vote,
    closePoll,
    fundPoll,
    claimReward,
    distributeRewards,
    withdrawRemaining,

    // Read functions
    getPoll,
    getPollCount,
    hasVoted,
    hasClaimed,
    getAllPolls,
    getPlatformConfig,

    // Helpers
    enrichPoll,
  };
}
