import {
	index,
	jsonb,
	pgTable,
	timestamp,
	unique,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { integrationProviderEnum } from "./enums";
import { integrations } from "./integrations";
import { leads } from "./leads";

export const leadImports = pgTable(
	"lead_imports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		provider: integrationProviderEnum("provider").notNull(),
		externalLeadId: varchar("external_lead_id", { length: 255 }).notNull(),
		integrationId: uuid("integration_id").references(() => integrations.id, {
			onDelete: "set null",
		}),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		rawPayloadJson: jsonb("raw_payload_json").notNull(),
		syncedAt: timestamp("synced_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		processedAt: timestamp("processed_at", { withTimezone: true }),
	},
	(t) => [
		unique("lead_imports_provider_external_lead_id_unq").on(
			t.provider,
			t.externalLeadId,
		),
		index("lead_imports_lead_id_idx").on(t.leadId),
		index("lead_imports_provider_idx").on(t.provider),
	],
);

export type LeadImport = typeof leadImports.$inferSelect;
export type NewLeadImport = typeof leadImports.$inferInsert;
