import {
	bigint,
	boolean,
	index,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { paymentMethodEnum } from "./enums";
import { leads } from "./leads";

export const leadPayments = pgTable(
	"lead_payments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leadId: uuid("lead_id")
			.notNull()
			.references(() => leads.id, { onDelete: "cascade" }),
		type: varchar("type", { length: 100 }).notNull(),
		amount: bigint("amount", { mode: "number" }).notNull(),
		currency: varchar("currency", { length: 8 }).notNull().default("INR"),
		method: paymentMethodEnum("method").notNull(),
		paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
		autoReminderEnabled: boolean("auto_reminder_enabled")
			.notNull()
			.default(false),
		nextReminderAt: timestamp("next_reminder_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("lead_payments_lead_id_idx").on(t.leadId)],
);

export type LeadPayment = typeof leadPayments.$inferSelect;
export type NewLeadPayment = typeof leadPayments.$inferInsert;
