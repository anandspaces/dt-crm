import {
	boolean,
	index,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { userRoleEnum } from "./enums";

export const users = pgTable(
	"users",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: varchar("name", { length: 255 }).notNull(),
		email: varchar("email", { length: 255 }).notNull().unique(),
		passwordHash: varchar("password_hash", { length: 255 }).notNull(),
		role: userRoleEnum("role").notNull().default("SALES"),
		isActive: boolean("is_active").notNull().default(true),
		lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("users_email_idx").on(t.email),
		index("users_role_idx").on(t.role),
		index("users_is_active_idx").on(t.isActive),
	],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
