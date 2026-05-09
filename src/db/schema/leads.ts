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
import { leadPriorityEnum, leadStatusEnum } from "./enums";
import { pipelineStages, pipelines } from "./pipelines";
import { users } from "./users";

export const leads = pgTable(
	"leads",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		firstName: varchar("first_name", { length: 255 }).notNull(),
		lastName: varchar("last_name", { length: 255 }),
		email: varchar("email", { length: 255 }),
		phone: varchar("phone", { length: 50 }),
		company: varchar("company", { length: 255 }),
		jobTitle: varchar("job_title", { length: 255 }),
		website: varchar("website", { length: 500 }),
		source: varchar("source", { length: 100 }),
		sourceProvider: varchar("source_provider", { length: 100 }),
		status: leadStatusEnum("status").notNull().default("NEW"),
		priority: leadPriorityEnum("priority").notNull().default("MEDIUM"),
		score: integer("score"),
		assignedUserId: uuid("assigned_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		pipelineId: uuid("pipeline_id").references(() => pipelines.id, {
			onDelete: "set null",
		}),
		stageId: uuid("stage_id").references(() => pipelineStages.id, {
			onDelete: "set null",
		}),
		notes: text("notes"),
		metadataJson: jsonb("metadata_json"),
		lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
		nextFollowupAt: timestamp("next_followup_at", { withTimezone: true }),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("leads_email_idx").on(t.email),
		index("leads_phone_idx").on(t.phone),
		index("leads_status_idx").on(t.status),
		index("leads_priority_idx").on(t.priority),
		index("leads_assigned_user_id_idx").on(t.assignedUserId),
		index("leads_pipeline_id_idx").on(t.pipelineId),
		index("leads_stage_id_idx").on(t.stageId),
		index("leads_deleted_at_idx").on(t.deletedAt),
		index("leads_created_at_idx").on(t.createdAt),
	],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
