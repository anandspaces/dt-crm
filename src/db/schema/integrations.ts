import {
	boolean,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { integrationProviderEnum } from "./enums";

export const integrations = pgTable("integrations", {
	id: uuid("id").primaryKey().defaultRandom(),
	provider: integrationProviderEnum("provider").notNull(),
	accountName: varchar("account_name", { length: 255 }).notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	expiresAt: timestamp("expires_at", { withTimezone: true }),
	metadataJson: jsonb("metadata_json"),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
