import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
	"ADMIN",
	"MANAGER",
	"SALES",
	"SUPPORT",
]);

// Spec lead-status values (lowercase, real-estate lifecycle)
export const leadStatusEnum = pgEnum("lead_status", [
	"fresh",
	"contacted",
	"interested",
	"appointment",
	"demo",
	"negotiation",
	"won",
	"lost",
	"not_interested",
]);

export const leadPriorityEnum = pgEnum("lead_priority", [
	"LOW",
	"MEDIUM",
	"HIGH",
	"URGENT",
]);

export const activityTypeEnum = pgEnum("activity_type", [
	"CALL",
	"EMAIL",
	"NOTE",
	"MEETING",
	"WHATSAPP",
	"STATUS_CHANGE",
	"ASSIGNMENT",
	"FOLLOWUP",
	"SYSTEM",
]);

// Timeline display kind (UI color/icon hint)
export const timelineKindEnum = pgEnum("timeline_kind", [
	"ai",
	"success",
	"note",
	"info",
	"danger",
]);

export const followupStatusEnum = pgEnum("followup_status", [
	"PENDING",
	"DONE",
	"MISSED",
	"CANCELLED",
]);

export const integrationProviderEnum = pgEnum("integration_provider", [
	"GOOGLE_ADS",
	"META_ADS",
	"WEBSITE",
	"CSV_IMPORT",
	"API",
	"MANUAL",
]);

export const industryEnum = pgEnum("industry", [
	"REAL_ESTATE",
	"SAAS",
	"EDUCATION",
	"FINANCIAL",
	"HEALTHCARE",
	"OTHER",
]);

export const teamSizeEnum = pgEnum("team_size", [
	"SIZE_1_10",
	"SIZE_11_50",
	"SIZE_51_200",
	"SIZE_200_PLUS",
]);

export const goalEnum = pgEnum("goal", [
	"SPEED_UP_QUALIFICATION",
	"CENTRALIZE_CALLS",
	"FORECAST_BETTER",
	"USE_AI_FOLLOWUPS",
	"RUN_CADENCES",
	"INSIGHTFUL_REPORTS",
]);

// Spec lead source values
export const leadSourceEnum = pgEnum("lead_source", [
	"99ACRES",
	"MAGICBRICKS",
	"HOUSING",
	"JUSTDIAL",
	"META_ADS",
	"GOOGLE_ADS",
	"REFERRAL",
	"WALK_IN",
	"LINKEDIN",
	"WEBSITE",
	"OTHER",
]);

export const messageDirectionEnum = pgEnum("message_direction", [
	"them",
	"you",
	"ai",
]);

export const callerTypeEnum = pgEnum("caller_type", ["agent", "ai"]);

export const callOutcomeEnum = pgEnum("call_outcome", [
	"connected",
	"missed",
	"voicemail",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
	"UPI",
	"CARD",
	"BANK_TRANSFER",
	"CASH",
	"CHEQUE",
	"OTHER",
]);

// ─── Accounts / Contacts / Deals enums ──────────────────────────────────────

export const accountTierEnum = pgEnum("account_tier", [
	"Strategic",
	"Enterprise",
	"Mid-Market",
	"SMB",
]);

export const accountTypeEnum = pgEnum("account_type", [
	"Customer",
	"Prospect",
	"Partner",
	"Vendor",
	"Other",
]);

// Lowercased machine keys for stages; UI label mapping happens in Flutter.
export const dealStageEnum = pgEnum("deal_stage", [
	"prospecting",
	"qualification",
	"proposal",
	"negotiation",
	"closed_won",
	"closed_lost",
]);
