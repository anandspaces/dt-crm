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
