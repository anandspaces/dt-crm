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
import { deals } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import type { ListDealsQuery } from "./deals.schema";

const WON_STAGE = "closed_won";

// Stage probability weights (matches CRM convention used by Flutter UI summary).
const STAGE_WEIGHT: Record<string, number> = {
	prospecting: 0.1,
	qualification: 0.25,
	proposal: 0.5,
	negotiation: 0.75,
	closed_won: 1,
	closed_lost: 0,
};

function buildBaseConditions(query: ListDealsQuery, actor: JWTPayload): SQL[] {
	const conds: SQL[] = [isNull(deals.deletedAt)];

	if (actor.role === "SALES" || actor.role === "SUPPORT") {
		conds.push(eq(deals.ownerUserId, actor.sub));
	}

	if (query.owner) conds.push(eq(deals.ownerUserId, query.owner));
	if (query.stage) conds.push(eq(deals.stage, query.stage));
	if (query.hot !== undefined) conds.push(eq(deals.hot, query.hot));
	if (query.ai !== undefined) conds.push(eq(deals.ai, query.ai));

	if (query.search) {
		const pattern = `%${query.search}%`;
		const clause = or(
			ilike(deals.name, pattern),
			ilike(deals.account, pattern),
			ilike(deals.source, pattern),
		);
		if (clause) conds.push(clause);
	}

	if (query.closeDateFrom) {
		conds.push(gte(deals.closeDate, new Date(query.closeDateFrom)));
	}
	if (query.closeDateTo) {
		const to = new Date(query.closeDateTo);
		if (query.closeDateTo.length === 10) to.setUTCHours(23, 59, 59, 999);
		conds.push(lte(deals.closeDate, to));
	}

	return conds;
}

export async function findDeals(query: ListDealsQuery, actor: JWTPayload) {
	const baseConds = buildBaseConditions(query, actor);

	const orderCol =
		query.sortBy === "updatedAt"
			? deals.updatedAt
			: query.sortBy === "name"
				? deals.name
				: query.sortBy === "amount"
					? deals.amount
					: query.sortBy === "closeDate"
						? deals.closeDate
						: deals.createdAt;
	const orderFn = query.sortOrder === "asc" ? asc : desc;
	const offset = (query.page - 1) * query.limit;

	const [totalRow] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(deals)
		.where(and(...baseConds));
	const total = totalRow?.total ?? 0;

	const rows = await db
		.select()
		.from(deals)
		.where(and(...baseConds))
		.orderBy(orderFn(orderCol), desc(deals.id))
		.limit(query.limit)
		.offset(offset);

	// Summary aggregations across the same filter set.
	const stageRows = await db
		.select({
			stage: deals.stage,
			count: sql<number>`count(*)::int`,
			total: sql<number>`coalesce(sum(${deals.amount}), 0)::float`,
		})
		.from(deals)
		.where(and(...baseConds))
		.groupBy(deals.stage);

	const [agg] = await db
		.select({
			pipelineTotal: sql<number>`coalesce(sum(${deals.amount}), 0)::float`,
			hotCount: sql<number>`count(*) FILTER (WHERE ${deals.hot})::int`,
			aiCount: sql<number>`count(*) FILTER (WHERE ${deals.ai})::int`,
			mineCount: sql<number>`count(*) FILTER (
				WHERE ${deals.ownerUserId} = ${actor.sub}
			)::int`,
			closingThisMonthCount: sql<number>`count(*) FILTER (
				WHERE ${deals.closeDate} >= date_trunc('month', now())
				  AND ${deals.closeDate} <  date_trunc('month', now()) + interval '1 month'
			)::int`,
		})
		.from(deals)
		.where(and(...baseConds));

	const [wonYtdRow] = await db
		.select({
			wonYtd: sql<number>`coalesce(sum(${deals.amount}), 0)::float`,
		})
		.from(deals)
		.where(
			and(
				...baseConds,
				eq(deals.stage, WON_STAGE),
				sql`${deals.updatedAt} >= date_trunc('year', now())`,
			),
		);

	const byStage: Record<string, { count: number; total: number }> = {};
	let weightedTotal = 0;
	for (const r of stageRows) {
		byStage[r.stage] = { count: r.count, total: r.total };
		weightedTotal += r.total * (STAGE_WEIGHT[r.stage] ?? 0);
	}

	return {
		rows,
		total,
		summary: {
			pipelineTotal: agg?.pipelineTotal ?? 0,
			weightedTotal,
			wonYtd: wonYtdRow?.wonYtd ?? 0,
			hotCount: agg?.hotCount ?? 0,
			aiCount: agg?.aiCount ?? 0,
			mineCount: agg?.mineCount ?? 0,
			closingThisMonthCount: agg?.closingThisMonthCount ?? 0,
			byStage,
		},
	};
}
