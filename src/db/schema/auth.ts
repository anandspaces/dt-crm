import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const passwordResetTokens = pgTable(
	"password_reset_tokens",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		usedAt: timestamp("used_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("password_reset_tokens_user_id_idx").on(t.userId),
		index("password_reset_tokens_token_hash_idx").on(t.tokenHash),
	],
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
