import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	ilike,
	isNull,
	lt,
	lte,
	or,
	sql,
} from "drizzle-orm";
import { db } from "../../config/db";
import { leads } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { decodeCursor } from "../../shared/utils/pagination";
import type { ListLeadsQuery } from "./leads.schema";

export async function findLeads(query: ListLeadsQuery, actor: JWTPayload) {
	// Base conditions (always applied — deletedAt IS NULL is ALWAYS first)
	const baseConditions: SQL[] = [isNull(leads.deletedAt)];

	// RBAC: SALES and SUPPORT only see their assigned leads
	if (actor.role === "SALES" || actor.role === "SUPPORT") {
		baseConditions.push(eq(leads.assignedUserId, actor.sub));
	}

	if (query.status) baseConditions.push(eq(leads.status, query.status));
	if (query.priority) baseConditions.push(eq(leads.priority, query.priority));
	if (query.assignedUserId)
		baseConditions.push(eq(leads.assignedUserId, query.assignedUserId));
	if (query.pipelineId)
		baseConditions.push(eq(leads.pipelineId, query.pipelineId));
	if (query.stageId) baseConditions.push(eq(leads.stageId, query.stageId));
	if (query.source) baseConditions.push(eq(leads.source, query.source));

	if (query.search) {
		const pattern = `%${query.search}%`;
		const searchClause = or(
			ilike(leads.firstName, pattern),
			ilike(leads.lastName, pattern),
			ilike(leads.email, pattern),
			ilike(leads.phone, pattern),
			ilike(leads.company, pattern),
		);
		if (searchClause) baseConditions.push(searchClause);
	}

	if (query.createdFrom) {
		baseConditions.push(gte(leads.createdAt, new Date(query.createdFrom)));
	}
	if (query.createdTo) {
		baseConditions.push(lte(leads.createdAt, new Date(query.createdTo)));
	}

	// Total count — excludes cursor condition for accurate total
	const [{ total }] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(leads)
		.where(and(...baseConditions));

	// Cursor condition (only for data query)
	const dataConditions = [...baseConditions];
	if (query.cursor) {
		const { id, createdAt } = decodeCursor(query.cursor);
		// DESC order keyset: (created_at < cursor) OR (created_at = cursor AND id < cursor.id)
		const cursorClause = or(
			lt(leads.createdAt, createdAt),
			and(eq(leads.createdAt, createdAt), lt(leads.id, id)),
		);
		if (cursorClause) dataConditions.push(cursorClause);
	}

	const orderCol =
		query.sortBy === "score"
			? leads.score
			: query.sortBy === "updatedAt"
				? leads.updatedAt
				: leads.createdAt;

	const orderFn = query.sortDir === "asc" ? asc : desc;

	const rows = await db
		.select()
		.from(leads)
		.where(and(...dataConditions))
		.orderBy(orderFn(orderCol), desc(leads.id))
		.limit(query.limit + 1);

	return { rows, total };
}
