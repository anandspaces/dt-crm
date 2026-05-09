import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

export const webhookEvents = pgTable(
	"webhook_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		provider: varchar("provider", { length: 50 }).notNull(),
		eventType: varchar("event_type", { length: 100 }),
		payloadJson: jsonb("payload_json").notNull(),
		processed: boolean("processed").notNull().default(false),
		errorMessage: text("error_message"),
		receivedAt: timestamp("received_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		processedAt: timestamp("processed_at", { withTimezone: true }),
	},
	(t) => [
		index("webhook_events_provider_idx").on(t.provider),
		index("webhook_events_processed_idx").on(t.processed),
	],
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
