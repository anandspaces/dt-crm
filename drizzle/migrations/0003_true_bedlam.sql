CREATE TYPE "public"."goal" AS ENUM('SPEED_UP_QUALIFICATION', 'CENTRALIZE_CALLS', 'FORECAST_BETTER', 'USE_AI_FOLLOWUPS', 'RUN_CADENCES', 'INSIGHTFUL_REPORTS');--> statement-breakpoint
CREATE TYPE "public"."industry" AS ENUM('REAL_ESTATE', 'SAAS', 'EDUCATION', 'FINANCIAL', 'HEALTHCARE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."team_size" AS ENUM('SIZE_1_10', 'SIZE_11_50', 'SIZE_51_200', 'SIZE_200_PLUS');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_onboarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "industry" "industry";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "team_size" "team_size";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "goals" "goal"[] DEFAULT '{}'::goal[] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;