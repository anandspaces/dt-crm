import {
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { messageDirectionEnum } from "./enums";
import { leads } from "./leads";
import { users } from "./users";

export const leadMessages = pgTable(
	"lead_messages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		userId: uuid("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		direction: messageDirectionEnum("direction").notNull(),
		text: text("text").notNull(),
		isAi: boolean("is_ai").notNull().default(false),
		sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("lead_messages_lead_id_idx").on(t.leadId),
		index("lead_messages_sent_at_idx").on(t.sentAt),
	],
);

export type LeadMessage = typeof leadMessages.$inferSelect;
export type NewLeadMessage = typeof leadMessages.$inferInsert;
