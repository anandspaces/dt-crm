import {
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { followupStatusEnum } from "./enums";
import { leads } from "./leads";
import { users } from "./users";

export const followups = pgTable(
	"followups",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		assignedUserId: uuid("assigned_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: varchar("type", { length: 50 }).notNull(),
		status: followupStatusEnum("status").notNull().default("PENDING"),
		scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		notes: text("notes"),
		reminderSent: boolean("reminder_sent").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("followups_lead_id_idx").on(t.leadId),
		index("followups_assigned_user_id_idx").on(t.assignedUserId),
		index("followups_status_idx").on(t.status),
		index("followups_scheduled_at_idx").on(t.scheduledAt),
	],
);

export type Followup = typeof followups.$inferSelect;
export type NewFollowup = typeof followups.$inferInsert;
