import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { activityTypeEnum } from "./enums";
import { leads } from "./leads";
import { users } from "./users";

export const leadActivities = pgTable(
	"lead_activities",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		userId: uuid("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		type: activityTypeEnum("type").notNull(),
		title: varchar("title", { length: 500 }).notNull(),
		description: text("description"),
		metadataJson: jsonb("metadata_json"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("lead_activities_lead_id_idx").on(t.leadId),
		index("lead_activities_user_id_idx").on(t.userId),
		index("lead_activities_type_idx").on(t.type),
		index("lead_activities_created_at_idx").on(t.createdAt),
	],
);

export const leadNotes = pgTable(
	"lead_notes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		content: text("content").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("lead_notes_lead_id_idx").on(t.leadId),
		index("lead_notes_user_id_idx").on(t.userId),
	],
);

export type LeadActivity = typeof leadActivities.$inferSelect;
export type NewLeadActivity = typeof leadActivities.$inferInsert;
export type LeadNote = typeof leadNotes.$inferSelect;
export type NewLeadNote = typeof leadNotes.$inferInsert;
