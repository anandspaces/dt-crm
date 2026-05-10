import { relations } from "drizzle-orm";
import { leadActivities, leadNotes } from "./schema/activities";
import { aiLeadSummaries } from "./schema/ai";
import { passwordResetTokens } from "./schema/auth";
import { automationRules } from "./schema/automation";
import { leadCalls } from "./schema/calls";
import { leadDocuments } from "./schema/documents";
import { followups } from "./schema/followups";
import { leadImports } from "./schema/imports";
import { integrations } from "./schema/integrations";
import { leads } from "./schema/leads";
import { leadMessages } from "./schema/messages";
import { leadPayments } from "./schema/payments";
import { pipelineStages, pipelines } from "./schema/pipelines";
import { leadReminders } from "./schema/reminders";
import { leadTags, tags } from "./schema/tags";
import { users } from "./schema/users";

export const usersRelations = relations(users, ({ many }) => ({
	leads: many(leads),
	activities: many(leadActivities),
	notes: many(leadNotes),
	followups: many(followups),
	passwordResetTokens: many(passwordResetTokens),
}));

export const passwordResetTokensRelations = relations(
	passwordResetTokens,
	({ one }) => ({
		user: one(users, {
			fields: [passwordResetTokens.userId],
			references: [users.id],
		}),
	}),
);

export const pipelinesRelations = relations(pipelines, ({ many }) => ({
	stages: many(pipelineStages),
	leads: many(leads),
}));

export const pipelineStagesRelations = relations(
	pipelineStages,
	({ one, many }) => ({
		pipeline: one(pipelines, {
			fields: [pipelineStages.pipelineId],
			references: [pipelines.id],
		}),
		leads: many(leads),
	}),
);

export const leadsRelations = relations(leads, ({ one, many }) => ({
	assignedUser: one(users, {
		fields: [leads.assignedUserId],
		references: [users.id],
	}),
	pipeline: one(pipelines, {
		fields: [leads.pipelineId],
		references: [pipelines.id],
	}),
	stage: one(pipelineStages, {
		fields: [leads.stageId],
		references: [pipelineStages.id],
	}),
	activities: many(leadActivities),
	notes: many(leadNotes),
	followups: many(followups),
	imports: many(leadImports),
	tags: many(leadTags),
	aiSummaries: many(aiLeadSummaries),
	messages: many(leadMessages),
	calls: many(leadCalls),
	documents: many(leadDocuments),
	payments: many(leadPayments),
	reminders: many(leadReminders),
}));

export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
	lead: one(leads, {
		fields: [leadActivities.leadId],
		references: [leads.id],
	}),
	user: one(users, {
		fields: [leadActivities.userId],
		references: [users.id],
	}),
}));

export const leadNotesRelations = relations(leadNotes, ({ one }) => ({
	lead: one(leads, { fields: [leadNotes.leadId], references: [leads.id] }),
	user: one(users, { fields: [leadNotes.userId], references: [users.id] }),
}));

export const followupsRelations = relations(followups, ({ one }) => ({
	lead: one(leads, { fields: [followups.leadId], references: [leads.id] }),
	assignedUser: one(users, {
		fields: [followups.assignedUserId],
		references: [users.id],
	}),
}));

export const integrationsRelations = relations(integrations, ({ many }) => ({
	imports: many(leadImports),
}));

export const leadImportsRelations = relations(leadImports, ({ one }) => ({
	lead: one(leads, { fields: [leadImports.leadId], references: [leads.id] }),
	integration: one(integrations, {
		fields: [leadImports.integrationId],
		references: [integrations.id],
	}),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
	leads: many(leadTags),
}));

export const leadTagsRelations = relations(leadTags, ({ one }) => ({
	lead: one(leads, { fields: [leadTags.leadId], references: [leads.id] }),
	tag: one(tags, { fields: [leadTags.tagId], references: [tags.id] }),
}));

export const aiLeadSummariesRelations = relations(
	aiLeadSummaries,
	({ one }) => ({
		lead: one(leads, {
			fields: [aiLeadSummaries.leadId],
			references: [leads.id],
		}),
	}),
);

export const leadMessagesRelations = relations(leadMessages, ({ one }) => ({
	lead: one(leads, { fields: [leadMessages.leadId], references: [leads.id] }),
	user: one(users, { fields: [leadMessages.userId], references: [users.id] }),
}));

export const leadCallsRelations = relations(leadCalls, ({ one }) => ({
	lead: one(leads, { fields: [leadCalls.leadId], references: [leads.id] }),
	user: one(users, { fields: [leadCalls.userId], references: [users.id] }),
}));

export const leadDocumentsRelations = relations(leadDocuments, ({ one }) => ({
	lead: one(leads, { fields: [leadDocuments.leadId], references: [leads.id] }),
	uploader: one(users, {
		fields: [leadDocuments.uploadedBy],
		references: [users.id],
	}),
}));

export const leadPaymentsRelations = relations(leadPayments, ({ one }) => ({
	lead: one(leads, { fields: [leadPayments.leadId], references: [leads.id] }),
}));

export const leadRemindersRelations = relations(leadReminders, ({ one }) => ({
	lead: one(leads, { fields: [leadReminders.leadId], references: [leads.id] }),
	user: one(users, {
		fields: [leadReminders.userId],
		references: [users.id],
	}),
}));

export const automationRulesRelations = relations(automationRules, () => ({}));
