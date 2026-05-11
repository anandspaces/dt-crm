import { relations } from "drizzle-orm";
import { accountNotes, accounts } from "./schema/accounts";
import { leadActivities, leadNotes } from "./schema/activities";
import { aiLeadSummaries } from "./schema/ai";
import { passwordResetTokens } from "./schema/auth";
import { automationRules } from "./schema/automation";
import { leadCalls } from "./schema/calls";
import { contactNotes, contacts } from "./schema/contacts";
import { dealNotes, dealStageHistory, deals } from "./schema/deals";
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

// ─── Accounts / Contacts / Deals relations ───────────────────────────────────

export const accountsRelations = relations(accounts, ({ one, many }) => ({
	owner: one(users, {
		fields: [accounts.ownerUserId],
		references: [users.id],
	}),
	notes: many(accountNotes),
	contacts: many(contacts),
	deals: many(deals),
}));

export const accountNotesRelations = relations(accountNotes, ({ one }) => ({
	account: one(accounts, {
		fields: [accountNotes.accountId],
		references: [accounts.id],
	}),
	user: one(users, {
		fields: [accountNotes.userId],
		references: [users.id],
	}),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
	owner: one(users, {
		fields: [contacts.ownerUserId],
		references: [users.id],
	}),
	account: one(accounts, {
		fields: [contacts.accountId],
		references: [accounts.id],
	}),
	notes: many(contactNotes),
	deals: many(deals),
}));

export const contactNotesRelations = relations(contactNotes, ({ one }) => ({
	contact: one(contacts, {
		fields: [contactNotes.contactId],
		references: [contacts.id],
	}),
	user: one(users, {
		fields: [contactNotes.userId],
		references: [users.id],
	}),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
	owner: one(users, {
		fields: [deals.ownerUserId],
		references: [users.id],
	}),
	account: one(accounts, {
		fields: [deals.accountId],
		references: [accounts.id],
	}),
	contact: one(contacts, {
		fields: [deals.contactId],
		references: [contacts.id],
	}),
	notes: many(dealNotes),
	stageHistory: many(dealStageHistory),
}));

export const dealNotesRelations = relations(dealNotes, ({ one }) => ({
	deal: one(deals, { fields: [dealNotes.dealId], references: [deals.id] }),
	user: one(users, { fields: [dealNotes.userId], references: [users.id] }),
}));

export const dealStageHistoryRelations = relations(
	dealStageHistory,
	({ one }) => ({
		deal: one(deals, {
			fields: [dealStageHistory.dealId],
			references: [deals.id],
		}),
		changedBy: one(users, {
			fields: [dealStageHistory.changedByUserId],
			references: [users.id],
		}),
	}),
);
