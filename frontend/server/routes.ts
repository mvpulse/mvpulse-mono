import type { Express } from "express";
import { createServer, type Server } from "http";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { db } from "./db";
import {
  userProfiles,
  seasons,
  quests,
  questProgress,
  dailyVoteLogs,
  seasonLeaderboard,
  userSeasonSnapshots,
  sponsorshipLogs,
  userSettings,
  referralCodes,
  referrals,
  referralMilestones,
  referralStats,
  questionnaires,
  questionnairePolls,
  questionnaireProgress,
  TIERS,
  TIER_VOTE_LIMITS,
  TIER_PULSE_THRESHOLDS,
  QUEST_TYPES,
  SEASON_STATUS,
  REFERRAL_STATUS,
  REFERRAL_MILESTONES,
  REFERRAL_REWARDS,
  REFERRAL_TIERS,
  REFERRAL_TIER_THRESHOLDS,
  REFERRAL_TIER_MULTIPLIERS,
  QUESTIONNAIRE_STATUS,
  QUESTIONNAIRE_REWARD_TYPE,
  type UserProfile,
  type Season,
  type Quest,
  type Questionnaire,
  type QuestionnairePoll,
  type QuestionnaireProgress,
} from "@shared/schema";

// ============================================
// Gas Sponsorship Constants
// ============================================

const DAILY_SPONSORSHIP_LIMIT = 50; // Max sponsored transactions per address per day

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate tier based on PULSE holdings (balance + staked) and streak
 * Tier is determined by total PULSE (wallet balance + staked amount)
 */
function calculateTier(
  pulseBalance: bigint | string,
  stakedPulse: bigint | string,
  streak: number
): number {
  const balance = typeof pulseBalance === "string" ? BigInt(pulseBalance) : pulseBalance;
  const staked = typeof stakedPulse === "string" ? BigInt(stakedPulse) : stakedPulse;
  const totalPulse = balance + staked;

  // Determine tier from total PULSE (balance + staked)
  let tierFromPulse: number = TIERS.BRONZE;
  if (totalPulse >= BigInt(TIER_PULSE_THRESHOLDS[TIERS.PLATINUM])) {
    tierFromPulse = TIERS.PLATINUM;
  } else if (totalPulse >= BigInt(TIER_PULSE_THRESHOLDS[TIERS.GOLD])) {
    tierFromPulse = TIERS.GOLD;
  } else if (totalPulse >= BigInt(TIER_PULSE_THRESHOLDS[TIERS.SILVER])) {
    tierFromPulse = TIERS.SILVER;
  }

  // Streak bonuses: 7+ days = +1 tier, 30+ days = +2 tiers
  const streakBonus = streak >= 30 ? 2 : streak >= 7 ? 1 : 0;

  // Cap at Platinum
  return Math.min(tierFromPulse + streakBonus, TIERS.PLATINUM);
}

/**
 * Get today's date string (YYYY-MM-DD) in UTC
 */
function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Get yesterday's date string (YYYY-MM-DD) in UTC
 */
function getYesterdayString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split("T")[0];
}

/**
 * Get or create user profile
 */
async function getOrCreateProfile(walletAddress: string): Promise<UserProfile> {
  const normalizedAddress = walletAddress.toLowerCase();

  // Try to find existing profile
  const [existing] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.walletAddress, normalizedAddress))
    .limit(1);

  if (existing) {
    return existing;
  }

  // Create new profile
  const [newProfile] = await db
    .insert(userProfiles)
    .values({
      walletAddress: normalizedAddress,
      currentStreak: 0,
      longestStreak: 0,
      votesToday: 0,
      seasonPoints: 0,
      seasonVotes: 0,
      cachedTier: TIERS.BRONZE,
      cachedPulseBalance: "0",
      cachedStakedPulse: "0",
    })
    .returning();

  return newProfile;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ============================================
  // User Profile Routes
  // ============================================

  /**
   * GET /api/user/profile/:address
   * Get user profile with calculated tier
   */
  app.get("/api/user/profile/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const profile = await getOrCreateProfile(address);

      // Check if we need to reset daily votes (new day)
      const today = getTodayString();
      if (profile.lastVoteResetDate !== today) {
        // Reset votes for new day
        await db
          .update(userProfiles)
          .set({
            votesToday: 0,
            lastVoteResetDate: today,
            updatedAt: new Date(),
          })
          .where(eq(userProfiles.id, profile.id));

        profile.votesToday = 0;
        profile.lastVoteResetDate = today;
      }

      // Calculate tier (uses balance + staked)
      const tier = calculateTier(profile.cachedPulseBalance, profile.cachedStakedPulse, profile.currentStreak);
      const voteLimit = TIER_VOTE_LIMITS[tier as keyof typeof TIER_VOTE_LIMITS];

      res.json({
        success: true,
        data: {
          ...profile,
          tier,
          voteLimit,
          votesRemaining: Math.max(0, voteLimit - profile.votesToday),
          canVote: profile.votesToday < voteLimit,
        },
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ success: false, error: "Failed to fetch profile" });
    }
  });

  /**
   * POST /api/user/sync-tier/:address
   * Recalculate tier from on-chain PULSE balance and staked amount
   */
  app.post("/api/user/sync-tier/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const { pulseBalance, stakedAmount } = req.body; // Frontend sends both balance and staked amount

      if (pulseBalance === undefined) {
        return res.status(400).json({ success: false, error: "pulseBalance is required" });
      }

      const profile = await getOrCreateProfile(address);
      // Use provided stakedAmount or fall back to cached value
      const staked = stakedAmount !== undefined ? stakedAmount.toString() : profile.cachedStakedPulse;
      const tier = calculateTier(pulseBalance, staked, profile.currentStreak);

      // Update cached tier, balance, and staked amount
      const [updated] = await db
        .update(userProfiles)
        .set({
          cachedTier: tier,
          cachedPulseBalance: pulseBalance.toString(),
          cachedStakedPulse: staked,
          tierLastUpdated: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.id, profile.id))
        .returning();

      const voteLimit = TIER_VOTE_LIMITS[tier as keyof typeof TIER_VOTE_LIMITS];

      res.json({
        success: true,
        data: {
          ...updated,
          tier,
          voteLimit,
          votesRemaining: Math.max(0, voteLimit - updated.votesToday),
          canVote: updated.votesToday < voteLimit,
        },
      });
    } catch (error) {
      console.error("Error syncing tier:", error);
      res.status(500).json({ success: false, error: "Failed to sync tier" });
    }
  });

  // ============================================
  // Vote Limit Routes
  // ============================================

  /**
   * GET /api/votes/remaining/:address
   * Get remaining votes for today
   */
  app.get("/api/votes/remaining/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const profile = await getOrCreateProfile(address);

      const today = getTodayString();
      let votesToday = profile.votesToday;

      // Reset if new day
      if (profile.lastVoteResetDate !== today) {
        votesToday = 0;
      }

      const tier = calculateTier(profile.cachedPulseBalance, profile.cachedStakedPulse, profile.currentStreak);
      const voteLimit = TIER_VOTE_LIMITS[tier as keyof typeof TIER_VOTE_LIMITS];

      res.json({
        success: true,
        data: {
          tier,
          voteLimit,
          votesUsed: votesToday,
          votesRemaining: Math.max(0, voteLimit - votesToday),
          canVote: votesToday < voteLimit,
          streak: profile.currentStreak,
        },
      });
    } catch (error) {
      console.error("Error getting remaining votes:", error);
      res.status(500).json({ success: false, error: "Failed to get remaining votes" });
    }
  });

  /**
   * POST /api/votes/record/:address
   * Record a vote (called after successful on-chain vote)
   */
  app.post("/api/votes/record/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const { pollId } = req.body;

      const profile = await getOrCreateProfile(address);
      const today = getTodayString();
      const yesterday = getYesterdayString();

      // Check if this is the first vote of the day
      const isFirstVoteOfDay = profile.lastVoteDate !== today;

      // Calculate new streak
      let newStreak = profile.currentStreak;
      if (isFirstVoteOfDay) {
        if (profile.lastVoteDate === yesterday) {
          // Continue streak
          newStreak = profile.currentStreak + 1;
        } else {
          // Reset streak (missed a day)
          newStreak = 1;
        }
      }

      const longestStreak = Math.max(profile.longestStreak, newStreak);

      // Reset votesToday if new day
      let votesToday = profile.votesToday;
      if (profile.lastVoteResetDate !== today) {
        votesToday = 0;
      }

      // Increment votes
      votesToday += 1;

      // Update profile
      const [updated] = await db
        .update(userProfiles)
        .set({
          votesToday,
          currentStreak: newStreak,
          longestStreak,
          lastVoteDate: today,
          lastVoteResetDate: today,
          seasonVotes: profile.seasonVotes + 1,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.id, profile.id))
        .returning();

      // Log daily vote
      const [existingLog] = await db
        .select()
        .from(dailyVoteLogs)
        .where(
          and(
            eq(dailyVoteLogs.walletAddress, profile.walletAddress),
            eq(dailyVoteLogs.voteDate, today)
          )
        )
        .limit(1);

      if (existingLog) {
        // Update existing log
        const pollIds = existingLog.pollIds || [];
        if (pollId && !pollIds.includes(pollId)) {
          pollIds.push(pollId);
        }
        await db
          .update(dailyVoteLogs)
          .set({
            voteCount: existingLog.voteCount + 1,
            pollIds,
          })
          .where(eq(dailyVoteLogs.id, existingLog.id));
      } else {
        // Create new log
        await db.insert(dailyVoteLogs).values({
          walletAddress: profile.walletAddress,
          voteDate: today,
          voteCount: 1,
          pollIds: pollId ? [pollId] : [],
        });
      }

      // Update quest progress for vote-related quests
      // (This would trigger quest progress updates)

      // Check and award referral milestones based on total votes
      try {
        await checkReferralMilestones(profile.walletAddress, updated.seasonVotes);
      } catch (refError) {
        console.error("Error checking referral milestones:", refError);
        // Don't fail the vote recording if referral check fails
      }

      const tier = calculateTier(updated.cachedPulseBalance, updated.cachedStakedPulse, updated.currentStreak);
      const voteLimit = TIER_VOTE_LIMITS[tier as keyof typeof TIER_VOTE_LIMITS];

      res.json({
        success: true,
        data: {
          ...updated,
          tier,
          voteLimit,
          votesRemaining: Math.max(0, voteLimit - updated.votesToday),
          canVote: updated.votesToday < voteLimit,
          streakIncreased: isFirstVoteOfDay,
          newStreak,
        },
      });
    } catch (error) {
      console.error("Error recording vote:", error);
      res.status(500).json({ success: false, error: "Failed to record vote" });
    }
  });

  // ============================================
  // Season Routes
  // ============================================

  /**
   * GET /api/seasons/current
   * Get the current active season
   */
  app.get("/api/seasons/current", async (req, res) => {
    try {
      const now = new Date();

      const [currentSeason] = await db
        .select()
        .from(seasons)
        .where(eq(seasons.status, SEASON_STATUS.ACTIVE))
        .limit(1);

      if (!currentSeason) {
        return res.json({ success: true, season: null });
      }

      res.json({ success: true, season: currentSeason });
    } catch (error) {
      console.error("Error fetching current season:", error);
      res.status(500).json({ success: false, error: "Failed to fetch season" });
    }
  });

  /**
   * GET /api/seasons/:seasonId/leaderboard
   * Get leaderboard for a season
   */
  app.get("/api/seasons/:seasonId/leaderboard", async (req, res) => {
    try {
      const { seasonId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const leaderboard = await db
        .select()
        .from(seasonLeaderboard)
        .where(eq(seasonLeaderboard.seasonId, seasonId))
        .orderBy(desc(seasonLeaderboard.totalPoints))
        .limit(limit)
        .offset(offset);

      res.json({ success: true, data: leaderboard });
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ success: false, error: "Failed to fetch leaderboard" });
    }
  });

  /**
   * GET /api/seasons/:seasonId/user/:address
   * Get user's stats for a season
   */
  app.get("/api/seasons/:seasonId/user/:address", async (req, res) => {
    try {
      const { seasonId, address } = req.params;
      const normalizedAddress = address.toLowerCase();

      // Get user's leaderboard entry
      const [entry] = await db
        .select()
        .from(seasonLeaderboard)
        .where(
          and(
            eq(seasonLeaderboard.seasonId, seasonId),
            eq(seasonLeaderboard.walletAddress, normalizedAddress)
          )
        )
        .limit(1);

      // Calculate rank if not stored
      let rank = entry?.rank;
      if (!rank && entry) {
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(seasonLeaderboard)
          .where(
            and(
              eq(seasonLeaderboard.seasonId, seasonId),
              sql`${seasonLeaderboard.totalPoints} > ${entry.totalPoints}`
            )
          );
        rank = (countResult?.count || 0) + 1;
      }

      res.json({
        success: true,
        data: entry ? { ...entry, rank } : null,
      });
    } catch (error) {
      console.error("Error fetching user season stats:", error);
      res.status(500).json({ success: false, error: "Failed to fetch stats" });
    }
  });

  // ============================================
  // Quest Routes
  // ============================================

  /**
   * GET /api/quests/active/:seasonId
   * Get active quests for a season
   */
  app.get("/api/quests/active/:seasonId", async (req, res) => {
    try {
      const { seasonId } = req.params;

      const activeQuests = await db
        .select()
        .from(quests)
        .where(
          and(
            eq(quests.seasonId, seasonId),
            eq(quests.active, true)
          )
        )
        .orderBy(quests.questType, quests.points);

      res.json({ success: true, quests: activeQuests });
    } catch (error) {
      console.error("Error fetching quests:", error);
      res.status(500).json({ success: false, error: "Failed to fetch quests" });
    }
  });

  /**
   * GET /api/quests/creator/:address
   * Get quests created by a specific address
   */
  app.get("/api/quests/creator/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const { seasonId } = req.query;
      const normalizedAddress = address.toLowerCase();

      let query = db
        .select()
        .from(quests)
        .where(eq(quests.creatorAddress, normalizedAddress));

      if (seasonId && typeof seasonId === "string") {
        query = db
          .select()
          .from(quests)
          .where(
            and(
              eq(quests.creatorAddress, normalizedAddress),
              eq(quests.seasonId, seasonId)
            )
          );
      }

      const creatorQuests = await query.orderBy(quests.questType, quests.createdAt);

      res.json({ success: true, quests: creatorQuests });
    } catch (error) {
      console.error("Error fetching creator quests:", error);
      res.status(500).json({ success: false, error: "Failed to fetch quests" });
    }
  });

  /**
   * GET /api/quests/progress/:address/:seasonId
   * Get user's progress on all quests
   */
  app.get("/api/quests/progress/:address/:seasonId", async (req, res) => {
    try {
      const { address, seasonId } = req.params;
      const normalizedAddress = address.toLowerCase();

      const progress = await db
        .select()
        .from(questProgress)
        .where(
          and(
            eq(questProgress.walletAddress, normalizedAddress),
            eq(questProgress.seasonId, seasonId)
          )
        );

      res.json({ success: true, data: progress });
    } catch (error) {
      console.error("Error fetching quest progress:", error);
      res.status(500).json({ success: false, error: "Failed to fetch progress" });
    }
  });

  /**
   * POST /api/quests/claim/:address/:questId
   * Claim points for a completed quest
   */
  app.post("/api/quests/claim/:address/:questId", async (req, res) => {
    try {
      const { address, questId } = req.params;
      const normalizedAddress = address.toLowerCase();

      // Get quest and progress
      const [quest] = await db
        .select()
        .from(quests)
        .where(eq(quests.id, questId))
        .limit(1);

      if (!quest) {
        return res.status(404).json({ success: false, error: "Quest not found" });
      }

      const [progress] = await db
        .select()
        .from(questProgress)
        .where(
          and(
            eq(questProgress.walletAddress, normalizedAddress),
            eq(questProgress.questId, questId)
          )
        )
        .limit(1);

      if (!progress) {
        return res.status(404).json({ success: false, error: "No progress found" });
      }

      if (progress.completed && progress.pointsAwarded > 0) {
        return res.status(400).json({ success: false, error: "Quest already claimed" });
      }

      if (progress.currentValue < quest.targetValue) {
        return res.status(400).json({ success: false, error: "Quest not completed" });
      }

      // Award points
      const [updatedProgress] = await db
        .update(questProgress)
        .set({
          completed: true,
          completedAt: new Date(),
          pointsAwarded: quest.points,
          updatedAt: new Date(),
        })
        .where(eq(questProgress.id, progress.id))
        .returning();

      // Update user's season points
      const profile = await getOrCreateProfile(address);
      await db
        .update(userProfiles)
        .set({
          seasonPoints: profile.seasonPoints + quest.points,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.id, profile.id));

      // Update leaderboard
      const [leaderboardEntry] = await db
        .select()
        .from(seasonLeaderboard)
        .where(
          and(
            eq(seasonLeaderboard.seasonId, quest.seasonId),
            eq(seasonLeaderboard.walletAddress, normalizedAddress)
          )
        )
        .limit(1);

      if (leaderboardEntry) {
        await db
          .update(seasonLeaderboard)
          .set({
            totalPoints: leaderboardEntry.totalPoints + quest.points,
            questsCompleted: leaderboardEntry.questsCompleted + 1,
            updatedAt: new Date(),
          })
          .where(eq(seasonLeaderboard.id, leaderboardEntry.id));
      } else {
        await db.insert(seasonLeaderboard).values({
          seasonId: quest.seasonId,
          walletAddress: normalizedAddress,
          totalPoints: quest.points,
          questsCompleted: 1,
        });
      }

      res.json({
        success: true,
        data: {
          ...updatedProgress,
          pointsEarned: quest.points,
        },
      });
    } catch (error) {
      console.error("Error claiming quest:", error);
      res.status(500).json({ success: false, error: "Failed to claim quest" });
    }
  });

  // ============================================
  // Admin/Creator Routes (for quest/season management)
  // ============================================

  /**
   * POST /api/seasons
   * Create a new season (admin/creator only)
   */
  app.post("/api/seasons", async (req, res) => {
    try {
      const { name, description, startTime, endTime, totalPulsePool, creatorAddress } = req.body;

      if (!name || !startTime || !endTime || !creatorAddress) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }

      // Get next season number
      const [lastSeason] = await db
        .select()
        .from(seasons)
        .orderBy(desc(seasons.seasonNumber))
        .limit(1);

      const seasonNumber = (lastSeason?.seasonNumber || 0) + 1;

      const [newSeason] = await db
        .insert(seasons)
        .values({
          seasonNumber,
          name,
          description,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          totalPulsePool: totalPulsePool?.toString() || "0",
          status: SEASON_STATUS.PENDING,
          creatorAddress: creatorAddress.toLowerCase(),
        })
        .returning();

      res.json({ success: true, data: newSeason });
    } catch (error) {
      console.error("Error creating season:", error);
      res.status(500).json({ success: false, error: "Failed to create season" });
    }
  });

  /**
   * POST /api/quests
   * Create a new quest (admin/creator only)
   */
  app.post("/api/quests", async (req, res) => {
    try {
      const {
        seasonId,
        questType,
        name,
        description,
        points,
        targetValue,
        targetAction,
        creatorAddress,
        startsAt,
        endsAt,
        maxCompletions,
      } = req.body;

      if (!seasonId || questType === undefined || !name || !points || !targetValue || !targetAction || !creatorAddress) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }

      const [newQuest] = await db
        .insert(quests)
        .values({
          seasonId,
          questType,
          name,
          description,
          points,
          targetValue,
          targetAction,
          creatorAddress: creatorAddress.toLowerCase(),
          active: true,
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
          maxCompletions,
        })
        .returning();

      res.json({ success: true, data: newQuest });
    } catch (error) {
      console.error("Error creating quest:", error);
      res.status(500).json({ success: false, error: "Failed to create quest" });
    }
  });

  /**
   * PATCH /api/seasons/:seasonId/status
   * Update season status (admin only)
   */
  app.patch("/api/seasons/:seasonId/status", async (req, res) => {
    try {
      const { seasonId } = req.params;
      const { status } = req.body;

      if (status === undefined) {
        return res.status(400).json({ success: false, error: "Status is required" });
      }

      const [updated] = await db
        .update(seasons)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(seasons.id, seasonId))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error("Error updating season status:", error);
      res.status(500).json({ success: false, error: "Failed to update status" });
    }
  });

  // ============================================
  // Gas Sponsorship Routes
  // ============================================

  /**
   * GET /api/sponsorship-status
   * Check gas sponsorship availability for an address
   */
  app.get("/api/sponsorship-status", async (req, res) => {
    try {
      const { address, network } = req.query;

      if (!address || typeof address !== "string") {
        return res.status(400).json({ success: false, error: "Address is required" });
      }

      const normalizedAddress = address.toLowerCase();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Count today's sponsored transactions
      const dailyLogs = await db
        .select()
        .from(sponsorshipLogs)
        .where(
          and(
            eq(sponsorshipLogs.walletAddress, normalizedAddress),
            gte(sponsorshipLogs.createdAt, today)
          )
        );

      const dailyUsed = dailyLogs.length;
      const remaining = Math.max(0, DAILY_SPONSORSHIP_LIMIT - dailyUsed);

      // Get user settings
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.walletAddress, normalizedAddress))
        .limit(1);

      res.json({
        success: true,
        dailyUsed,
        dailyLimit: DAILY_SPONSORSHIP_LIMIT,
        remaining,
        enabled: settings?.gasSponsorshipEnabled ?? true, // Default to enabled
      });
    } catch (error) {
      console.error("Error checking sponsorship status:", error);
      res.status(500).json({ success: false, error: "Failed to check status" });
    }
  });

  /**
   * POST /api/sponsor-transaction
   * Sponsor and submit a transaction via Shinami Gas Station
   */
  app.post("/api/sponsor-transaction", async (req, res) => {
    try {
      const { serializedTransaction, senderSignature, senderAddress, network } = req.body;

      if (!serializedTransaction || !senderSignature || !senderAddress) {
        return res.status(400).json({
          success: false,
          error: "Missing required parameters",
          fallbackRequired: true,
        });
      }

      const normalizedAddress = senderAddress.toLowerCase();
      const networkType = network === "mainnet" ? "mainnet" : "testnet";

      // Check rate limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dailyLogs = await db
        .select()
        .from(sponsorshipLogs)
        .where(
          and(
            eq(sponsorshipLogs.walletAddress, normalizedAddress),
            gte(sponsorshipLogs.createdAt, today)
          )
        );

      const dailyUsed = dailyLogs.length;

      if (dailyUsed >= DAILY_SPONSORSHIP_LIMIT) {
        return res.json({
          success: false,
          fallbackRequired: true,
          reason: "daily_limit",
          dailyUsed,
          dailyLimit: DAILY_SPONSORSHIP_LIMIT,
        });
      }

      // Select API key based on network
      const apiKey = networkType === "mainnet"
        ? process.env.SHINAMI_GAS_KEY_MAINNET
        : process.env.SHINAMI_GAS_KEY_TESTNET;

      if (!apiKey) {
        console.error(`Shinami API key not configured for ${networkType}`);
        return res.json({
          success: false,
          fallbackRequired: true,
          error: "Gas sponsorship not configured for this network",
        });
      }

      // Call Shinami Gas Station API
      const shinamiResponse = await fetch("https://api.us1.shinami.com/movement/gas/v1", {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "gas_sponsorAndSubmitSignedTransaction",
          params: [serializedTransaction, senderSignature],
          id: 1,
        }),
      });

      if (!shinamiResponse.ok) {
        const errorText = await shinamiResponse.text();
        console.error("Shinami API error:", errorText);
        return res.json({
          success: false,
          fallbackRequired: true,
          error: "Shinami API error",
        });
      }

      const result = await shinamiResponse.json();

      // Check for JSON-RPC errors
      if (result.error) {
        console.error("Shinami RPC error:", result.error);
        return res.json({
          success: false,
          fallbackRequired: true,
          error: result.error.message || "Shinami RPC error",
        });
      }

      const pendingTx = result.result?.pendingTransaction;

      if (!pendingTx?.hash) {
        console.error("Unexpected Shinami response:", result);
        return res.json({
          success: false,
          fallbackRequired: true,
          error: "Unexpected response from Shinami",
        });
      }

      // Log successful sponsorship
      await db.insert(sponsorshipLogs).values({
        walletAddress: normalizedAddress,
        txHash: pendingTx.hash,
        network: networkType,
      });

      res.json({
        success: true,
        transactionHash: pendingTx.hash,
        sender: pendingTx.sender,
        sequenceNumber: pendingTx.sequence_number,
        sponsored: true,
        dailyUsed: dailyUsed + 1,
        dailyLimit: DAILY_SPONSORSHIP_LIMIT,
      });
    } catch (error) {
      console.error("Error sponsoring transaction:", error);
      res.json({
        success: false,
        fallbackRequired: true,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/user/settings/:address
   * Get user settings including gas sponsorship preference
   */
  app.get("/api/user/settings/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const normalizedAddress = address.toLowerCase();

      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.walletAddress, normalizedAddress))
        .limit(1);

      if (!settings) {
        // Return defaults
        return res.json({
          success: true,
          data: {
            walletAddress: normalizedAddress,
            gasSponsorshipEnabled: true, // Default to enabled
          },
        });
      }

      res.json({ success: true, data: settings });
    } catch (error) {
      console.error("Error fetching user settings:", error);
      res.status(500).json({ success: false, error: "Failed to fetch settings" });
    }
  });

  /**
   * PUT /api/user/settings/:address
   * Update user settings
   */
  app.put("/api/user/settings/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const { gasSponsorshipEnabled } = req.body;
      const normalizedAddress = address.toLowerCase();

      // Upsert settings
      const [existing] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.walletAddress, normalizedAddress))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(userSettings)
          .set({
            gasSponsorshipEnabled: gasSponsorshipEnabled ?? existing.gasSponsorshipEnabled,
            updatedAt: new Date(),
          })
          .where(eq(userSettings.id, existing.id))
          .returning();

        res.json({ success: true, data: updated });
      } else {
        const [created] = await db
          .insert(userSettings)
          .values({
            walletAddress: normalizedAddress,
            gasSponsorshipEnabled: gasSponsorshipEnabled ?? true,
          })
          .returning();

        res.json({ success: true, data: created });
      }
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ success: false, error: "Failed to update settings" });
    }
  });

  // ============================================
  // Referral System Endpoints
  // ============================================

  /**
   * Generate a short referral code from wallet address
   */
  function generateReferralCode(walletAddress: string): string {
    // Use last 8 characters of the address + random suffix
    const addressPart = walletAddress.slice(-6).toUpperCase();
    const randomPart = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${addressPart}${randomPart}`;
  }

  /**
   * Calculate referral tier based on active referrals
   */
  function calculateReferralTier(activeReferrals: number): number {
    if (activeReferrals >= REFERRAL_TIER_THRESHOLDS[REFERRAL_TIERS.PLATINUM]) {
      return REFERRAL_TIERS.PLATINUM;
    } else if (activeReferrals >= REFERRAL_TIER_THRESHOLDS[REFERRAL_TIERS.GOLD]) {
      return REFERRAL_TIERS.GOLD;
    } else if (activeReferrals >= REFERRAL_TIER_THRESHOLDS[REFERRAL_TIERS.SILVER]) {
      return REFERRAL_TIERS.SILVER;
    } else if (activeReferrals >= REFERRAL_TIER_THRESHOLDS[REFERRAL_TIERS.BRONZE]) {
      return REFERRAL_TIERS.BRONZE;
    }
    return REFERRAL_TIERS.NONE;
  }

  /**
   * Get or create referral stats for a user
   */
  async function getOrCreateReferralStats(walletAddress: string) {
    const normalizedAddress = walletAddress.toLowerCase();

    const [existing] = await db
      .select()
      .from(referralStats)
      .where(eq(referralStats.walletAddress, normalizedAddress))
      .limit(1);

    if (existing) return existing;

    const [created] = await db
      .insert(referralStats)
      .values({ walletAddress: normalizedAddress })
      .returning();

    return created;
  }

  /**
   * Award referral milestone and update stats
   */
  async function awardReferralMilestone(
    referralId: string,
    referrerAddress: string,
    refereeAddress: string,
    milestoneType: string
  ): Promise<{ referrerPoints: number; refereePoints: number } | null> {
    // Check if milestone already awarded
    const [existingMilestone] = await db
      .select()
      .from(referralMilestones)
      .where(
        and(
          eq(referralMilestones.referralId, referralId),
          eq(referralMilestones.milestoneType, milestoneType)
        )
      )
      .limit(1);

    if (existingMilestone) return null;

    // Get referrer's stats to calculate tier multiplier
    const referrerStats = await getOrCreateReferralStats(referrerAddress);
    const tierMultiplier = REFERRAL_TIER_MULTIPLIERS[referrerStats.currentTier as keyof typeof REFERRAL_TIER_MULTIPLIERS] || 1;

    // Get base rewards
    const baseRewards = REFERRAL_REWARDS[milestoneType as keyof typeof REFERRAL_REWARDS];
    if (!baseRewards) return null;

    const referrerPoints = Math.floor(baseRewards.referrer * tierMultiplier);
    const refereePoints = baseRewards.referee;

    // Create milestone record
    await db.insert(referralMilestones).values({
      referralId,
      milestoneType,
      referrerPointsAwarded: referrerPoints,
      refereePointsAwarded: refereePoints,
    });

    // Update referrer's stats
    await db
      .update(referralStats)
      .set({
        totalPointsEarned: sql`${referralStats.totalPointsEarned} + ${referrerPoints}`,
        updatedAt: new Date(),
      })
      .where(eq(referralStats.walletAddress, referrerAddress.toLowerCase()));

    // Update referee's season points if they have a profile
    if (refereePoints > 0) {
      await db
        .update(userProfiles)
        .set({
          seasonPoints: sql`${userProfiles.seasonPoints} + ${refereePoints}`,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.walletAddress, refereeAddress.toLowerCase()));
    }

    // Update referrer's season points
    if (referrerPoints > 0) {
      await db
        .update(userProfiles)
        .set({
          seasonPoints: sql`${userProfiles.seasonPoints} + ${referrerPoints}`,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.walletAddress, referrerAddress.toLowerCase()));
    }

    return { referrerPoints, refereePoints };
  }

  /**
   * GET /api/referral/code/:address
   * Get or generate referral code for a wallet address
   */
  app.get("/api/referral/code/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const normalizedAddress = address.toLowerCase();

      // Check for existing code
      const [existing] = await db
        .select()
        .from(referralCodes)
        .where(eq(referralCodes.walletAddress, normalizedAddress))
        .limit(1);

      if (existing) {
        return res.json({ success: true, data: existing });
      }

      // Generate new code (with collision handling)
      let code = generateReferralCode(address);
      let attempts = 0;
      while (attempts < 10) {
        const [collision] = await db
          .select()
          .from(referralCodes)
          .where(eq(referralCodes.code, code))
          .limit(1);

        if (!collision) break;
        code = generateReferralCode(address);
        attempts++;
      }

      // Create new referral code
      const [created] = await db
        .insert(referralCodes)
        .values({
          walletAddress: normalizedAddress,
          code,
        })
        .returning();

      // Ensure referral stats exist
      await getOrCreateReferralStats(normalizedAddress);

      res.json({ success: true, data: created });
    } catch (error) {
      console.error("Error getting/creating referral code:", error);
      res.status(500).json({ success: false, error: "Failed to get referral code" });
    }
  });

  /**
   * GET /api/referral/validate/:code
   * Validate a referral code and get referrer info
   */
  app.get("/api/referral/validate/:code", async (req, res) => {
    try {
      const { code } = req.params;

      const [referralCode] = await db
        .select()
        .from(referralCodes)
        .where(eq(referralCodes.code, code.toUpperCase()))
        .limit(1);

      if (!referralCode) {
        return res.status(404).json({ success: false, error: "Invalid referral code" });
      }

      res.json({
        success: true,
        data: {
          code: referralCode.code,
          referrerAddress: referralCode.walletAddress,
        },
      });
    } catch (error) {
      console.error("Error validating referral code:", error);
      res.status(500).json({ success: false, error: "Failed to validate referral code" });
    }
  });

  /**
   * POST /api/referral/track
   * Track a referral when a new user connects with a referral code
   */
  app.post("/api/referral/track", async (req, res) => {
    try {
      const { refereeAddress, referralCode } = req.body;

      if (!refereeAddress || !referralCode) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }

      const normalizedRefereeAddress = refereeAddress.toLowerCase();

      // Check if referee has already been referred
      const [existingReferral] = await db
        .select()
        .from(referrals)
        .where(eq(referrals.refereeAddress, normalizedRefereeAddress))
        .limit(1);

      if (existingReferral) {
        return res.status(400).json({ success: false, error: "User has already been referred" });
      }

      // Validate referral code and get referrer
      const [codeRecord] = await db
        .select()
        .from(referralCodes)
        .where(eq(referralCodes.code, referralCode.toUpperCase()))
        .limit(1);

      if (!codeRecord) {
        return res.status(404).json({ success: false, error: "Invalid referral code" });
      }

      const referrerAddress = codeRecord.walletAddress;

      // Prevent self-referral
      if (referrerAddress === normalizedRefereeAddress) {
        return res.status(400).json({ success: false, error: "Cannot refer yourself" });
      }

      // Prevent circular referral
      const [reverseReferral] = await db
        .select()
        .from(referrals)
        .where(
          and(
            eq(referrals.referrerAddress, normalizedRefereeAddress),
            eq(referrals.refereeAddress, referrerAddress)
          )
        )
        .limit(1);

      if (reverseReferral) {
        return res.status(400).json({ success: false, error: "Circular referral not allowed" });
      }

      // Create referral record
      const [newReferral] = await db
        .insert(referrals)
        .values({
          referrerAddress,
          refereeAddress: normalizedRefereeAddress,
          referralCode: referralCode.toUpperCase(),
          status: REFERRAL_STATUS.WALLET_CONNECTED,
          activatedAt: new Date(),
        })
        .returning();

      // Update referrer's total referrals count
      await db
        .update(referralStats)
        .set({
          totalReferrals: sql`${referralStats.totalReferrals} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(referralStats.walletAddress, referrerAddress));

      // Award wallet_connect milestone
      const milestoneResult = await awardReferralMilestone(
        newReferral.id,
        referrerAddress,
        normalizedRefereeAddress,
        REFERRAL_MILESTONES.WALLET_CONNECT
      );

      res.json({
        success: true,
        data: {
          referral: newReferral,
          milestoneAwarded: milestoneResult,
        },
      });
    } catch (error) {
      console.error("Error tracking referral:", error);
      res.status(500).json({ success: false, error: "Failed to track referral" });
    }
  });

  /**
   * GET /api/referral/stats/:address
   * Get referral statistics for a user
   */
  app.get("/api/referral/stats/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const normalizedAddress = address.toLowerCase();

      const stats = await getOrCreateReferralStats(normalizedAddress);

      // Get referral code
      const [codeRecord] = await db
        .select()
        .from(referralCodes)
        .where(eq(referralCodes.walletAddress, normalizedAddress))
        .limit(1);

      // Calculate next tier threshold
      const currentTier = stats.currentTier;
      let nextTierThreshold = null;
      let nextTierName = null;

      if (currentTier < REFERRAL_TIERS.PLATINUM) {
        const nextTier = currentTier + 1;
        nextTierThreshold = REFERRAL_TIER_THRESHOLDS[nextTier as keyof typeof REFERRAL_TIER_THRESHOLDS];
        nextTierName = ["None", "Bronze", "Silver", "Gold", "Platinum"][nextTier];
      }

      res.json({
        success: true,
        data: {
          ...stats,
          referralCode: codeRecord?.code || null,
          tierName: ["None", "Bronze", "Silver", "Gold", "Platinum"][currentTier],
          tierMultiplier: REFERRAL_TIER_MULTIPLIERS[currentTier as keyof typeof REFERRAL_TIER_MULTIPLIERS],
          nextTierThreshold,
          nextTierName,
        },
      });
    } catch (error) {
      console.error("Error getting referral stats:", error);
      res.status(500).json({ success: false, error: "Failed to get referral stats" });
    }
  });

  /**
   * GET /api/referral/referees/:address
   * Get list of referees for a referrer
   */
  app.get("/api/referral/referees/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const normalizedAddress = address.toLowerCase();

      const refereeList = await db
        .select({
          id: referrals.id,
          refereeAddress: referrals.refereeAddress,
          status: referrals.status,
          createdAt: referrals.createdAt,
          activatedAt: referrals.activatedAt,
          completedAt: referrals.completedAt,
        })
        .from(referrals)
        .where(eq(referrals.referrerAddress, normalizedAddress))
        .orderBy(desc(referrals.createdAt));

      // Get milestones for each referral
      const refereesWithMilestones = await Promise.all(
        refereeList.map(async (referee) => {
          const milestones = await db
            .select()
            .from(referralMilestones)
            .where(eq(referralMilestones.referralId, referee.id))
            .orderBy(desc(referralMilestones.achievedAt));

          const totalPointsFromReferee = milestones.reduce(
            (sum, m) => sum + m.referrerPointsAwarded,
            0
          );

          return {
            ...referee,
            milestones,
            totalPointsEarned: totalPointsFromReferee,
          };
        })
      );

      res.json({ success: true, data: refereesWithMilestones });
    } catch (error) {
      console.error("Error getting referees:", error);
      res.status(500).json({ success: false, error: "Failed to get referees" });
    }
  });

  /**
   * GET /api/referral/leaderboard
   * Get referral leaderboard
   */
  app.get("/api/referral/leaderboard", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const leaderboard = await db
        .select()
        .from(referralStats)
        .where(gte(referralStats.totalReferrals, 1))
        .orderBy(desc(referralStats.totalPointsEarned))
        .limit(limit)
        .offset(offset);

      // Add rank
      const rankedLeaderboard = leaderboard.map((entry, index) => ({
        ...entry,
        rank: offset + index + 1,
        tierName: ["None", "Bronze", "Silver", "Gold", "Platinum"][entry.currentTier],
      }));

      res.json({ success: true, data: rankedLeaderboard });
    } catch (error) {
      console.error("Error getting referral leaderboard:", error);
      res.status(500).json({ success: false, error: "Failed to get leaderboard" });
    }
  });

  /**
   * Internal function: Check and award referral milestones based on vote count
   * Called after recording a vote
   */
  async function checkReferralMilestones(walletAddress: string, totalVotes: number) {
    const normalizedAddress = walletAddress.toLowerCase();

    // Find referral where this address is the referee
    const [referral] = await db
      .select()
      .from(referrals)
      .where(eq(referrals.refereeAddress, normalizedAddress))
      .limit(1);

    if (!referral) return;

    const referrerAddress = referral.referrerAddress;

    // Check first_vote milestone
    if (totalVotes >= 1 && referral.status < REFERRAL_STATUS.FIRST_VOTE) {
      await awardReferralMilestone(
        referral.id,
        referrerAddress,
        normalizedAddress,
        REFERRAL_MILESTONES.FIRST_VOTE
      );

      // Update referral status and active referrals count
      await db
        .update(referrals)
        .set({
          status: REFERRAL_STATUS.FIRST_VOTE,
          completedAt: new Date(),
        })
        .where(eq(referrals.id, referral.id));

      // Update referrer's active referrals and recalculate tier
      const [updatedStats] = await db
        .update(referralStats)
        .set({
          activeReferrals: sql`${referralStats.activeReferrals} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(referralStats.walletAddress, referrerAddress))
        .returning();

      if (updatedStats) {
        const newTier = calculateReferralTier(updatedStats.activeReferrals);
        if (newTier !== updatedStats.currentTier) {
          await db
            .update(referralStats)
            .set({ currentTier: newTier, updatedAt: new Date() })
            .where(eq(referralStats.walletAddress, referrerAddress));
        }
      }
    }

    // Check votes_10 milestone
    if (totalVotes >= 10) {
      await awardReferralMilestone(
        referral.id,
        referrerAddress,
        normalizedAddress,
        REFERRAL_MILESTONES.VOTES_10
      );
    }

    // Check votes_50 milestone
    if (totalVotes >= 50) {
      await awardReferralMilestone(
        referral.id,
        referrerAddress,
        normalizedAddress,
        REFERRAL_MILESTONES.VOTES_50
      );
    }

    // Check votes_100 milestone
    if (totalVotes >= 100) {
      await awardReferralMilestone(
        referral.id,
        referrerAddress,
        normalizedAddress,
        REFERRAL_MILESTONES.VOTES_100
      );

      // Mark referral as completed
      if (referral.status < REFERRAL_STATUS.COMPLETED) {
        await db
          .update(referrals)
          .set({ status: REFERRAL_STATUS.COMPLETED })
          .where(eq(referrals.id, referral.id));
      }
    }
  }

  // ============================================
  // Questionnaire System Endpoints
  // ============================================

  /**
   * GET /api/questionnaires
   * List questionnaires with optional filters
   */
  app.get("/api/questionnaires", async (req, res) => {
    try {
      const { status, creator, category, limit: limitParam, offset: offsetParam } = req.query;
      const limit = parseInt(limitParam as string) || 20;
      const offset = parseInt(offsetParam as string) || 0;

      // Build conditions array
      const conditions = [];
      if (status !== undefined) {
        conditions.push(eq(questionnaires.status, parseInt(status as string)));
      }
      if (creator) {
        conditions.push(eq(questionnaires.creatorAddress, (creator as string).toLowerCase()));
      }
      if (category) {
        conditions.push(eq(questionnaires.category, category as string));
      }

      let result;
      if (conditions.length > 0) {
        result = await db
          .select()
          .from(questionnaires)
          .where(conditions.length === 1 ? conditions[0] : and(...conditions))
          .orderBy(desc(questionnaires.createdAt))
          .limit(limit)
          .offset(offset);
      } else {
        result = await db
          .select()
          .from(questionnaires)
          .orderBy(desc(questionnaires.createdAt))
          .limit(limit)
          .offset(offset);
      }

      res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error fetching questionnaires:", error);
      res.status(500).json({ success: false, error: "Failed to fetch questionnaires" });
    }
  });

  /**
   * GET /api/questionnaires/:id
   * Get questionnaire details
   */
  app.get("/api/questionnaires/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const [questionnaire] = await db
        .select()
        .from(questionnaires)
        .where(eq(questionnaires.id, id))
        .limit(1);

      if (!questionnaire) {
        return res.status(404).json({ success: false, error: "Questionnaire not found" });
      }

      // Get polls in this questionnaire
      const polls = await db
        .select()
        .from(questionnairePolls)
        .where(eq(questionnairePolls.questionnaireId, id))
        .orderBy(questionnairePolls.sortOrder);

      res.json({
        success: true,
        data: {
          ...questionnaire,
          polls,
        },
      });
    } catch (error) {
      console.error("Error fetching questionnaire:", error);
      res.status(500).json({ success: false, error: "Failed to fetch questionnaire" });
    }
  });

  /**
   * GET /api/questionnaires/:id/polls
   * Get polls in a questionnaire
   */
  app.get("/api/questionnaires/:id/polls", async (req, res) => {
    try {
      const { id } = req.params;

      const polls = await db
        .select()
        .from(questionnairePolls)
        .where(eq(questionnairePolls.questionnaireId, id))
        .orderBy(questionnairePolls.sortOrder);

      res.json({ success: true, data: polls });
    } catch (error) {
      console.error("Error fetching questionnaire polls:", error);
      res.status(500).json({ success: false, error: "Failed to fetch polls" });
    }
  });

  /**
   * POST /api/questionnaires
   * Create a new questionnaire
   */
  app.post("/api/questionnaires", async (req, res) => {
    try {
      const {
        creatorAddress,
        title,
        description,
        category,
        startTime,
        endTime,
        rewardType,
        totalRewardAmount,
        coinTypeId,
        rewardPerCompletion,
        maxCompleters,
        settings,
        pollIds, // Optional: array of poll IDs to add initially
      } = req.body;

      if (!creatorAddress || !title || !startTime || !endTime) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }

      const normalizedCreator = creatorAddress.toLowerCase();

      // Create questionnaire
      const [newQuestionnaire] = await db
        .insert(questionnaires)
        .values({
          creatorAddress: normalizedCreator,
          title,
          description,
          category,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          rewardType: rewardType ?? QUESTIONNAIRE_REWARD_TYPE.PER_POLL,
          totalRewardAmount: totalRewardAmount?.toString() || "0",
          coinTypeId: coinTypeId ?? 0,
          rewardPerCompletion: rewardPerCompletion?.toString() || "0",
          maxCompleters: maxCompleters || null,
          settings: settings || {},
          status: QUESTIONNAIRE_STATUS.DRAFT,
          pollCount: 0,
          completionCount: 0,
        })
        .returning();

      // Add initial polls if provided
      if (pollIds && Array.isArray(pollIds) && pollIds.length > 0) {
        const pollValues = pollIds.map((pollId: number, index: number) => ({
          questionnaireId: newQuestionnaire.id,
          pollId,
          sortOrder: index,
          source: "existing",
        }));

        await db.insert(questionnairePolls).values(pollValues);

        // Update poll count
        await db
          .update(questionnaires)
          .set({ pollCount: pollIds.length, updatedAt: new Date() })
          .where(eq(questionnaires.id, newQuestionnaire.id));

        newQuestionnaire.pollCount = pollIds.length;
      }

      res.json({ success: true, data: newQuestionnaire });
    } catch (error) {
      console.error("Error creating questionnaire:", error);
      res.status(500).json({ success: false, error: "Failed to create questionnaire" });
    }
  });

  /**
   * PUT /api/questionnaires/:id
   * Update a questionnaire
   */
  app.put("/api/questionnaires/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        category,
        startTime,
        endTime,
        rewardType,
        totalRewardAmount,
        coinTypeId,
        rewardPerCompletion,
        maxCompleters,
        settings,
        status,
        onChainId,
      } = req.body;

      // Build update object
      const updateData: Partial<typeof questionnaires.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (category !== undefined) updateData.category = category;
      if (startTime !== undefined) updateData.startTime = new Date(startTime);
      if (endTime !== undefined) updateData.endTime = new Date(endTime);
      if (rewardType !== undefined) updateData.rewardType = rewardType;
      if (totalRewardAmount !== undefined) updateData.totalRewardAmount = totalRewardAmount.toString();
      if (coinTypeId !== undefined) updateData.coinTypeId = coinTypeId;
      if (rewardPerCompletion !== undefined) updateData.rewardPerCompletion = rewardPerCompletion.toString();
      if (maxCompleters !== undefined) updateData.maxCompleters = maxCompleters;
      if (settings !== undefined) updateData.settings = settings;
      if (status !== undefined) updateData.status = status;
      if (onChainId !== undefined) updateData.onChainId = onChainId;

      const [updated] = await db
        .update(questionnaires)
        .set(updateData)
        .where(eq(questionnaires.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ success: false, error: "Questionnaire not found" });
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error("Error updating questionnaire:", error);
      res.status(500).json({ success: false, error: "Failed to update questionnaire" });
    }
  });

  /**
   * DELETE /api/questionnaires/:id
   * Archive a questionnaire (soft delete)
   */
  app.delete("/api/questionnaires/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const [archived] = await db
        .update(questionnaires)
        .set({
          status: QUESTIONNAIRE_STATUS.ARCHIVED,
          updatedAt: new Date(),
        })
        .where(eq(questionnaires.id, id))
        .returning();

      if (!archived) {
        return res.status(404).json({ success: false, error: "Questionnaire not found" });
      }

      res.json({ success: true, data: archived });
    } catch (error) {
      console.error("Error archiving questionnaire:", error);
      res.status(500).json({ success: false, error: "Failed to archive questionnaire" });
    }
  });

  /**
   * POST /api/questionnaires/:id/polls
   * Add a poll to a questionnaire
   */
  app.post("/api/questionnaires/:id/polls", async (req, res) => {
    try {
      const { id } = req.params;
      const { pollId, source, rewardPercentage } = req.body;

      if (pollId === undefined) {
        return res.status(400).json({ success: false, error: "pollId is required" });
      }

      // Get current max sort order
      const [maxSort] = await db
        .select({ maxOrder: sql<number>`COALESCE(MAX(${questionnairePolls.sortOrder}), -1)` })
        .from(questionnairePolls)
        .where(eq(questionnairePolls.questionnaireId, id));

      const nextOrder = (maxSort?.maxOrder ?? -1) + 1;

      // Add poll
      const [newPoll] = await db
        .insert(questionnairePolls)
        .values({
          questionnaireId: id,
          pollId,
          sortOrder: nextOrder,
          source: source || "existing",
          rewardPercentage,
        })
        .returning();

      // Update poll count
      await db
        .update(questionnaires)
        .set({
          pollCount: sql`${questionnaires.pollCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(questionnaires.id, id));

      res.json({ success: true, data: newPoll });
    } catch (error) {
      console.error("Error adding poll to questionnaire:", error);
      res.status(500).json({ success: false, error: "Failed to add poll" });
    }
  });

  /**
   * DELETE /api/questionnaires/:id/polls/:pollId
   * Remove a poll from a questionnaire
   */
  app.delete("/api/questionnaires/:id/polls/:pollId", async (req, res) => {
    try {
      const { id, pollId } = req.params;

      const [deleted] = await db
        .delete(questionnairePolls)
        .where(
          and(
            eq(questionnairePolls.questionnaireId, id),
            eq(questionnairePolls.pollId, parseInt(pollId))
          )
        )
        .returning();

      if (!deleted) {
        return res.status(404).json({ success: false, error: "Poll not found in questionnaire" });
      }

      // Update poll count
      await db
        .update(questionnaires)
        .set({
          pollCount: sql`GREATEST(${questionnaires.pollCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(questionnaires.id, id));

      res.json({ success: true, data: deleted });
    } catch (error) {
      console.error("Error removing poll from questionnaire:", error);
      res.status(500).json({ success: false, error: "Failed to remove poll" });
    }
  });

  /**
   * PUT /api/questionnaires/:id/polls/order
   * Reorder polls in a questionnaire
   */
  app.put("/api/questionnaires/:id/polls/order", async (req, res) => {
    try {
      const { id } = req.params;
      const { pollOrder } = req.body; // Array of { pollId, sortOrder }

      if (!Array.isArray(pollOrder)) {
        return res.status(400).json({ success: false, error: "pollOrder must be an array" });
      }

      // Update each poll's sort order
      for (const { pollId, sortOrder } of pollOrder) {
        await db
          .update(questionnairePolls)
          .set({ sortOrder })
          .where(
            and(
              eq(questionnairePolls.questionnaireId, id),
              eq(questionnairePolls.pollId, pollId)
            )
          );
      }

      // Fetch updated polls
      const polls = await db
        .select()
        .from(questionnairePolls)
        .where(eq(questionnairePolls.questionnaireId, id))
        .orderBy(questionnairePolls.sortOrder);

      res.json({ success: true, data: polls });
    } catch (error) {
      console.error("Error reordering polls:", error);
      res.status(500).json({ success: false, error: "Failed to reorder polls" });
    }
  });

  /**
   * GET /api/questionnaires/:id/progress/:address
   * Get user's progress on a questionnaire
   */
  app.get("/api/questionnaires/:id/progress/:address", async (req, res) => {
    try {
      const { id, address } = req.params;
      const normalizedAddress = address.toLowerCase();

      const [progress] = await db
        .select()
        .from(questionnaireProgress)
        .where(
          and(
            eq(questionnaireProgress.questionnaireId, id),
            eq(questionnaireProgress.walletAddress, normalizedAddress)
          )
        )
        .limit(1);

      if (!progress) {
        // Return empty progress
        return res.json({
          success: true,
          data: {
            questionnaireId: id,
            walletAddress: normalizedAddress,
            started: false,
            pollsAnswered: [],
            isComplete: false,
            claimed: false,
          },
        });
      }

      res.json({ success: true, data: progress });
    } catch (error) {
      console.error("Error fetching questionnaire progress:", error);
      res.status(500).json({ success: false, error: "Failed to fetch progress" });
    }
  });

  /**
   * POST /api/questionnaires/:id/start/:address
   * Start a questionnaire for a user
   */
  app.post("/api/questionnaires/:id/start/:address", async (req, res) => {
    try {
      const { id, address } = req.params;
      const normalizedAddress = address.toLowerCase();

      // Check if already started
      const [existing] = await db
        .select()
        .from(questionnaireProgress)
        .where(
          and(
            eq(questionnaireProgress.questionnaireId, id),
            eq(questionnaireProgress.walletAddress, normalizedAddress)
          )
        )
        .limit(1);

      if (existing) {
        return res.json({ success: true, data: existing });
      }

      // Create progress record
      const [progress] = await db
        .insert(questionnaireProgress)
        .values({
          questionnaireId: id,
          walletAddress: normalizedAddress,
          started: true,
          startedAt: new Date(),
          pollsAnswered: [],
          isComplete: false,
          claimed: false,
        })
        .returning();

      res.json({ success: true, data: progress });
    } catch (error) {
      console.error("Error starting questionnaire:", error);
      res.status(500).json({ success: false, error: "Failed to start questionnaire" });
    }
  });

  /**
   * PUT /api/questionnaires/:id/progress/:address
   * Update user's progress on a questionnaire
   */
  app.put("/api/questionnaires/:id/progress/:address", async (req, res) => {
    try {
      const { id, address } = req.params;
      const { pollsAnswered, isComplete, bulkVoteTxHash, claimed, claimTxHash } = req.body;
      const normalizedAddress = address.toLowerCase();

      // Build update object
      const updateData: Partial<typeof questionnaireProgress.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (pollsAnswered !== undefined) updateData.pollsAnswered = pollsAnswered;
      if (isComplete !== undefined) {
        updateData.isComplete = isComplete;
        if (isComplete) {
          updateData.completedAt = new Date();
        }
      }
      if (bulkVoteTxHash !== undefined) updateData.bulkVoteTxHash = bulkVoteTxHash;
      if (claimed !== undefined) {
        updateData.claimed = claimed;
        if (claimed) {
          updateData.claimedAt = new Date();
        }
      }
      if (claimTxHash !== undefined) updateData.claimTxHash = claimTxHash;

      // Check if progress exists
      const [existing] = await db
        .select()
        .from(questionnaireProgress)
        .where(
          and(
            eq(questionnaireProgress.questionnaireId, id),
            eq(questionnaireProgress.walletAddress, normalizedAddress)
          )
        )
        .limit(1);

      let result;
      if (existing) {
        [result] = await db
          .update(questionnaireProgress)
          .set(updateData)
          .where(eq(questionnaireProgress.id, existing.id))
          .returning();
      } else {
        // Create new progress record
        [result] = await db
          .insert(questionnaireProgress)
          .values({
            questionnaireId: id,
            walletAddress: normalizedAddress,
            started: true,
            startedAt: new Date(),
            ...updateData,
          })
          .returning();
      }

      // If marked as complete, update questionnaire completion count
      if (isComplete && !existing?.isComplete) {
        await db
          .update(questionnaires)
          .set({
            completionCount: sql`${questionnaires.completionCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(questionnaires.id, id));
      }

      res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error updating questionnaire progress:", error);
      res.status(500).json({ success: false, error: "Failed to update progress" });
    }
  });

  /**
   * POST /api/questionnaires/:id/bulk-vote
   * Record a bulk vote for a questionnaire (called after successful on-chain bulk_vote)
   */
  app.post("/api/questionnaires/:id/bulk-vote", async (req, res) => {
    try {
      const { id } = req.params;
      const { walletAddress, pollIds, optionIndices, txHash } = req.body;

      if (!walletAddress || !pollIds || !optionIndices || !txHash) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }

      const normalizedAddress = walletAddress.toLowerCase();

      // Build pollsAnswered array
      const pollsAnswered = pollIds.map((pollId: number, index: number) => ({
        pollId,
        optionIndex: optionIndices[index],
        answeredAt: new Date().toISOString(),
      }));

      // Get or create progress record
      const [existing] = await db
        .select()
        .from(questionnaireProgress)
        .where(
          and(
            eq(questionnaireProgress.questionnaireId, id),
            eq(questionnaireProgress.walletAddress, normalizedAddress)
          )
        )
        .limit(1);

      let result;
      if (existing) {
        [result] = await db
          .update(questionnaireProgress)
          .set({
            pollsAnswered,
            isComplete: true,
            completedAt: new Date(),
            bulkVoteTxHash: txHash,
            updatedAt: new Date(),
          })
          .where(eq(questionnaireProgress.id, existing.id))
          .returning();
      } else {
        [result] = await db
          .insert(questionnaireProgress)
          .values({
            questionnaireId: id,
            walletAddress: normalizedAddress,
            started: true,
            startedAt: new Date(),
            pollsAnswered,
            isComplete: true,
            completedAt: new Date(),
            bulkVoteTxHash: txHash,
            claimed: false,
          })
          .returning();
      }

      // Update questionnaire completion count if newly completed
      if (!existing?.isComplete) {
        await db
          .update(questionnaires)
          .set({
            completionCount: sql`${questionnaires.completionCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(questionnaires.id, id));
      }

      // Record votes for each poll in dailyVoteLogs
      const today = getTodayString();
      const profile = await getOrCreateProfile(normalizedAddress);

      // Update user's vote count
      const votesToday = profile.lastVoteResetDate === today
        ? profile.votesToday + pollIds.length
        : pollIds.length;

      await db
        .update(userProfiles)
        .set({
          votesToday,
          lastVoteDate: today,
          lastVoteResetDate: today,
          seasonVotes: profile.seasonVotes + pollIds.length,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.id, profile.id));

      res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error recording bulk vote:", error);
      res.status(500).json({ success: false, error: "Failed to record bulk vote" });
    }
  });

  /**
   * GET /api/questionnaires/active
   * Get active questionnaires (for browse page)
   */
  app.get("/api/questionnaires/active", async (req, res) => {
    try {
      const now = new Date();
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const activeQuestionnaires = await db
        .select()
        .from(questionnaires)
        .where(
          and(
            eq(questionnaires.status, QUESTIONNAIRE_STATUS.ACTIVE),
            gte(questionnaires.endTime, now)
          )
        )
        .orderBy(desc(questionnaires.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({ success: true, data: activeQuestionnaires });
    } catch (error) {
      console.error("Error fetching active questionnaires:", error);
      res.status(500).json({ success: false, error: "Failed to fetch questionnaires" });
    }
  });

  /**
   * GET /api/questionnaires/creator/:address
   * Get questionnaires created by a specific address
   */
  app.get("/api/questionnaires/creator/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const normalizedAddress = address.toLowerCase();

      const creatorQuestionnaires = await db
        .select()
        .from(questionnaires)
        .where(eq(questionnaires.creatorAddress, normalizedAddress))
        .orderBy(desc(questionnaires.createdAt));

      res.json({ success: true, data: creatorQuestionnaires });
    } catch (error) {
      console.error("Error fetching creator questionnaires:", error);
      res.status(500).json({ success: false, error: "Failed to fetch questionnaires" });
    }
  });

  return httpServer;
}
