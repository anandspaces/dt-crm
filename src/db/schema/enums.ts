import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
	"ADMIN",
	"MANAGER",
	"SALES",
	"SUPPORT",
]);

export const leadStatusEnum = pgEnum("lead_status", [
	"NEW",
	"CONTACTED",
	"QUALIFIED",
	"PROPOSAL_SENT",
	"NEGOTIATION",
	"WON",
	"LOST",
	"ARCHIVED",
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
