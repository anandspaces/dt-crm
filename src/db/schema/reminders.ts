import {
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { leads } from "./leads";
import { users } from "./users";

export const leadReminders = pgTable(
	"lead_reminders",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		userId: uuid("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		dismissed: boolean("dismissed").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("lead_reminders_lead_id_idx").on(t.leadId),
		index("lead_reminders_due_at_idx").on(t.dueAt),
	],
);

export type LeadReminder = typeof leadReminders.$inferSelect;
export type NewLeadReminder = typeof leadReminders.$inferInsert;
