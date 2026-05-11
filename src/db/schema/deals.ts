import {
	boolean,
	index,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { contacts } from "./contacts";
import { dealStageEnum } from "./enums";
import { users } from "./users";

export const deals = pgTable(
	"deals",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: varchar("name", { length: 511 }).notNull(),
		// Denormalized account name for list rendering; accountId is the FK for joins.
		account: varchar("account", { length: 255 }),
		accountId: uuid("account_id").references(() => accounts.id, {
			onDelete: "set null",
		}),
		contactId: uuid("contact_id").references(() => contacts.id, {
			onDelete: "set null",
		}),
		amount: numeric("amount", { precision: 14, scale: 2 })
			.notNull()
			.default("0"),
		stage: dealStageEnum("stage").notNull().default("prospecting"),
		closeDate: timestamp("close_date", { withTimezone: true }),
		ownerUserId: uuid("owner_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		source: varchar("source", { length: 100 }),
		lastActivity: varchar("last_activity", { length: 255 }),
		hot: boolean("hot").notNull().default(false),
		ai: boolean("ai").notNull().default(false),
		nextStep: text("next_step"),
		notes: text("notes"),
		metadataJson: jsonb("metadata_json"),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("deals_name_idx").on(t.name),
		index("deals_account_id_idx").on(t.accountId),
		index("deals_contact_id_idx").on(t.contactId),
		index("deals_stage_idx").on(t.stage),
		index("deals_owner_user_id_idx").on(t.ownerUserId),
		index("deals_hot_idx").on(t.hot),
		index("deals_close_date_idx").on(t.closeDate),
		index("deals_deleted_at_idx").on(t.deletedAt),
		index("deals_created_at_idx").on(t.createdAt),
	],
);

export const dealNotes = pgTable(
	"deal_notes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		dealId: uuid("deal_id")
			.notNull()
			.references(() => deals.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		content: text("content").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("deal_notes_deal_id_idx").on(t.dealId),
		index("deal_notes_user_id_idx").on(t.userId),
	],
);

export const dealStageHistory = pgTable(
	"deal_stage_history",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		dealId: uuid("deal_id")
			.notNull()
			.references(() => deals.id, { onDelete: "cascade" }),
		fromStage: dealStageEnum("from_stage"),
		toStage: dealStageEnum("to_stage").notNull(),
		changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		changedAt: timestamp("changed_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("deal_stage_history_deal_id_idx").on(t.dealId),
		index("deal_stage_history_changed_at_idx").on(t.changedAt),
	],
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type DealNote = typeof dealNotes.$inferSelect;
export type NewDealNote = typeof dealNotes.$inferInsert;
export type DealStageHistory = typeof dealStageHistory.$inferSelect;
export type NewDealStageHistory = typeof dealStageHistory.$inferInsert;
