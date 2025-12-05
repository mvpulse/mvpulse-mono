/**
 * Event fetching utilities for MVPulse
 * Fetches on-chain events for user activity display
 */

export interface ActivityEvent {
  type: 'vote' | 'reward_claimed' | 'poll_created';
  pollId: number;
  pollTitle?: string;
  amount?: number;
  timestamp: number;
  txHash: string;
  optionIndex?: number;
}

interface RawEvent {
  version: string;
  guid: {
    creation_number: string;
    account_address: string;
  };
  sequence_number: string;
  type: string;
  data: Record<string, unknown>;
}

/**
 * Fetch events from the blockchain for a specific event type
 */
async function fetchEvents(
  rpcUrl: string,
  contractAddress: string,
  eventType: string,
  limit: number = 25
): Promise<RawEvent[]> {
  try {
    // Use the events API endpoint to fetch events by type
    const response = await fetch(
      `${rpcUrl}/accounts/${contractAddress}/events/${eventType}?limit=${limit}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        // No events found
        return [];
      }
      throw new Error(`Failed to fetch events: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${eventType} events:`, error);
    return [];
  }
}

/**
 * Fetch module events using the indexed events API
 * This queries events emitted by the contract
 */
async function fetchModuleEvents(
  rpcUrl: string,
  contractAddress: string,
  moduleName: string,
  eventName: string,
  limit: number = 25
): Promise<RawEvent[]> {
  try {
    // Query events by type using the events endpoint
    const eventType = `${contractAddress}::${moduleName}::${eventName}`;
    const response = await fetch(
      `${rpcUrl}/events/by_event_type/${encodeURIComponent(eventType)}?limit=${limit}`
    );

    if (!response.ok) {
      // Fall back to account events if the indexed endpoint doesn't work
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${eventName} events:`, error);
    return [];
  }
}

/**
 * Get transaction timestamp from transaction hash
 */
async function getTransactionTimestamp(
  rpcUrl: string,
  txHash: string
): Promise<number> {
  try {
    const response = await fetch(`${rpcUrl}/transactions/by_hash/${txHash}`);
    if (!response.ok) {
      return Date.now();
    }
    const tx = await response.json();
    return Math.floor(Number(tx.timestamp) / 1000); // Convert from microseconds to seconds
  } catch {
    return Date.now();
  }
}

/**
 * Fetch user's vote events
 */
async function fetchUserVotes(
  rpcUrl: string,
  contractAddress: string,
  userAddress: string,
  limit: number = 10
): Promise<ActivityEvent[]> {
  try {
    // Try to fetch VoteCast events
    const events = await fetchModuleEvents(rpcUrl, contractAddress, 'poll', 'VoteCast', limit * 2);

    // Filter events for this user and map to ActivityEvent
    const userEvents = events
      .filter((event) => {
        const data = event.data as { voter?: string };
        return data.voter === userAddress;
      })
      .slice(0, limit)
      .map((event): ActivityEvent => {
        const data = event.data as { poll_id?: string; voter?: string; option_index?: string };
        return {
          type: 'vote',
          pollId: parseInt(data.poll_id || '0', 10),
          optionIndex: parseInt(data.option_index || '0', 10),
          timestamp: Date.now(), // Will be updated if we can get transaction info
          txHash: event.version,
        };
      });

    return userEvents;
  } catch (error) {
    console.error('Error fetching user votes:', error);
    return [];
  }
}

/**
 * Fetch user's reward claim events
 */
async function fetchUserRewards(
  rpcUrl: string,
  contractAddress: string,
  userAddress: string,
  limit: number = 10
): Promise<ActivityEvent[]> {
  try {
    // Try to fetch RewardClaimed events
    const events = await fetchModuleEvents(rpcUrl, contractAddress, 'poll', 'RewardClaimed', limit * 2);

    // Filter events for this user and map to ActivityEvent
    const userEvents = events
      .filter((event) => {
        const data = event.data as { claimer?: string };
        return data.claimer === userAddress;
      })
      .slice(0, limit)
      .map((event): ActivityEvent => {
        const data = event.data as { poll_id?: string; claimer?: string; amount?: string };
        return {
          type: 'reward_claimed',
          pollId: parseInt(data.poll_id || '0', 10),
          amount: parseInt(data.amount || '0', 10),
          timestamp: Date.now(),
          txHash: event.version,
        };
      });

    return userEvents;
  } catch (error) {
    console.error('Error fetching user rewards:', error);
    return [];
  }
}

/**
 * Fetch user's created polls
 */
async function fetchUserPolls(
  rpcUrl: string,
  contractAddress: string,
  userAddress: string,
  limit: number = 10
): Promise<ActivityEvent[]> {
  try {
    // Try to fetch PollCreated events
    const events = await fetchModuleEvents(rpcUrl, contractAddress, 'poll', 'PollCreated', limit * 2);

    // Filter events for this user and map to ActivityEvent
    const userEvents = events
      .filter((event) => {
        const data = event.data as { creator?: string };
        return data.creator === userAddress;
      })
      .slice(0, limit)
      .map((event): ActivityEvent => {
        const data = event.data as { poll_id?: string; creator?: string };
        return {
          type: 'poll_created',
          pollId: parseInt(data.poll_id || '0', 10),
          timestamp: Date.now(),
          txHash: event.version,
        };
      });

    return userEvents;
  } catch (error) {
    console.error('Error fetching user polls:', error);
    return [];
  }
}

/**
 * Fetch all user activity (votes, rewards, poll creations)
 * Merges and sorts by timestamp descending
 */
export async function fetchUserActivity(
  rpcUrl: string,
  contractAddress: string,
  userAddress: string,
  limit: number = 10
): Promise<ActivityEvent[]> {
  try {
    // Fetch all event types in parallel
    const [votes, rewards, polls] = await Promise.all([
      fetchUserVotes(rpcUrl, contractAddress, userAddress, limit),
      fetchUserRewards(rpcUrl, contractAddress, userAddress, limit),
      fetchUserPolls(rpcUrl, contractAddress, userAddress, limit),
    ]);

    // Merge all events
    const allEvents = [...votes, ...rewards, ...polls];

    // Sort by timestamp descending (most recent first)
    allEvents.sort((a, b) => b.timestamp - a.timestamp);

    // Return limited results
    return allEvents.slice(0, limit);
  } catch (error) {
    console.error('Error fetching user activity:', error);
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
