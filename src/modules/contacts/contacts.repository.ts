import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "../../config/db";
import { contacts } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import type { ListContactsQuery } from "./contacts.schema";

function buildBaseConditions(
	query: ListContactsQuery,
	actor: JWTPayload,
): SQL[] {
	const conds: SQL[] = [isNull(contacts.deletedAt)];

	if (actor.role === "SALES" || actor.role === "SUPPORT") {
		conds.push(eq(contacts.ownerUserId, actor.sub));
	}

	if (query.owner) conds.push(eq(contacts.ownerUserId, query.owner));
	if (query.accountId) conds.push(eq(contacts.accountId, query.accountId));
	if (query.tag) {
		// Postgres array contains: tags @> ARRAY['tag']
		conds.push(sql`${contacts.tags} @> ARRAY[${query.tag}]::text[]`);
	}

	if (query.search) {
		const pattern = `%${query.search}%`;
		const clause = or(
			ilike(contacts.name, pattern),
			ilike(contacts.email, pattern),
			ilike(contacts.phone, pattern),
			ilike(contacts.account, pattern),
			ilike(contacts.title, pattern),
		);
		if (clause) conds.push(clause);
	}

	return conds;
}

export async function findContacts(
	query: ListContactsQuery,
	actor: JWTPayload,
) {
	const baseConds = buildBaseConditions(query, actor);

	const orderCol =
		query.sortBy === "updatedAt"
			? contacts.updatedAt
			: query.sortBy === "name"
				? contacts.name
				: contacts.createdAt;
	const orderFn = query.sortOrder === "asc" ? asc : desc;
	const offset = (query.page - 1) * query.limit;

	const [totalRow] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(contacts)
		.where(and(...baseConds));
	const total = totalRow?.total ?? 0;

	const rows = await db
		.select()
		.from(contacts)
		.where(and(...baseConds))
		.orderBy(orderFn(orderCol), desc(contacts.id))
		.limit(query.limit)
		.offset(offset);

	// Summary counts — VIP/decisionMaker/inactive are derived from tags.
	const [agg] = await db
		.select({
			total: sql<number>`count(*)::int`,
			my: sql<number>`count(*) FILTER (
				WHERE ${contacts.ownerUserId} = ${actor.sub}
			)::int`,
			vip: sql<number>`count(*) FILTER (
				WHERE ${contacts.tags} @> ARRAY['VIP']::text[]
			)::int`,
			decisionMaker: sql<number>`count(*) FILTER (
				WHERE ${contacts.tags} @> ARRAY['Decision Maker']::text[]
			)::int`,
			inactive: sql<number>`count(*) FILTER (
				WHERE ${contacts.tags} @> ARRAY['Inactive']::text[]
			)::int`,
		})
		.from(contacts)
		.where(and(...baseConds));

	return {
		rows,
		total,
		summary: {
			total: agg?.total ?? 0,
			my: agg?.my ?? 0,
			vip: agg?.vip ?? 0,
			decisionMaker: agg?.decisionMaker ?? 0,
			inactive: agg?.inactive ?? 0,
		},
	};
}
