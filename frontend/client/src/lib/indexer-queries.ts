/**
 * GraphQL queries for Movement Indexer
 * Used for batch fetching vote and claim status
 */

interface VoteEventData {
  poll_id: string;
  voter: string;
  option_index: string;
}

interface ClaimEventData {
  poll_id: string;
  claimer: string;
  amount: string;
}

interface IndexerEvent<T> {
  type: string;
  data: T;
  transaction_version: string;
}

interface GraphQLResponse<T> {
  data?: {
    events: IndexerEvent<T>[];
  };
  errors?: Array<{ message: string }>;
}

// GraphQL query to get all polls a user has voted on
const GET_USER_VOTES_QUERY = `
  query GetUserVotes($eventTypePattern: String!, $userAddress: String!) {
    events(
      where: {
        indexed_type: { _like: $eventTypePattern },
        type: { _like: "%VoteCast%" },
        data: { _contains: { voter: $userAddress } }
      },
      order_by: { transaction_block_height: desc }
    ) {
      type
      data
      transaction_version
    }
  }
`;

// GraphQL query to get all polls a user has claimed rewards from
const GET_USER_CLAIMS_QUERY = `
  query GetUserClaims($eventTypePattern: String!, $userAddress: String!) {
    events(
      where: {
        indexed_type: { _like: $eventTypePattern },
        type: { _like: "%RewardClaimed%" },
        data: { _contains: { claimer: $userAddress } }
      },
      order_by: { transaction_block_height: desc }
    ) {
      type
      data
      transaction_version
    }
  }
`;

/**
 * Fetch all poll IDs that a user has voted on
 * Returns a Set of poll IDs for O(1) lookup
 */
export async function fetchUserVotedPolls(
  indexerUrl: string,
  contractAddress: string,
  userAddress: string
): Promise<Set<number>> {
  try {
    const eventTypePattern = `${contractAddress}::poll::%`;

    const response = await fetch(indexerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: GET_USER_VOTES_QUERY,
        variables: {
          eventTypePattern,
          userAddress,
        },
      }),
    });

    if (!response.ok) {
      console.error(`Indexer request failed: ${response.status} ${response.statusText}`);
      return new Set();
    }

    const result: GraphQLResponse<VoteEventData> = await response.json();

    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      return new Set();
    }

    if (!result.data?.events) {
      return new Set();
    }

    const votedPollIds = new Set<number>();
    for (const event of result.data.events) {
      if (event.data.poll_id) {
        votedPollIds.add(parseInt(event.data.poll_id, 10));
      }
    }

    return votedPollIds;
  } catch (error) {
    console.error("Error fetching user votes from indexer:", error);
    return new Set();
  }
}

/**
 * Fetch all poll IDs that a user has claimed rewards from
 * Returns a Set of poll IDs for O(1) lookup
 */
export async function fetchUserClaimedPolls(
  indexerUrl: string,
  contractAddress: string,
  userAddress: string
): Promise<Set<number>> {
  try {
    const eventTypePattern = `${contractAddress}::poll::%`;

    const response = await fetch(indexerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: GET_USER_CLAIMS_QUERY,
        variables: {
          eventTypePattern,
          userAddress,
        },
      }),
    });

    if (!response.ok) {
      console.error(`Indexer request failed: ${response.status} ${response.statusText}`);
      return new Set();
    }

    const result: GraphQLResponse<ClaimEventData> = await response.json();

    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      return new Set();
    }

    if (!result.data?.events) {
      return new Set();
    }

    const claimedPollIds = new Set<number>();
    for (const event of result.data.events) {
      if (event.data.poll_id) {
        claimedPollIds.add(parseInt(event.data.poll_id, 10));
      }
    }

    return claimedPollIds;
  } catch (error) {
    console.error("Error fetching user claims from indexer:", error);
    return new Set();
  }
}

/**
 * Fetch both voted and claimed polls in parallel
 * Returns an object with both Sets for efficient lookup
 */
export async function fetchUserVoteAndClaimStatus(
  indexerUrl: string,
  contractAddress: string,
  userAddress: string
): Promise<{ votedPolls: Set<number>; claimedPolls: Set<number> }> {
  const [votedPolls, claimedPolls] = await Promise.all([
    fetchUserVotedPolls(indexerUrl, contractAddress, userAddress),
    fetchUserClaimedPolls(indexerUrl, contractAddress, userAddress),
  ]);

  return { votedPolls, claimedPolls };
}
