import {
	boolean,
	jsonb,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

export const automationRules = pgTable("automation_rules", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	triggerType: varchar("trigger_type", { length: 100 }).notNull(),
	conditionsJson: jsonb("conditions_json").notNull(),
	actionsJson: jsonb("actions_json").notNull(),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type AutomationRule = typeof automationRules.$inferSelect;
