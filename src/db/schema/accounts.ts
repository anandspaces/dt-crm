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
import { accountTierEnum, accountTypeEnum } from "./enums";
import { users } from "./users";

export const accounts = pgTable(
	"accounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: varchar("name", { length: 255 }).notNull(),
		industry: varchar("industry", { length: 100 }),
		tier: accountTierEnum("tier"),
		type: accountTypeEnum("type"),
		city: varchar("city", { length: 255 }),
		revenue: varchar("revenue", { length: 100 }),
		employees: integer("employees"),
		ownerUserId: uuid("owner_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
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
		index("accounts_name_idx").on(t.name),
		index("accounts_tier_idx").on(t.tier),
		index("accounts_type_idx").on(t.type),
		index("accounts_owner_user_id_idx").on(t.ownerUserId),
		index("accounts_deleted_at_idx").on(t.deletedAt),
		index("accounts_created_at_idx").on(t.createdAt),
	],
);

export const accountNotes = pgTable(
	"account_notes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => accounts.id, { onDelete: "cascade" }),
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
		index("account_notes_account_id_idx").on(t.accountId),
		index("account_notes_user_id_idx").on(t.userId),
	],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type AccountNote = typeof accountNotes.$inferSelect;
export type NewAccountNote = typeof accountNotes.$inferInsert;
