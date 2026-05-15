import {
	doublePrecision,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { callBatches } from "./call-batches";
import { leads } from "./leads";
import { users } from "./users";

export const queueItemStatusEnum = pgEnum("queue_item_status", [
	"queued",
	"dialing",
	"in-progress",
	"completed",
	"failed",
	"cancelled",
]);

export const callQueueItems = pgTable(
	"call_queue_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		batchId: uuid("batch_id")
			.notNull()
			.references(() => callBatches.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// Soft FK to leads — items may exist for ad-hoc numbers without a lead row.
		leadId: uuid("lead_id").references(() => leads.id, {
			onDelete: "set null",
		}),
		position: integer("position").notNull(),
		leadName: varchar("lead_name", { length: 255 }),
		company: varchar("company", { length: 255 }),
		phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
		email: varchar("email", { length: 255 }),
		status: queueItemStatusEnum("status").notNull().default("queued"),
		requestUuid: varchar("request_uuid", { length: 255 }),
		vobizCallUuid: varchar("vobiz_call_uuid", { length: 255 }),
		// Soft pointer to lead_calls.id (no FK — lead_calls is written first by
		// the batch start service, and an item may also be retried).
		callDocumentId: uuid("call_document_id"),
		recordingId: varchar("recording_id", { length: 255 }),
		recordingUrl: varchar("recording_url", { length: 1024 }),
		artifactDir: text("artifact_dir"),
		error: text("error"),
		durationSeconds: integer("duration_seconds"),
		sentimentLabel: varchar("sentiment_label", { length: 50 }),
		sentimentScore: doublePrecision("sentiment_score"),
		summary: text("summary"),
		transcriptText: text("transcript_text"),
		transcriptJson: jsonb("transcript_json"),
		startedAt: timestamp("started_at", { withTimezone: true }),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("cqi_batch_position_idx").on(t.batchId, t.position),
		index("cqi_batch_status_idx").on(t.batchId, t.status),
		index("cqi_vobiz_uuid_idx").on(t.vobizCallUuid),
	],
);

export type CallQueueItem = typeof callQueueItems.$inferSelect;
export type NewCallQueueItem = typeof callQueueItems.$inferInsert;
