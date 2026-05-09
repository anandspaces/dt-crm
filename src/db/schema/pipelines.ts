import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

export const pipelines = pgTable("pipelines", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	description: text("description"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const pipelineStages = pgTable(
	"pipeline_stages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		pipelineId: uuid("pipeline_id")
			.notNull()
			.references(() => pipelines.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		position: integer("position").notNull(),
		color: varchar("color", { length: 7 }).notNull().default("#6366f1"),
		isClosed: boolean("is_closed").notNull().default(false),
		isWon: boolean("is_won").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("pipeline_stages_pipeline_id_idx").on(t.pipelineId)],
);

export type Pipeline = typeof pipelines.$inferSelect;
export type NewPipeline = typeof pipelines.$inferInsert;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type NewPipelineStage = typeof pipelineStages.$inferInsert;
