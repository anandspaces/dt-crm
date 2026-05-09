import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "../../config/db";
import { leadActivities, leads } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { buildPage } from "../../shared/utils/pagination";
import { findLeads } from "./leads.repository";
import type {
	BulkLeadInput,
	CreateLeadInput,
	ListLeadsQuery,
	UpdateLeadInput,
} from "./leads.schema";

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

export async function createLead(input: CreateLeadInput, actor: JWTPayload) {
	// SALES auto-assign: if no assignedUserId provided, assign to self
	const assignedUserId =
		actor.role === "SALES" && !input.assignedUserId
			? actor.sub
			: input.assignedUserId;

	const [lead] = await db
		.insert(leads)
		.values({ ...input, assignedUserId })
		.returning();

	if (!lead) throw new Error("Failed to create lead");

	await db.insert(leadActivities).values({
		leadId: lead.id,
		userId: actor.sub,
		type: "SYSTEM",
		title: "Lead created",
		description: `Created manually by ${actor.email}`,
	});

	return lead;
}

export async function getLead(id: string, actor: JWTPayload) {
	const lead = await assertLeadAccess(id, actor);

	return db.query.leads.findFirst({
		where: (l, { eq }) => eq(l.id, lead.id),
		with: {
			assignedUser: { columns: { passwordHash: false } },
			pipeline: true,
			stage: true,
			tags: { with: { tag: true } },
			activities: {
				limit: 10,
				orderBy: (a, { desc }) => [desc(a.createdAt)],
			},
			followups: {
				where: (f, { eq }) => eq(f.status, "PENDING"),
				orderBy: (f, { asc }) => [asc(f.scheduledAt)],
			},
		},
	});
}

export async function updateLead(
	id: string,
	input: UpdateLeadInput,
	actor: JWTPayload,
) {
	const oldLead = await assertLeadAccess(id, actor);

	const [updated] = await db
		.update(leads)
		.set({ ...input, updatedAt: new Date() })
		.where(and(eq(leads.id, id), isNull(leads.deletedAt)))
		.returning();

	if (!updated) throw new Error("Failed to update lead");

	// Log STATUS_CHANGE activity
	if (input.status && input.status !== oldLead.status) {
		await db.insert(leadActivities).values({
			leadId: id,
			userId: actor.sub,
			type: "STATUS_CHANGE",
			title: `Status changed to ${input.status}`,
			description: `From ${oldLead.status} → ${input.status}`,
		});
	}

	// Log ASSIGNMENT activity
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

	return updated;
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
	const { rows, total } = await findLeads(query, actor);
	const { data, nextCursor } = buildPage(rows, query.limit);
	return {
		data,
		meta: { total, limit: query.limit, nextCursor },
	};
}

export async function bulkLead(input: BulkLeadInput, actor: JWTPayload) {
	const { action, leadIds, payload } = input;

	if (
		action === "delete" &&
		actor.role !== "ADMIN" &&
		actor.role !== "MANAGER"
	) {
		throw new ForbiddenError("Only ADMIN and MANAGER can bulk delete leads");
	}

	if (
		action === "assign" &&
		actor.role !== "ADMIN" &&
		actor.role !== "MANAGER"
	) {
		throw new ForbiddenError("Only ADMIN and MANAGER can bulk assign leads");
	}

	switch (action) {
		case "assign": {
			if (!payload?.assignedUserId) {
				throw new Error("assignedUserId required for assign action");
			}
			await db
				.update(leads)
				.set({ assignedUserId: payload.assignedUserId, updatedAt: new Date() })
				.where(and(inArray(leads.id, leadIds), isNull(leads.deletedAt)));

			await db.insert(leadActivities).values(
				leadIds.map((leadId) => ({
					leadId,
					userId: actor.sub,
					type: "ASSIGNMENT" as const,
					title: "Lead bulk assigned",
					description: `Bulk assigned to user ${payload.assignedUserId}`,
				})),
			);
			break;
		}
		case "status": {
			if (!payload?.status) {
				throw new Error("status required for status action");
			}
			await db
				.update(leads)
				.set({ status: payload.status, updatedAt: new Date() })
				.where(and(inArray(leads.id, leadIds), isNull(leads.deletedAt)));

			await db.insert(leadActivities).values(
				leadIds.map((leadId) => ({
					leadId,
					userId: actor.sub,
					type: "STATUS_CHANGE" as const,
					title: `Bulk status change to ${payload.status}`,
				})),
			);
			break;
		}
		case "delete": {
			await db
				.update(leads)
				.set({ deletedAt: new Date() })
				.where(and(inArray(leads.id, leadIds), isNull(leads.deletedAt)));
			break;
		}
	}

	return { affected: leadIds.length };
}
