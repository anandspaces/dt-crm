import { and, asc, eq, gte, lt, lte, or } from "drizzle-orm";
import { db } from "../../config/db";
import { followups, leadActivities, leads } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { buildPage, decodeCursor } from "../../shared/utils/pagination";
import { assertLeadAccess } from "../leads/leads.service";
import type {
	CreateFollowupInput,
	ListFollowupsQuery,
	UpdateFollowupInput,
} from "./followups.schema";

async function recalcNextFollowupAt(leadId: string) {
	const [next] = await db
		.select({ scheduledAt: followups.scheduledAt })
		.from(followups)
		.where(and(eq(followups.leadId, leadId), eq(followups.status, "PENDING")))
		.orderBy(asc(followups.scheduledAt))
		.limit(1);

	await db
		.update(leads)
		.set({ nextFollowupAt: next?.scheduledAt ?? null })
		.where(eq(leads.id, leadId));
}

export async function createFollowup(
	leadId: string,
	input: CreateFollowupInput,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const assignedUserId = input.assignedUserId ?? actor.sub;
	const scheduledAt = new Date(input.scheduledAt);

	const [followup] = await db
		.insert(followups)
		.values({
			leadId,
			assignedUserId,
			type: input.type,
			scheduledAt,
			notes: input.notes,
		})
		.returning();

	if (!followup) throw new Error("Failed to create followup");

	await db.insert(leadActivities).values({
		leadId,
		userId: actor.sub,
		type: "FOLLOWUP",
		title: `Followup scheduled: ${input.type}`,
		description: `Scheduled for ${scheduledAt.toISOString()}`,
	});

	await recalcNextFollowupAt(leadId);

	return followup;
}

export async function listFollowups(
	leadId: string,
	query: ListFollowupsQuery,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const conditions = [eq(followups.leadId, leadId)];

	if (query.status) conditions.push(eq(followups.status, query.status));
	if (query.from)
		conditions.push(gte(followups.scheduledAt, new Date(query.from)));
	if (query.to) conditions.push(lte(followups.scheduledAt, new Date(query.to)));

	if (query.cursor) {
		const { id, createdAt } = decodeCursor(query.cursor);
		const cursorClause = or(
			lt(followups.createdAt, createdAt),
			and(eq(followups.createdAt, createdAt), lt(followups.id, id)),
		);
		if (cursorClause) conditions.push(cursorClause);
	}

	const rows = await db
		.select()
		.from(followups)
		.where(and(...conditions))
		.orderBy(asc(followups.scheduledAt))
		.limit(query.limit + 1);

	const { data, nextCursor } = buildPage(rows, query.limit);
	return { data, nextCursor };
}

export async function updateFollowup(
	leadId: string,
	followupId: string,
	input: UpdateFollowupInput,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const [followup] = await db
		.select()
		.from(followups)
		.where(and(eq(followups.id, followupId), eq(followups.leadId, leadId)))
		.limit(1);

	if (!followup) throw new NotFoundError("Followup not found");

	if (
		actor.role !== "ADMIN" &&
		actor.role !== "MANAGER" &&
		followup.assignedUserId !== actor.sub
	) {
		throw new ForbiddenError("You can only update followups assigned to you");
	}

	const updates: Partial<typeof followups.$inferInsert> = {
		updatedAt: new Date(),
	};

	if (input.type !== undefined) updates.type = input.type;
	if (input.notes !== undefined) updates.notes = input.notes;
	if (input.scheduledAt !== undefined)
		updates.scheduledAt = new Date(input.scheduledAt);
	if (input.completedAt !== undefined)
		updates.completedAt = new Date(input.completedAt);

	if (input.status !== undefined) {
		updates.status = input.status;
		if (
			input.status === "DONE" &&
			!updates.completedAt &&
			!followup.completedAt
		) {
			updates.completedAt = new Date();
		}
	}

	const [updated] = await db
		.update(followups)
		.set(updates)
		.where(eq(followups.id, followupId))
		.returning();

	// Recalculate nextFollowupAt when a followup is completed/cancelled/missed
	const closedStatuses = new Set(["DONE", "MISSED", "CANCELLED"]);
	if (input.status && closedStatuses.has(input.status)) {
		await recalcNextFollowupAt(leadId);
	}

	return updated;
}

export async function listMyFollowups(
	query: ListFollowupsQuery,
	actor: JWTPayload,
) {
	const conditions = [];

	if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
		conditions.push(eq(followups.assignedUserId, actor.sub));
	} else if (query.assignedUserId) {
		conditions.push(eq(followups.assignedUserId, query.assignedUserId));
	}

	if (query.status) conditions.push(eq(followups.status, query.status));
	if (query.from)
		conditions.push(gte(followups.scheduledAt, new Date(query.from)));
	if (query.to) conditions.push(lte(followups.scheduledAt, new Date(query.to)));

	if (query.cursor) {
		const { id, createdAt } = decodeCursor(query.cursor);
		const cursorClause = or(
			lt(followups.createdAt, createdAt),
			and(eq(followups.createdAt, createdAt), lt(followups.id, id)),
		);
		if (cursorClause) conditions.push(cursorClause);
	}

	const rows = await db
		.select()
		.from(followups)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(asc(followups.scheduledAt))
		.limit(query.limit + 1);

	const { data, nextCursor } = buildPage(rows, query.limit);
	return { data, nextCursor };
}
