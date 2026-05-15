import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { aiAgents } from "./ai-agents";
import { users } from "./users";

export const batchStatusEnum = pgEnum("batch_status", [
	"queued",
	"running",
	"completed",
	"failed",
	"cancelled",
]);

export const callBatches = pgTable(
	"call_batches",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id").references(() => aiAgents.id, {
			onDelete: "set null",
		}),
		agentName: varchar("agent_name", { length: 255 })
			.notNull()
			.default("Bulk AI Caller"),
		fromNumber: varchar("from_number", { length: 50 }),
		status: batchStatusEnum("status").notNull().default("queued"),
		totalCount: integer("total_count").notNull().default(0),
		completedCount: integer("completed_count").notNull().default(0),
		failedCount: integer("failed_count").notNull().default(0),
		metadataJson: jsonb("metadata_json"),
		startedAt: timestamp("started_at", { withTimezone: true }),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("call_batches_user_id_idx").on(t.userId),
		index("call_batches_status_idx").on(t.status),
	],
);

export type CallBatch = typeof callBatches.$inferSelect;
export type NewCallBatch = typeof callBatches.$inferInsert;
