import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../../config/db";
import {
	leadActivities,
	leadMessages,
	leadReminders,
	leads,
	users,
} from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { findLeads, findStats } from "./leads.repository";
import type {
	BulkAiNurtureInput,
	BulkCampaignInput,
	BulkStatusInput,
	BulkTransferInput,
	BulkWhatsappInput,
	CreateLeadInput,
	ListLeadsQuery,
	UpdateLeadInput,
} from "./leads.schema";
import {
	type AssigneeMap,
	type ReminderState,
	shapeLead,
	splitName,
} from "./leads.shape";

async function loadAssignees(ids: Iterable<string>): Promise<AssigneeMap> {
	const list = [...new Set([...ids].filter(Boolean))];
	if (list.length === 0) return new Map();
	const rows = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(inArray(users.id, list));
	return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name }]));
}

async function loadReminderState(
	leadIds: string[],
): Promise<Map<string, ReminderState>> {
	if (leadIds.length === 0) return new Map();
	const rows = await db
		.select({
			leadId: leadReminders.leadId,
			overdue: sql<number>`count(*) FILTER (WHERE ${leadReminders.dueAt} < now())::int`,
			today: sql<number>`count(*) FILTER (
				WHERE ${leadReminders.dueAt} >= date_trunc('day', now())
				  AND ${leadReminders.dueAt} <  date_trunc('day', now()) + interval '1 day'
			)::int`,
		})
		.from(leadReminders)
		.where(
			and(
				inArray(leadReminders.leadId, leadIds),
				isNull(leadReminders.completedAt),
				eq(leadReminders.dismissed, false),
			),
		)
		.groupBy(leadReminders.leadId);

	const map = new Map<string, ReminderState>();
	for (const r of rows) {
		map.set(r.leadId, { hasOverdue: r.overdue > 0, hasToday: r.today > 0 });
	}
	return map;
}

export async function assertLeadAccess(id: string, actor: JWTPayload) {
	const [lead] = await db
		.select()
		.from(leads)
		.where(and(eq(leads.id, id), isNull(leads.deletedAt)))
		.limit(1);
	if (!lead) throw new NotFoundError("Lead not found");
	if (
		(actor.role === "SALES" || actor.role === "SUPPORT") &&
		lead.assignedUserId !== actor.sub
	) {
		throw new ForbiddenError("You can only access leads assigned to you");
	}
	return lead;
}

function applyName(
	input: CreateLeadInput | UpdateLeadInput,
): {
	firstName?: string;
	lastName?: string | null;
} {
	if (!input.name) {
		return {
			firstName: input.firstName,
			lastName: input.lastName ?? undefined,
		};
	}
	const { firstName, lastName } = splitName(input.name);
	return {
		firstName,
		lastName: input.lastName ?? lastName ?? null,
	};
}

export async function createLead(input: CreateLeadInput, actor: JWTPayload) {
	const assignedUserId =
		actor.role === "SALES" && !input.assignedUserId
			? actor.sub
			: input.assignedUserId;

	const { firstName, lastName } = applyName(input);
	if (!firstName) {
		throw new Error("name/firstName missing after parsing");
	}

	const [lead] = await db
		.insert(leads)
		.values({
			firstName,
			lastName: lastName ?? undefined,
			email: input.email,
			phone: input.phone,
			company: input.company,
			jobTitle: input.jobTitle,
			website: input.website,
			source: input.source,
			sourceProvider: input.sourceProvider,
			status: input.status ?? "fresh",
			priority: input.priority ?? "MEDIUM",
			score: input.score ?? 0,
			hot: input.hot ?? false,
			city: input.city,
			budget: input.budget,
			requirement: input.requirement,
			tags: input.tags ?? [],
			pipelineId: input.pipelineId,
			stageId: input.stageId,
			assignedUserId,
			notes: input.notes,
		})
		.returning();
	if (!lead) throw new Error("Failed to create lead");

	await db.insert(leadActivities).values({
		leadId: lead.id,
		userId: actor.sub,
		type: "SYSTEM",
		title: "Lead created",
		description: `Created manually by ${actor.email}`,
	});

	const assignees = await loadAssignees([lead.assignedUserId ?? ""]);
	return shapeLead(lead, { assignees });
}

export async function getLead(id: string, actor: JWTPayload) {
	const lead = await assertLeadAccess(id, actor);
	const [assignees, remindersMap] = await Promise.all([
		loadAssignees([lead.assignedUserId ?? ""]),
		loadReminderState([lead.id]),
	]);
	return shapeLead(lead, {
		assignees,
		reminders: remindersMap.get(lead.id),
	});
}

export async function updateLead(
	id: string,
	input: UpdateLeadInput,
	actor: JWTPayload,
) {
	const oldLead = await assertLeadAccess(id, actor);
	const { firstName, lastName } = applyName(input);

	const updates: Partial<typeof leads.$inferInsert> = {
		updatedAt: new Date(),
	};
	if (firstName !== undefined) updates.firstName = firstName;
	if (lastName !== undefined) updates.lastName = lastName ?? null;
	if (input.email !== undefined) updates.email = input.email;
	if (input.phone !== undefined) updates.phone = input.phone;
	if (input.company !== undefined) updates.company = input.company;
	if (input.jobTitle !== undefined) updates.jobTitle = input.jobTitle;
	if (input.website !== undefined) updates.website = input.website;
	if (input.source !== undefined) updates.source = input.source;
	if (input.sourceProvider !== undefined)
		updates.sourceProvider = input.sourceProvider;
	if (input.status !== undefined) updates.status = input.status;
	if (input.priority !== undefined) updates.priority = input.priority;
	if (input.score !== undefined) updates.score = input.score;
	if (input.hot !== undefined) updates.hot = input.hot;
	if (input.city !== undefined) updates.city = input.city;
	if (input.budget !== undefined) updates.budget = input.budget;
	if (input.requirement !== undefined) updates.requirement = input.requirement;
	if (input.tags !== undefined) updates.tags = input.tags;
	if (input.pipelineId !== undefined) updates.pipelineId = input.pipelineId;
	if (input.stageId !== undefined) updates.stageId = input.stageId;
	if (input.assignedUserId !== undefined)
		updates.assignedUserId = input.assignedUserId;
	if (input.notes !== undefined) updates.notes = input.notes;

	const [updated] = await db
		.update(leads)
		.set(updates)
		.where(and(eq(leads.id, id), isNull(leads.deletedAt)))
		.returning();
	if (!updated) throw new Error("Failed to update lead");

	if (input.status && input.status !== oldLead.status) {
		await db.insert(leadActivities).values({
			leadId: id,
			userId: actor.sub,
			type: "STATUS_CHANGE",
			title: `Status changed to ${input.status}`,
			description: `From ${oldLead.status} → ${input.status}`,
		});
	}
	if (
		input.assignedUserId !== undefined &&
		input.assignedUserId !== oldLead.assignedUserId
	) {
		await db.insert(leadActivities).values({
			leadId: id,
			userId: actor.sub,
			type: "ASSIGNMENT",
			title: "Lead reassigned",
			description: input.assignedUserId
				? `Assigned to user ${input.assignedUserId}`
				: "Unassigned",
		});
	}

	const assignees = await loadAssignees([updated.assignedUserId ?? ""]);
	return shapeLead(updated, { assignees });
}

export async function softDeleteLead(id: string, actor: JWTPayload) {
	if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
		throw new ForbiddenError("Only ADMIN and MANAGER can delete leads");
	}
	const [lead] = await db
		.select({ id: leads.id })
		.from(leads)
		.where(and(eq(leads.id, id), isNull(leads.deletedAt)))
		.limit(1);
	if (!lead) throw new NotFoundError("Lead not found");
	await db.update(leads).set({ deletedAt: new Date() }).where(eq(leads.id, id));
}

export async function restoreLead(id: string, actor: JWTPayload) {
	if (actor.role !== "ADMIN") {
		throw new ForbiddenError("Only ADMIN can restore leads");
	}
	const [lead] = await db
		.select({ id: leads.id })
		.from(leads)
		.where(and(eq(leads.id, id), isNotNull(leads.deletedAt)))
		.limit(1);
	if (!lead) throw new NotFoundError("Lead not found or not deleted");
	await db
		.update(leads)
		.set({ deletedAt: null, updatedAt: new Date() })
		.where(eq(leads.id, id));
}

export async function listLeads(query: ListLeadsQuery, actor: JWTPayload) {
	const { rows, total, summary } = await findLeads(query, actor);

	const assigneeIds = rows
		.map((r) => r.assignedUserId)
		.filter((v): v is string => Boolean(v));
	const [assignees, reminderMap] = await Promise.all([
		loadAssignees(assigneeIds),
		loadReminderState(rows.map((r) => r.id)),
	]);

	const items = rows.map((r) =>
		shapeLead(r, { assignees, reminders: reminderMap.get(r.id) }),
	);

	return {
		leads: items,
		total,
		page: query.page,
		limit: query.limit,
		summary,
	};
}

export async function leadStats(query: ListLeadsQuery, actor: JWTPayload) {
	return findStats(query, actor);
}

// ─── Bulk operations ─────────────────────────────────────────────────────────

function ensureBulkRole(actor: JWTPayload) {
	if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
		throw new ForbiddenError("Bulk operations require ADMIN or MANAGER");
	}
}

export async function bulkTransfer(
	input: BulkTransferInput,
	actor: JWTPayload,
) {
	ensureBulkRole(actor);

	await db
		.update(leads)
		.set({ assignedUserId: input.assignedTo, updatedAt: new Date() })
		.where(and(inArray(leads.id, input.ids), isNull(leads.deletedAt)));

	await db.insert(leadActivities).values(
		input.ids.map((leadId) => ({
			leadId,
			userId: actor.sub,
			type: "ASSIGNMENT" as const,
			title: "Lead bulk transferred",
			description: `Bulk assigned to user ${input.assignedTo}`,
		})),
	);

	return { affected: input.ids.length };
}

export async function bulkStatus(input: BulkStatusInput, actor: JWTPayload) {
	ensureBulkRole(actor);

	await db
		.update(leads)
		.set({ status: input.status, updatedAt: new Date() })
		.where(and(inArray(leads.id, input.ids), isNull(leads.deletedAt)));

	await db.insert(leadActivities).values(
		input.ids.map((leadId) => ({
			leadId,
			userId: actor.sub,
			type: "STATUS_CHANGE" as const,
			title: `Bulk status change to ${input.status}`,
		})),
	);

	return { affected: input.ids.length };
}

export async function bulkWhatsapp(
	input: BulkWhatsappInput,
	actor: JWTPayload,
) {
	const targets = await db
		.select({
			id: leads.id,
			firstName: leads.firstName,
			lastName: leads.lastName,
			requirement: leads.requirement,
			city: leads.city,
		})
		.from(leads)
		.where(and(inArray(leads.id, input.ids), isNull(leads.deletedAt)));

	const renderedMessages = targets.map((lead) => {
		const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
		const text = input.message
			.replaceAll("{name}", name)
			.replaceAll("{requirement}", lead.requirement ?? "")
			.replaceAll("{city}", lead.city ?? "");
		return { leadId: lead.id, text };
	});

	if (renderedMessages.length > 0) {
		await db.insert(leadMessages).values(
			renderedMessages.map((m) => ({
				leadId: m.leadId,
				userId: actor.sub,
				direction: "you" as const,
				text: m.text,
				isAi: false,
			})),
		);

		await db.insert(leadActivities).values(
			renderedMessages.map((m) => ({
				leadId: m.leadId,
				userId: actor.sub,
				type: "WHATSAPP" as const,
				title: "Bulk WhatsApp sent",
				description: m.text.slice(0, 280),
			})),
		);
	}

	return { sent: renderedMessages.length };
}

export async function bulkCampaign(
	input: BulkCampaignInput,
	actor: JWTPayload,
) {
	ensureBulkRole(actor);

	if (input.ids.length > 0) {
		await db.insert(leadActivities).values(
			input.ids.map((leadId) => ({
				leadId,
				userId: actor.sub,
				type: "SYSTEM" as const,
				title: `Added to campaign ${input.campaignId}`,
				metadataJson: { campaignId: input.campaignId },
			})),
		);
	}

	return { added: input.ids.length, campaignId: input.campaignId };
}

export async function bulkAiNurture(
	input: BulkAiNurtureInput,
	actor: JWTPayload,
) {
	if (input.ids.length > 0) {
		await db.insert(leadActivities).values(
			input.ids.map((leadId) => ({
				leadId,
				userId: actor.sub,
				type: "SYSTEM" as const,
				title: "AI nurture queued",
				description: "Lead handed off to AI nurture worker",
			})),
		);
	}

	return { queued: input.ids.length, failed: 0 };
}
