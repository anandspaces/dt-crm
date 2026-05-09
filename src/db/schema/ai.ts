import {
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { leads } from "./leads";

export const aiLeadSummaries = pgTable("ai_lead_summaries", {
	id: uuid("id").primaryKey().defaultRandom(),
	leadId: uuid("lead_id")
		.notNull()
		.references(() => leads.id, { onDelete: "cascade" }),
	summary: text("summary").notNull(),
	sentiment: varchar("sentiment", { length: 50 }),
	priorityScore: integer("priority_score"),
	generatedBy: varchar("generated_by", { length: 100 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type AiLeadSummary = typeof aiLeadSummaries.$inferSelect;
