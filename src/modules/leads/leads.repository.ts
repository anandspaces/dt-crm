import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	ilike,
	isNull,
	lte,
	or,
	sql,
} from "drizzle-orm";
import { db } from "../../config/db";
import { leadReminders, leads } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import type { ListLeadsQuery } from "./leads.schema";

function buildBaseConditions(
	query: ListLeadsQuery,
	actor: JWTPayload,
): SQL[] {
	const conds: SQL[] = [isNull(leads.deletedAt)];

	if (actor.role === "SALES" || actor.role === "SUPPORT") {
		conds.push(eq(leads.assignedUserId, actor.sub));
	}

	if (query.status) conds.push(eq(leads.status, query.status));
	if (query.priority) conds.push(eq(leads.priority, query.priority));
	if (query.source) conds.push(eq(leads.source, query.source));
	if (query.assignedTo) conds.push(eq(leads.assignedUserId, query.assignedTo));
	if (query.pipelineId) conds.push(eq(leads.pipelineId, query.pipelineId));
	if (query.stageId) conds.push(eq(leads.stageId, query.stageId));
	if (query.city) conds.push(eq(leads.city, query.city));
	if (query.hot !== undefined) conds.push(eq(leads.hot, query.hot));

	if (typeof query.scoreMin === "number")
		conds.push(gte(leads.score, query.scoreMin));
	if (typeof query.scoreMax === "number")
		conds.push(lte(leads.score, query.scoreMax));

	if (query.search) {
		const pattern = `%${query.search}%`;
		const clause = or(
			ilike(leads.firstName, pattern),
			ilike(leads.lastName, pattern),
			ilike(leads.email, pattern),
			ilike(leads.phone, pattern),
			ilike(leads.company, pattern),
		);
		if (clause) conds.push(clause);
	}

	if (query.dateFrom) conds.push(gte(leads.createdAt, new Date(query.dateFrom)));
	if (query.dateTo) {
		// end-of-day if a bare date string was passed
		const to = new Date(query.dateTo);
		if (query.dateTo.length === 10) to.setUTCHours(23, 59, 59, 999);
		conds.push(lte(leads.createdAt, to));
	}

	if (query.group === "fresh") {
		conds.push(isNull(leads.lastContactedAt));
	} else if (query.group === "urgent") {
		conds.push(
			sql`EXISTS (
				SELECT 1 FROM ${leadReminders} r
				WHERE r.lead_id = ${leads.id}
				  AND r.completed_at IS NULL
				  AND r.dismissed = false
				  AND r.due_at < now()
			)`,
		);
	} else if (query.group === "today") {
		conds.push(
			sql`EXISTS (
				SELECT 1 FROM ${leadReminders} r
				WHERE r.lead_id = ${leads.id}
				  AND r.completed_at IS NULL
				  AND r.dismissed = false
				  AND r.due_at >= date_trunc('day', now())
				  AND r.due_at < date_trunc('day', now()) + interval '1 day'
			)`,
		);
	}

	return conds;
}

export async function findLeads(query: ListLeadsQuery, actor: JWTPayload) {
	const baseConds = buildBaseConditions(query, actor);

	const orderCol =
		query.sortBy === "score"
			? leads.score
			: query.sortBy === "updatedAt"
				? leads.updatedAt
				: query.sortBy === "name"
					? leads.firstName
					: query.sortBy === "lastContactedAt"
						? leads.lastContactedAt
						: leads.createdAt;
	const orderFn = query.sortOrder === "asc" ? asc : desc;

	const offset = (query.page - 1) * query.limit;

	const [totalRow] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(leads)
		.where(and(...baseConds));
	const total = totalRow?.total ?? 0;

	const rows = await db
		.select()
		.from(leads)
		.where(and(...baseConds))
		.orderBy(orderFn(orderCol), desc(leads.id))
		.limit(query.limit)
		.offset(offset);

	const summaryRows = await db
		.select({
			status: leads.status,
			n: sql<number>`count(*)::int`,
		})
		.from(leads)
		.where(and(...baseConds))
		.groupBy(leads.status);

	const summary: Record<string, number> = {};
	for (const r of summaryRows) summary[r.status] = r.n;

	return { rows, total, summary };
}

export async function findStats(query: ListLeadsQuery, actor: JWTPayload) {
	const baseConds = buildBaseConditions(query, actor);

	const [byStatusRows, bySourceRows, [agg]] = await Promise.all([
		db
			.select({ k: leads.status, n: sql<number>`count(*)::int` })
			.from(leads)
			.where(and(...baseConds))
			.groupBy(leads.status),
		db
			.select({ k: leads.source, n: sql<number>`count(*)::int` })
			.from(leads)
			.where(and(...baseConds))
			.groupBy(leads.source),
		db
			.select({
				total: sql<number>`count(*)::int`,
				hot: sql<number>`count(*) FILTER (WHERE ${leads.hot})::int`,
				ai: sql<number>`count(*) FILTER (WHERE ${leads.aiEnriched})::int`,
			})
			.from(leads)
			.where(and(...baseConds)),
	]);

	const byStatus: Record<string, number> = {};
	for (const r of byStatusRows) byStatus[r.k] = r.n;

	const bySource: Record<string, number> = {};
	for (const r of bySourceRows) if (r.k) bySource[r.k] = r.n;

	return {
		byStatus,
		bySource,
		total: agg?.total ?? 0,
		hotCount: agg?.hot ?? 0,
		aiEnrichedCount: agg?.ai ?? 0,
	};
}
