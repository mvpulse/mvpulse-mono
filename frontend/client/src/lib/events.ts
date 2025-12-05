/**
 * Event fetching utilities for MVPulse
 * Uses Movement Indexer GraphQL API to fetch user activity
 */

export interface ActivityEvent {
  type: 'vote' | 'reward_claimed' | 'poll_created';
  pollId?: number;
  pollTitle?: string;
  amount?: number;
  timestamp: number;
  txHash: string;
  optionIndex?: number;
}

interface UserTransaction {
  version: string;
  entry_function_function_name: string | null;
  timestamp: string;
}

interface GraphQLResponse {
  data?: {
    user_transactions: UserTransaction[];
  };
  errors?: Array<{ message: string }>;
}

// GraphQL query for user transactions with the poll contract
const ACTIVITY_QUERY = `
  query GetUserActivity($sender: String!, $contractAddress: String!, $limit: Int!) {
    user_transactions(
      where: {
        sender: { _eq: $sender },
        entry_function_contract_address: { _eq: $contractAddress },
        entry_function_module_name: { _eq: "poll" }
      },
      order_by: { timestamp: desc },
      limit: $limit
    ) {
      version
      entry_function_function_name
      timestamp
    }
  }
`;

/**
 * Map function name to activity type
 */
function mapFunctionToActivityType(functionName: string | null): ActivityEvent['type'] {
  switch (functionName) {
    case 'vote':
      return 'vote';
    case 'claim_reward':
      return 'reward_claimed';
    case 'create_poll':
      return 'poll_created';
    default:
      return 'vote';
  }
}

/**
 * Fetch user activity from the Movement Indexer
 * @param indexerUrl - The GraphQL Indexer endpoint URL
 * @param contractAddress - The poll contract address
 * @param userAddress - The user's wallet address
 * @param limit - Maximum number of activities to fetch
 */
export async function fetchUserActivity(
  indexerUrl: string,
  contractAddress: string,
  userAddress: string,
  limit: number = 10
): Promise<ActivityEvent[]> {
  try {
    const response = await fetch(indexerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: ACTIVITY_QUERY,
        variables: {
          sender: userAddress,
          contractAddress: contractAddress,
          limit: limit,
        },
      }),
    });

    if (!response.ok) {
      console.error(`Indexer request failed: ${response.status} ${response.statusText}`);
      return [];
    }

    const result: GraphQLResponse = await response.json();

    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      return [];
    }

    if (!result.data?.user_transactions) {
      return [];
    }

    return result.data.user_transactions.map((tx): ActivityEvent => ({
      type: mapFunctionToActivityType(tx.entry_function_function_name),
      timestamp: new Date(tx.timestamp).getTime(),
      txHash: tx.version,
    }));
  } catch (error) {
    console.error("Error fetching user activity from indexer:", error);
    return [];
  }
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = Math.floor((now - timestamp) / 1000);

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}
