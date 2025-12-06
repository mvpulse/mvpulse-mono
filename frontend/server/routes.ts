import type { Express } from "express";
import { createServer, type Server } from "http";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./db";
import {
  userProfiles,
  seasons,
  quests,
  questProgress,
  dailyVoteLogs,
  seasonLeaderboard,
  userSeasonSnapshots,
  TIERS,
  TIER_VOTE_LIMITS,
  TIER_PULSE_THRESHOLDS,
  QUEST_TYPES,
  SEASON_STATUS,
  type UserProfile,
  type Season,
  type Quest,
} from "@shared/schema";

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate tier based on PULSE balance and streak
 */
function calculateTier(pulseBalance: bigint | string, streak: number): number {
  const balance = typeof pulseBalance === "string" ? BigInt(pulseBalance) : pulseBalance;

  // Determine tier from PULSE balance
  let tierFromPulse: number = TIERS.BRONZE;
  if (balance >= BigInt(TIER_PULSE_THRESHOLDS[TIERS.PLATINUM])) {
    tierFromPulse = TIERS.PLATINUM;
  } else if (balance >= BigInt(TIER_PULSE_THRESHOLDS[TIERS.GOLD])) {
    tierFromPulse = TIERS.GOLD;
  } else if (balance >= BigInt(TIER_PULSE_THRESHOLDS[TIERS.SILVER])) {
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

      // Calculate tier
      const tier = calculateTier(profile.cachedPulseBalance, profile.currentStreak);
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
   * Recalculate tier from on-chain PULSE balance
   */
  app.post("/api/user/sync-tier/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const { pulseBalance } = req.body; // Frontend sends the fetched balance

      if (pulseBalance === undefined) {
        return res.status(400).json({ success: false, error: "pulseBalance is required" });
      }

      const profile = await getOrCreateProfile(address);
      const tier = calculateTier(pulseBalance, profile.currentStreak);

      // Update cached tier and balance
      const [updated] = await db
        .update(userProfiles)
        .set({
          cachedTier: tier,
          cachedPulseBalance: pulseBalance.toString(),
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

      const tier = calculateTier(profile.cachedPulseBalance, profile.currentStreak);
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

      const tier = calculateTier(updated.cachedPulseBalance, updated.currentStreak);
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
        return res.json({ success: true, data: null });
      }

      res.json({ success: true, data: currentSeason });
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

  return httpServer;
}
