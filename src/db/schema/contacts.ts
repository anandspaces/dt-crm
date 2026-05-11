import { sql } from "drizzle-orm";
import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { users } from "./users";

export const contacts = pgTable(
	"contacts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: varchar("name", { length: 511 }).notNull(),
		title: varchar("title", { length: 255 }),
		// Free-text account name shown in lists; optional FK to accounts table for joins.
		account: varchar("account", { length: 255 }),
		accountId: uuid("account_id").references(() => accounts.id, {
			onDelete: "set null",
		}),
		email: varchar("email", { length: 255 }),
		phone: varchar("phone", { length: 50 }),
		tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
		ownerUserId: uuid("owner_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		// "last" mirrors the Flutter ContactModel.last (last touchpoint label/timestamp).
		last: varchar("last", { length: 255 }),
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
		index("contacts_name_idx").on(t.name),
		index("contacts_email_idx").on(t.email),
		index("contacts_phone_idx").on(t.phone),
		index("contacts_account_id_idx").on(t.accountId),
		index("contacts_owner_user_id_idx").on(t.ownerUserId),
		index("contacts_deleted_at_idx").on(t.deletedAt),
		index("contacts_created_at_idx").on(t.createdAt),
	],
);

export const contactNotes = pgTable(
	"contact_notes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		contactId: uuid("contact_id")
			.notNull()
			.references(() => contacts.id, { onDelete: "cascade" }),
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
		index("contact_notes_contact_id_idx").on(t.contactId),
		index("contact_notes_user_id_idx").on(t.userId),
	],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactNote = typeof contactNotes.$inferSelect;
export type NewContactNote = typeof contactNotes.$inferInsert;
