import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================
// Tier & Quest System Constants
// ============================================

export const TIERS = {
  BRONZE: 0,
  SILVER: 1,
  GOLD: 2,
  PLATINUM: 3,
} as const;

export const TIER_NAMES = {
  [TIERS.BRONZE]: "Bronze",
  [TIERS.SILVER]: "Silver",
  [TIERS.GOLD]: "Gold",
  [TIERS.PLATINUM]: "Platinum",
} as const;

export const TIER_VOTE_LIMITS = {
  [TIERS.BRONZE]: 3,
  [TIERS.SILVER]: 6,
  [TIERS.GOLD]: 9,
  [TIERS.PLATINUM]: 12,
} as const;

// PULSE thresholds for tier calculation (in octas, 1e8 = 1 PULSE)
export const TIER_PULSE_THRESHOLDS = {
  [TIERS.BRONZE]: 0,
  [TIERS.SILVER]: 1000 * 1e8,    // 1,000 PULSE
  [TIERS.GOLD]: 10000 * 1e8,     // 10,000 PULSE
  [TIERS.PLATINUM]: 100000 * 1e8, // 100,000 PULSE
} as const;

export const QUEST_TYPES = {
  DAILY: 0,
  WEEKLY: 1,
  ACHIEVEMENT: 2,
  SPECIAL: 3,
} as const;

export const QUEST_TYPE_NAMES = {
  [QUEST_TYPES.DAILY]: "Daily",
  [QUEST_TYPES.WEEKLY]: "Weekly",
  [QUEST_TYPES.ACHIEVEMENT]: "Achievement",
  [QUEST_TYPES.SPECIAL]: "Special",
} as const;

export const SEASON_STATUS = {
  PENDING: 0,
  ACTIVE: 1,
  ENDED: 2,
  DISTRIBUTED: 3,
} as const;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============================================
// User Profiles (for tier/streak tracking)
// ============================================

export const userProfiles = pgTable("user_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address", { length: 66 }).notNull().unique(),

  // Streak tracking
  currentStreak: integer("current_streak").default(0).notNull(),
  longestStreak: integer("longest_streak").default(0).notNull(),
  lastVoteDate: date("last_vote_date"),

  // Daily vote tracking
  votesToday: integer("votes_today").default(0).notNull(),
  lastVoteResetDate: date("last_vote_reset_date"),

  // Season tracking
  currentSeasonId: integer("current_season_id"),
  seasonPoints: integer("season_points").default(0).notNull(),
  seasonVotes: integer("season_votes").default(0).notNull(),

  // Cached tier (recalculated on login/vote)
  cachedTier: integer("cached_tier").default(0).notNull(),
  cachedPulseBalance: varchar("cached_pulse_balance", { length: 50 }).default("0").notNull(),
  tierLastUpdated: timestamp("tier_last_updated"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

// ============================================
// Seasons
// ============================================

export const seasons = pgTable("seasons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  seasonNumber: integer("season_number").notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),

  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),

  totalPulsePool: varchar("total_pulse_pool", { length: 50 }).default("0").notNull(), // In octas
  status: integer("status").default(SEASON_STATUS.PENDING).notNull(),

  creatorAddress: varchar("creator_address", { length: 66 }).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Season = typeof seasons.$inferSelect;
export type InsertSeason = typeof seasons.$inferInsert;

// ============================================
// Quests
// ============================================

export const quests = pgTable("quests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  seasonId: varchar("season_id", { length: 36 }).notNull(),

  questType: integer("quest_type").notNull(), // 0=daily, 1=weekly, 2=achievement, 3=special
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),

  points: integer("points").notNull(), // Points awarded on completion
  targetValue: integer("target_value").notNull(), // e.g., "vote 3 times" = 3
  targetAction: varchar("target_action", { length: 50 }).notNull(), // e.g., "vote", "create_poll", "claim_reward"

  creatorAddress: varchar("creator_address", { length: 66 }).notNull(),
  active: boolean("active").default(true).notNull(),

  // For special/limited quests
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  maxCompletions: integer("max_completions"), // Global limit on how many can complete

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Quest = typeof quests.$inferSelect;
export type InsertQuest = typeof quests.$inferInsert;

// ============================================
// Quest Progress (user progress on quests)
// ============================================

export const questProgress = pgTable("quest_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address", { length: 66 }).notNull(),
  questId: varchar("quest_id", { length: 36 }).notNull(),
  seasonId: varchar("season_id", { length: 36 }).notNull(),

  currentValue: integer("current_value").default(0).notNull(), // Progress towards target
  completed: boolean("completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  pointsAwarded: integer("points_awarded").default(0).notNull(),

  // For daily/weekly quests - tracks reset periods
  periodStart: date("period_start"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type QuestProgress = typeof questProgress.$inferSelect;
export type InsertQuestProgress = typeof questProgress.$inferInsert;

// ============================================
// Daily Vote Logs (for streak calculation)
// ============================================

export const dailyVoteLogs = pgTable("daily_vote_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address", { length: 66 }).notNull(),
  voteDate: date("vote_date").notNull(),
  voteCount: integer("vote_count").default(0).notNull(),
  pollIds: jsonb("poll_ids").$type<number[]>().default([]).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DailyVoteLog = typeof dailyVoteLogs.$inferSelect;
export type InsertDailyVoteLog = typeof dailyVoteLogs.$inferInsert;

// ============================================
// Season Leaderboard Cache
// ============================================

export const seasonLeaderboard = pgTable("season_leaderboard", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  seasonId: varchar("season_id", { length: 36 }).notNull(),
  walletAddress: varchar("wallet_address", { length: 66 }).notNull(),

  totalPoints: integer("total_points").default(0).notNull(),
  totalVotes: integer("total_votes").default(0).notNull(),
  questsCompleted: integer("quests_completed").default(0).notNull(),
  rank: integer("rank"),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SeasonLeaderboardEntry = typeof seasonLeaderboard.$inferSelect;
export type InsertSeasonLeaderboardEntry = typeof seasonLeaderboard.$inferInsert;

// ============================================
// User Season Snapshots (immutable end-of-season records)
// ============================================

export const userSeasonSnapshots = pgTable("user_season_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  seasonId: varchar("season_id", { length: 36 }).notNull(),
  walletAddress: varchar("wallet_address", { length: 66 }).notNull(),

  finalTier: integer("final_tier").notNull(),
  totalPoints: integer("total_points").notNull(),
  totalVotes: integer("total_votes").notNull(),
  pulseBalanceSnapshot: varchar("pulse_balance_snapshot", { length: 50 }).notNull(), // PULSE at season end
  maxStreak: integer("max_streak").notNull(),
  questsCompleted: integer("quests_completed").notNull(),

  // PULSE reward tracking
  pulseRewardAmount: varchar("pulse_reward_amount", { length: 50 }).default("0").notNull(),
  claimed: boolean("claimed").default(false).notNull(),
  claimedAt: timestamp("claimed_at"),
  claimTxHash: varchar("claim_tx_hash", { length: 66 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UserSeasonSnapshot = typeof userSeasonSnapshots.$inferSelect;
export type InsertUserSeasonSnapshot = typeof userSeasonSnapshots.$inferInsert;

// ============================================
// Gas Sponsorship Logs (for rate limiting)
// ============================================

export const sponsorshipLogs = pgTable("sponsorship_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address", { length: 66 }).notNull(),
  txHash: varchar("tx_hash", { length: 66 }),
  network: varchar("network", { length: 20 }).notNull(), // "testnet" | "mainnet"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SponsorshipLog = typeof sponsorshipLogs.$inferSelect;
export type InsertSponsorshipLog = typeof sponsorshipLogs.$inferInsert;

// ============================================
// User Settings (for gas sponsorship preference)
// ============================================

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address", { length: 66 }).notNull().unique(),
  gasSponsorshipEnabled: boolean("gas_sponsorship_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;
