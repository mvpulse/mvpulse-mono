// TypeScript types matching the Move contract structs

export interface Poll {
  id: number;
  creator: string;
  title: string;
  description: string;
  options: string[];
  votes: number[];
  voters: string[];
  reward_per_vote: number;
  end_time: number;
  status: number;
}

// Poll with computed fields for UI
export interface PollWithMeta extends Poll {
  totalVotes: number;
  isActive: boolean;
  timeRemaining: string;
  votePercentages: number[];
}

// Input for creating a new poll
export interface CreatePollInput {
  title: string;
  description: string;
  options: string[];
  rewardPerVote: number;
  durationSecs: number;
}

// Vote input
export interface VoteInput {
  pollId: number;
  optionIndex: number;
}

// Transaction result
export interface TransactionResult {
  hash: string;
  success: boolean;
}

// Error type for contract calls
export interface ContractError {
  code: string;
  message: string;
}
