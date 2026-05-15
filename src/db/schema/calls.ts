import {
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { callBatches } from "./call-batches";
import { callerTypeEnum, callOutcomeEnum } from "./enums";
import { leads } from "./leads";
import { users } from "./users";

export const leadCalls = pgTable(
	"lead_calls",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		userId: uuid("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		callerType: callerTypeEnum("caller_type").notNull().default("agent"),
		callerName: varchar("caller_name", { length: 255 }),
		outcome: callOutcomeEnum("outcome").notNull(),
		durationSeconds: integer("duration_seconds").notNull().default(0),
		recordingUrl: varchar("recording_url", { length: 1024 }),
		aiSummaryJson: jsonb("ai_summary_json"),
		// AI-calling fields (populated by the call-batches / vobiz / voice-stream
		// pipeline; nullable so manual-log call rows remain valid).
		batchId: uuid("batch_id").references(() => callBatches.id, {
			onDelete: "set null",
		}),
		queueItemId: uuid("queue_item_id"),
		vobizCallUuid: varchar("vobiz_call_uuid", { length: 255 }),
		transcriptJson: jsonb("transcript_json"),
		sentimentLabel: varchar("sentiment_label", { length: 50 }),
		sentimentScore: doublePrecision("sentiment_score"),
		calledAt: timestamp("called_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("lead_calls_lead_id_idx").on(t.leadId),
		index("lead_calls_called_at_idx").on(t.calledAt),
		index("lead_calls_batch_id_idx").on(t.batchId),
		index("lead_calls_vobiz_uuid_idx").on(t.vobizCallUuid),
	],
);

export type LeadCall = typeof leadCalls.$inferSelect;
export type NewLeadCall = typeof leadCalls.$inferInsert;
