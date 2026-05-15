import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { aiAgents } from "./ai-agents";
import { users } from "./users";

export const ragKnowledge = pgTable(
	"rag_knowledge",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => aiAgents.id, { onDelete: "cascade" }),
		fileName: varchar("file_name", { length: 255 }),
		content: text("content").notNull(),
		imageUrl: varchar("image_url", { length: 1024 }),
		pageNumber: integer("page_number"),
		// float[] stored as JSON array; small KB → cosine similarity in memory.
		embedding: jsonb("embedding"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("rag_knowledge_agent_id_idx").on(t.agentId)],
);

export type RagKnowledge = typeof ragKnowledge.$inferSelect;
export type NewRagKnowledge = typeof ragKnowledge.$inferInsert;
