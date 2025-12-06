CREATE TABLE "daily_vote_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar(66) NOT NULL,
	"vote_date" date NOT NULL,
	"vote_count" integer DEFAULT 0 NOT NULL,
	"poll_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar(66) NOT NULL,
	"quest_id" varchar(36) NOT NULL,
	"season_id" varchar(36) NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"period_start" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" varchar(36) NOT NULL,
	"quest_type" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"points" integer NOT NULL,
	"target_value" integer NOT NULL,
	"target_action" varchar(50) NOT NULL,
	"creator_address" varchar(66) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"max_completions" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_leaderboard" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" varchar(36) NOT NULL,
	"wallet_address" varchar(66) NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"total_votes" integer DEFAULT 0 NOT NULL,
	"quests_completed" integer DEFAULT 0 NOT NULL,
	"rank" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_number" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"total_pulse_pool" varchar(50) DEFAULT '0' NOT NULL,
	"status" integer DEFAULT 0 NOT NULL,
	"creator_address" varchar(66) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_season_number_unique" UNIQUE("season_number")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar(66) NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_vote_date" date,
	"votes_today" integer DEFAULT 0 NOT NULL,
	"last_vote_reset_date" date,
	"current_season_id" integer,
	"season_points" integer DEFAULT 0 NOT NULL,
	"season_votes" integer DEFAULT 0 NOT NULL,
	"cached_tier" integer DEFAULT 0 NOT NULL,
	"cached_pulse_balance" varchar(50) DEFAULT '0' NOT NULL,
	"tier_last_updated" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "user_season_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" varchar(36) NOT NULL,
	"wallet_address" varchar(66) NOT NULL,
	"final_tier" integer NOT NULL,
	"total_points" integer NOT NULL,
	"total_votes" integer NOT NULL,
	"pulse_balance_snapshot" varchar(50) NOT NULL,
	"max_streak" integer NOT NULL,
	"quests_completed" integer NOT NULL,
	"pulse_reward_amount" varchar(50) DEFAULT '0' NOT NULL,
	"claimed" boolean DEFAULT false NOT NULL,
	"claimed_at" timestamp,
	"claim_tx_hash" varchar(66),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
