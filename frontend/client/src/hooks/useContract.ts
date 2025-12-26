import { useState, useCallback, useMemo } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { createAptosClient, getFunctionId, formatTimeRemaining, isPollActive } from "@/lib/contract";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { submitPrivyTransaction } from "@/lib/privy-transactions";
import {
  submitPrivySponsoredTransaction,
  submitNativeSponsoredTransaction,
  type TransactionData,
} from "@/lib/sponsored-transactions";
import { CoinTypeId, COIN_TYPES, getFAMetadataAddress, getTokenStandard } from "@/lib/tokens";
import { isIndexerOptimizationEnabled } from "@/lib/feature-flags";
import type { Poll, PollWithMeta, CreatePollInput, VoteInput, TransactionResult, PlatformConfig } from "@/types/poll";

// Extended transaction result with sponsorship info
export interface TransactionResultWithSponsorship extends TransactionResult {
  sponsored?: boolean;
}

export function useContract() {
  const { config, network } = useNetwork();
  const { signAndSubmitTransaction, signTransaction, account } = useWallet();
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

  // Check if sponsorship is enabled from localStorage (set by Settings page)
  const getSponsorshipEnabled = useCallback(() => {
    const stored = localStorage.getItem("mvpulse-gas-sponsorship-enabled");
    return stored !== null ? stored === "true" : true; // Default to enabled
  }, []);

  // Get network type for sponsorship API
  const getNetworkType = useCallback((): "testnet" | "mainnet" => {
    return network === "mainnet" ? "mainnet" : "testnet";
  }, [network]);

  // Helper to enrich poll with computed fields
  const enrichPoll = useCallback((poll: Poll): PollWithMeta => {
    // Ensure votes are numbers (blockchain may return strings)
    const numericVotes = poll.votes.map(v => Number(v));
    const totalVotes = numericVotes.reduce((sum, v) => sum + v, 0);
    const votePercentages = numericVotes.map((v) =>
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

  // Helper function to execute transaction with dual-path support and gas sponsorship
  const executeTransaction = useCallback(
    async (
      functionName: string,
      functionArguments: (string | number | boolean | string[] | string[][])[],
      errorMessage: string,
      typeArguments: string[] = []
    ): Promise<TransactionResultWithSponsorship> => {
      const transactionData: TransactionData = {
        function: getFunctionId(contractAddress, functionName),
        typeArguments,
        functionArguments,
      };

      const networkType = getNetworkType();
      const sponsorshipEnabled = getSponsorshipEnabled();

      // Try sponsored transaction first if enabled
      if (sponsorshipEnabled) {
        try {
          if (isPrivyWallet) {
            // PRIVY WALLET - Sponsored path
            if (!privyAddress || !privyPublicKey || !signRawHash) {
              throw new Error("Privy wallet not properly connected");
            }

            const result = await submitPrivySponsoredTransaction(
              client,
              privyAddress,
              privyPublicKey,
              signRawHash,
              transactionData,
              networkType
            );

            return { hash: result.hash, success: true, sponsored: true };
          } else {
            // NATIVE WALLET - Sponsored path
            if (!signTransaction || !account?.address) {
              throw new Error("Wallet does not support sponsored transactions");
            }

            const result = await submitNativeSponsoredTransaction(
              client,
              account.address.toString(),
              signTransaction as any, // Type cast needed due to wallet adapter types
              transactionData,
              networkType
            );

            return { hash: result.hash, success: true, sponsored: true };
          }
        } catch (sponsorError) {
          console.warn("Sponsorship failed, falling back to user-paid gas:", sponsorError);
          // Fall through to non-sponsored path
        }
      }

      // FALLBACK: Non-sponsored transaction (user pays gas)
      if (isPrivyWallet) {
        if (!privyAddress || !privyPublicKey || !signRawHash) {
          throw new Error("Privy wallet not properly connected");
        }

        const hash = await submitPrivyTransaction(
          client,
          privyAddress,
          privyPublicKey,
          signRawHash,
          transactionData
        );

        return { hash, success: true, sponsored: false };
      } else {
        if (!signAndSubmitTransaction) {
          throw new Error("Wallet not connected");
        }

        const response = await signAndSubmitTransaction({
          data: transactionData,
        });

        return { hash: response.hash, success: true, sponsored: false };
      }
    },
    [
      isPrivyWallet, privyAddress, privyPublicKey, signRawHash,
      signAndSubmitTransaction, signTransaction, account, client,
      contractAddress, getNetworkType, getSponsorshipEnabled
    ]
  );

  // Get network type for FA metadata lookup
  const getNetworkForFA = useCallback((): "testnet" | "mainnet" => {
    return network === "mainnet" ? "mainnet" : "testnet";
  }, [network]);

  // Create a new poll
  const createPoll = useCallback(
    async (input: CreatePollInput): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        const coinTypeId = (input.coinTypeId ?? COIN_TYPES.PULSE) as CoinTypeId;
        const tokenStandard = getTokenStandard(coinTypeId);

        if (tokenStandard === "legacy_coin") {
          // MOVE uses legacy coin function
          return await executeTransaction(
            "create_poll_with_move",
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
        } else if (coinTypeId === COIN_TYPES.PULSE) {
          // PULSE uses backward compatibility wrapper (simpler, no metadata needed)
          return await executeTransaction(
            "create_poll_with_pulse",
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
        } else {
          // Other FA tokens (USDC, etc.) use generic FA function with metadata address
          const networkType = getNetworkForFA();
          const faMetadataAddress = getFAMetadataAddress(coinTypeId, networkType);

          if (!faMetadataAddress) {
            throw new Error(`FA metadata address not configured for coin type ${coinTypeId}`);
          }

          return await executeTransaction(
            "create_poll_with_fa",
            [
              contractAddress, // registry_addr
              input.title,
              input.description,
              input.options,
              input.rewardPerVote.toString(),
              input.maxVoters.toString(),
              input.durationSecs.toString(),
              input.fundAmount.toString(),
              faMetadataAddress, // fa_metadata_address
              coinTypeId.toString(), // coin_type_id
            ],
            "Failed to create poll"
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create poll";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress, getNetworkForFA]
  );

  // Create multiple polls in a single atomic transaction
  // Returns the poll IDs from the batch event
  const createPollsBatch = useCallback(
    async (inputs: CreatePollInput[]): Promise<TransactionResultWithSponsorship & { pollIds: number[] }> => {
      setLoading(true);
      setError(null);

      try {
        if (inputs.length === 0) {
          throw new Error("At least one poll is required for batch creation");
        }

        // All polls in a batch must use the same token type
        const coinTypeId = (inputs[0].coinTypeId ?? COIN_TYPES.PULSE) as CoinTypeId;
        const tokenStandard = getTokenStandard(coinTypeId);

        // Validate all polls use the same token type
        for (const input of inputs) {
          if ((input.coinTypeId ?? COIN_TYPES.PULSE) !== coinTypeId) {
            throw new Error("All polls in a batch must use the same token type");
          }
        }

        // Prepare parallel arrays for the contract call
        const titles = inputs.map(p => p.title);
        const descriptions = inputs.map(p => p.description);
        const optionsList = inputs.map(p => p.options);
        const rewardPerVotes = inputs.map(p => p.rewardPerVote.toString());
        const maxVotersList = inputs.map(p => p.maxVoters.toString());
        const durationSecsList = inputs.map(p => p.durationSecs.toString());
        const fundAmounts = inputs.map(p => p.fundAmount.toString());

        let result: TransactionResultWithSponsorship;

        if (tokenStandard === "legacy_coin") {
          // MOVE uses legacy coin batch function
          result = await executeTransaction(
            "create_polls_batch_with_move",
            [
              contractAddress, // registry_addr
              titles,
              descriptions,
              optionsList,
              rewardPerVotes,
              maxVotersList,
              durationSecsList,
              fundAmounts,
            ],
            "Failed to create polls batch"
          );
        } else {
          // FA tokens use generic FA batch function with metadata address
          const networkType = getNetworkForFA();
          const faMetadataAddress = getFAMetadataAddress(coinTypeId, networkType);

          if (!faMetadataAddress) {
            throw new Error(`FA metadata address not configured for coin type ${coinTypeId}`);
          }

          result = await executeTransaction(
            "create_polls_batch_with_fa",
            [
              contractAddress, // registry_addr
              titles,
              descriptions,
              optionsList,
              rewardPerVotes,
              maxVotersList,
              durationSecsList,
              fundAmounts,
              faMetadataAddress, // fa_metadata_address
              coinTypeId.toString(), // coin_type_id
            ],
            "Failed to create polls batch"
          );
        }

        // Parse poll IDs from transaction events
        // The PollsBatchCreated event contains the poll_ids vector
        let pollIds: number[] = [];
        try {
          const txResponse = await client.waitForTransaction({
            transactionHash: result.hash,
            options: { checkSuccess: true },
          });

          // Look for PollsBatchCreated event in the transaction
          if ('events' in txResponse && Array.isArray(txResponse.events)) {
            const batchEvent = txResponse.events.find(
              (e: { type: string }) => e.type.includes("::poll::PollsBatchCreated")
            );
            if (batchEvent && 'data' in batchEvent && batchEvent.data) {
              const eventData = batchEvent.data as { poll_ids?: string[] };
              pollIds = (eventData.poll_ids || []).map((id: string) => parseInt(id, 10));
            }
          }
        } catch (parseErr) {
          console.error("Failed to parse poll IDs from event:", parseErr);
          // Return empty array if parsing fails - caller should refetch polls
        }

        return { ...result, pollIds };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create polls batch";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress, getNetworkForFA, client]
  );

  // Fund an existing poll
  const fundPoll = useCallback(
    async (pollId: number, amount: number, coinTypeId: CoinTypeId = COIN_TYPES.PULSE): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        const tokenStandard = getTokenStandard(coinTypeId);
        // MOVE uses legacy coin function, all FA tokens use generic FA function
        const functionName = tokenStandard === "legacy_coin" ? "fund_poll_with_move" : "fund_poll_with_fa";

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
    async (pollId: number, coinTypeId: CoinTypeId = COIN_TYPES.PULSE): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        const tokenStandard = getTokenStandard(coinTypeId);
        // MOVE uses legacy coin function, all FA tokens use generic FA function
        const functionName = tokenStandard === "legacy_coin" ? "claim_reward_move" : "claim_reward_fa";

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
    async (pollId: number, coinTypeId: CoinTypeId = COIN_TYPES.PULSE): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        const tokenStandard = getTokenStandard(coinTypeId);
        // MOVE uses legacy coin function, all FA tokens use generic FA function
        const functionName = tokenStandard === "legacy_coin" ? "distribute_rewards_move" : "distribute_rewards_fa";

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
    async (pollId: number, coinTypeId: CoinTypeId = COIN_TYPES.PULSE): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        const tokenStandard = getTokenStandard(coinTypeId);
        // MOVE uses legacy coin function, all FA tokens use generic FA function
        const functionName = tokenStandard === "legacy_coin" ? "withdraw_remaining_move" : "withdraw_remaining_fa";

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

  // Finalize a poll (after claim period, sends unclaimed rewards to treasury)
  const finalizePoll = useCallback(
    async (pollId: number, coinTypeId: CoinTypeId = COIN_TYPES.PULSE): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        const tokenStandard = getTokenStandard(coinTypeId);
        // MOVE uses legacy coin function, all FA tokens use generic FA function
        const functionName = tokenStandard === "legacy_coin" ? "finalize_poll_move" : "finalize_poll_fa";

        return await executeTransaction(
          functionName,
          [contractAddress, pollId.toString()],
          "Failed to finalize poll"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to finalize poll";
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

  // Start claims on a poll and set distribution mode
  // Transitions: ACTIVE → CLAIMING_OR_DISTRIBUTION
  const startClaims = useCallback(
    async (pollId: number, distributionMode: number): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        return await executeTransaction(
          "start_claims",
          [
            contractAddress, // registry_addr
            pollId.toString(),
            distributionMode.toString(),
          ],
          "Failed to start claims"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start claims";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // Close a poll (stop claims/distributions)
  // Transitions: CLAIMING_OR_DISTRIBUTION → CLOSED
  const closePoll = useCallback(
    async (pollId: number): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        return await executeTransaction(
          "close_poll",
          [
            contractAddress, // registry_addr
            pollId.toString(),
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

  // Bulk vote on multiple polls atomically (for questionnaires)
  const bulkVote = useCallback(
    async (pollIds: number[], optionIndices: number[]): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      if (pollIds.length !== optionIndices.length) {
        throw new Error("Poll IDs and option indices must have the same length");
      }

      if (pollIds.length === 0) {
        throw new Error("At least one vote is required");
      }

      try {
        return await executeTransaction(
          "bulk_vote",
          [
            contractAddress, // registry_addr
            pollIds.map(id => id.toString()),
            optionIndices.map(idx => idx.toString()),
          ],
          "Failed to submit bulk votes"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to submit bulk votes";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // ============================================
  // Questionnaire Pool Functions (Shared Rewards)
  // ============================================

  // Create a questionnaire-level shared reward pool
  const createQuestionnairePool = useCallback(
    async (
      pollIds: number[],
      rewardPerCompletion: number, // 0 = equal split
      maxCompleters: number, // 0 = unlimited
      durationSecs: number,
      fundAmount: number,
      faMetadataAddress: string,
      coinTypeId: CoinTypeId
    ): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        return await executeTransaction(
          "create_questionnaire_pool_with_fa",
          [
            contractAddress,
            pollIds.map(id => id.toString()),
            rewardPerCompletion.toString(),
            maxCompleters.toString(),
            durationSecs.toString(),
            fundAmount.toString(),
            faMetadataAddress,
            coinTypeId.toString(),
          ],
          "Failed to create questionnaire pool"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create questionnaire pool";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // Mark user as having completed a questionnaire (after bulk_vote)
  const markQuestionnaireCompleted = useCallback(
    async (questionnaireId: number): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        return await executeTransaction(
          "mark_questionnaire_completed",
          [contractAddress, questionnaireId.toString()],
          "Failed to mark questionnaire completed"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to mark questionnaire completed";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // Start questionnaire claiming period (creator only)
  const startQuestionnaireClaims = useCallback(
    async (questionnaireId: number): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        return await executeTransaction(
          "start_questionnaire_claims",
          [contractAddress, questionnaireId.toString()],
          "Failed to start questionnaire claims"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start questionnaire claims";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // Claim questionnaire-level reward (shared pool)
  const claimQuestionnaireReward = useCallback(
    async (questionnaireId: number): Promise<TransactionResult> => {
      setLoading(true);
      setError(null);

      try {
        return await executeTransaction(
          "claim_questionnaire_reward_fa",
          [contractAddress, questionnaireId.toString()],
          "Failed to claim questionnaire reward"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to claim questionnaire reward";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, contractAddress]
  );

  // Check if user has completed all polls in a questionnaire (view function)
  const hasCompletedQuestionnaire = useCallback(
    async (questionnaireId: number, userAddress?: string): Promise<boolean> => {
      const address = userAddress || activeAddress;
      if (!contractAddress || !address) return false;

      try {
        const result = await client.view({
          payload: {
            function: getFunctionId(contractAddress, "has_completed_questionnaire"),
            typeArguments: [],
            functionArguments: [contractAddress, questionnaireId.toString(), address],
          },
        });

        return Boolean(result && result[0]);
      } catch (err) {
        console.error("Failed to check questionnaire completion:", err);
        return false;
      }
    },
    [client, contractAddress, activeAddress]
  );

  // Get questionnaire pool details (view function)
  const getQuestionnairePool = useCallback(
    async (questionnaireId: number): Promise<{
      id: number;
      creator: string;
      poll_ids: number[];
      reward_pool: number;
      reward_per_completion: number;
      max_completers: number;
      completers: string[];
      claimed: string[];
      coin_type_id: number;
      fa_metadata_address: string;
      status: number;
      end_time: number;
      closed_at: number;
    } | null> => {
      if (!contractAddress) return null;

      try {
        const result = await client.view({
          payload: {
            function: getFunctionId(contractAddress, "get_questionnaire_pool"),
            typeArguments: [],
            functionArguments: [contractAddress, questionnaireId.toString()],
          },
        });

        if (result && result[0]) {
          const pool = result[0] as any;
          return {
            id: Number(pool.id),
            creator: pool.creator,
            poll_ids: pool.poll_ids.map((id: string) => Number(id)),
            reward_pool: Number(pool.reward_pool),
            reward_per_completion: Number(pool.reward_per_completion),
            max_completers: Number(pool.max_completers),
            completers: pool.completers,
            claimed: pool.claimed,
            coin_type_id: Number(pool.coin_type_id),
            fa_metadata_address: pool.fa_metadata_address,
            status: Number(pool.status),
            end_time: Number(pool.end_time),
            closed_at: Number(pool.closed_at),
          };
        }
        return null;
      } catch (err) {
        console.error("Failed to get questionnaire pool:", err);
        return null;
      }
    },
    [client, contractAddress]
  );

  // Get questionnaire pool count (view function)
  const getQuestionnairePoolCount = useCallback(async (): Promise<number> => {
    if (!contractAddress) return 0;

    try {
      const result = await client.view({
        payload: {
          function: getFunctionId(contractAddress, "get_questionnaire_pool_count"),
          typeArguments: [],
          functionArguments: [contractAddress],
        },
      });

      if (result && result[0] !== undefined) {
        return Number(result[0]);
      }
      return 0;
    } catch (err) {
      console.error("Failed to get questionnaire pool count:", err);
      return 0;
    }
  }, [client, contractAddress]);

  // Check if user has claimed questionnaire reward (view function)
  const hasClaimedQuestionnaire = useCallback(
    async (questionnaireId: number, userAddress?: string): Promise<boolean> => {
      const address = userAddress || activeAddress;
      if (!contractAddress || !address) return false;

      try {
        const result = await client.view({
          payload: {
            function: getFunctionId(contractAddress, "has_claimed_questionnaire"),
            typeArguments: [],
            functionArguments: [contractAddress, questionnaireId.toString(), address],
          },
        });

        return Boolean(result && result[0]);
      } catch (err) {
        console.error("Failed to check questionnaire claim status:", err);
        return false;
      }
    },
    [client, contractAddress, activeAddress]
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

  // Get claim period in seconds (view function)
  const getClaimPeriod = useCallback(async (): Promise<number> => {
    if (!contractAddress) return 0;

    try {
      const result = await client.view({
        payload: {
          function: getFunctionId(contractAddress, "get_claim_period"),
          typeArguments: [],
          functionArguments: [contractAddress],
        },
      });

      if (result && result[0] !== undefined) {
        return Number(result[0]);
      }
      return 0;
    } catch (err) {
      console.error("Failed to get claim period:", err);
      return 0;
    }
  }, [client, contractAddress]);

  // Check if a poll can be finalized (view function)
  const canFinalizePoll = useCallback(
    async (pollId: number): Promise<boolean> => {
      if (!contractAddress) return false;

      try {
        const result = await client.view({
          payload: {
            function: getFunctionId(contractAddress, "can_finalize_poll"),
            typeArguments: [],
            functionArguments: [contractAddress, pollId.toString()],
          },
        });

        return Boolean(result && result[0]);
      } catch (err) {
        console.error("Failed to check if poll can be finalized:", err);
        return false;
      }
    },
    [client, contractAddress]
  );

  // Get all polls (parallel or sequential based on feature flag)
  const getAllPolls = useCallback(async (): Promise<PollWithMeta[]> => {
    const count = await getPollCount();
    if (count === 0) return [];

    // Use parallel fetching when indexer optimization is enabled
    if (isIndexerOptimizationEnabled()) {
      const pollPromises = Array.from({ length: count }, (_, i) => getPoll(i));
      const results = await Promise.all(pollPromises);
      return results.filter((poll): poll is PollWithMeta => poll !== null);
    }

    // Sequential fetching (original behavior)
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
          claimPeriodSecs: result.length >= 4 ? Number(result[3]) : 604800, // Default 7 days
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
    createPollsBatch,
    vote,
    bulkVote,
    startClaims,
    closePoll,
    fundPoll,
    claimReward,
    distributeRewards,
    withdrawRemaining,
    finalizePoll,

    // Questionnaire pool write functions
    createQuestionnairePool,
    markQuestionnaireCompleted,
    startQuestionnaireClaims,
    claimQuestionnaireReward,

    // Read functions
    getPoll,
    getPollCount,
    hasVoted,
    hasClaimed,
    getAllPolls,
    getPlatformConfig,
    getClaimPeriod,
    canFinalizePoll,

    // Questionnaire pool read functions
    hasCompletedQuestionnaire,
    getQuestionnairePool,
    getQuestionnairePoolCount,
    hasClaimedQuestionnaire,

    // Helpers
    enrichPoll,
  };
}
