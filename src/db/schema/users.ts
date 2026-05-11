import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { goalEnum, industryEnum, teamSizeEnum, userRoleEnum } from "./enums";

export const users = pgTable(
	"users",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: varchar("name", { length: 255 }).notNull(),
		email: varchar("email", { length: 255 }).notNull().unique(),
		passwordHash: varchar("password_hash", { length: 255 }).notNull(),
		role: userRoleEnum("role").notNull().default("SALES"),
		isActive: boolean("is_active").notNull().default(true),
		isEmailVerified: boolean("is_email_verified").notNull().default(false),
		isOnboarded: boolean("is_onboarded").notNull().default(false),
		industry: industryEnum("industry"),
		teamSize: teamSizeEnum("team_size"),
		goals: goalEnum("goals").array().notNull().default(sql`'{}'::goal[]`),
		onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
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
