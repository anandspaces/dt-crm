import {
	bigint,
	index,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { leads } from "./leads";
import { users } from "./users";

export const leadDocuments = pgTable(
	"lead_documents",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		uploadedBy: uuid("uploaded_by").references(() => users.id, {
			onDelete: "set null",
		}),
		name: varchar("name", { length: 500 }).notNull(),
		mimeType: varchar("mime_type", { length: 100 }).notNull(),
		sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
		url: varchar("url", { length: 2048 }).notNull(),
		uploadedAt: timestamp("uploaded_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("lead_documents_lead_id_idx").on(t.leadId)],
);

export type LeadDocument = typeof leadDocuments.$inferSelect;
export type NewLeadDocument = typeof leadDocuments.$inferInsert;
