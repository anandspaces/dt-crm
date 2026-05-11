import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	desc,
	eq,
	ilike,
	inArray,
	isNull,
	or,
	sql,
} from "drizzle-orm";
import { db } from "../../config/db";
import { accounts, contacts, deals } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import type { ListAccountsQuery } from "./accounts.schema";
import type { CountsMap } from "./accounts.shape";

function buildBaseConditions(
	query: ListAccountsQuery,
	actor: JWTPayload,
): SQL[] {
	const conds: SQL[] = [isNull(accounts.deletedAt)];

	if (actor.role === "SALES" || actor.role === "SUPPORT") {
		conds.push(eq(accounts.ownerUserId, actor.sub));
	}

	if (query.owner) conds.push(eq(accounts.ownerUserId, query.owner));
	if (query.tier) conds.push(eq(accounts.tier, query.tier));
	if (query.type) conds.push(eq(accounts.type, query.type));

	if (query.search) {
		const pattern = `%${query.search}%`;
		const clause = or(
			ilike(accounts.name, pattern),
			ilike(accounts.industry, pattern),
			ilike(accounts.city, pattern),
		);
		if (clause) conds.push(clause);
	}

	return conds;
}

export async function loadAccountCounts(
	accountIds: string[],
	accountNames: Array<string | null>,
): Promise<CountsMap> {
	if (accountIds.length === 0) return new Map();
	const namesNonNull = accountNames.filter((n): n is string => Boolean(n));

	const contactsByFk = await db
		.select({
			accountId: contacts.accountId,
			n: sql<number>`count(*)::int`,
		})
		.from(contacts)
		.where(
			and(inArray(contacts.accountId, accountIds), isNull(contacts.deletedAt)),
		)
		.groupBy(contacts.accountId);

	const contactsByName =
		namesNonNull.length > 0
			? await db
					.select({
						account: contacts.account,
						n: sql<number>`count(*)::int`,
					})
					.from(contacts)
					.where(
						and(
							inArray(contacts.account, namesNonNull),
							isNull(contacts.accountId),
							isNull(contacts.deletedAt),
						),
					)
					.groupBy(contacts.account)
			: [];

	const dealsByFk = await db
		.select({
			accountId: deals.accountId,
			n: sql<number>`count(*)::int`,
		})
		.from(deals)
		.where(and(inArray(deals.accountId, accountIds), isNull(deals.deletedAt)))
		.groupBy(deals.accountId);

	const dealsByName =
		namesNonNull.length > 0
			? await db
					.select({
						account: deals.account,
						n: sql<number>`count(*)::int`,
					})
					.from(deals)
					.where(
						and(
							inArray(deals.account, namesNonNull),
							isNull(deals.accountId),
							isNull(deals.deletedAt),
						),
					)
					.groupBy(deals.account)
			: [];

	// Build index: by id and by name.
	const map: CountsMap = new Map();
	for (const id of accountIds) map.set(id, { contacts: 0, deals: 0 });

	const idByName = new Map<string, string>();
	// We need the name→id mapping; the caller passes name+id in same order.
	for (let i = 0; i < accountIds.length; i++) {
		const id = accountIds[i];
		const name = accountNames[i];
		if (id && name) idByName.set(name, id);
	}

	for (const r of contactsByFk) {
		if (!r.accountId) continue;
		const e = map.get(r.accountId);
		if (e) e.contacts += r.n;
	}
	for (const r of dealsByFk) {
		if (!r.accountId) continue;
		const e = map.get(r.accountId);
		if (e) e.deals += r.n;
	}
	for (const r of contactsByName) {
		if (!r.account) continue;
		const id = idByName.get(r.account);
		if (id) {
			const e = map.get(id);
			if (e) e.contacts += r.n;
		}
	}
	for (const r of dealsByName) {
		if (!r.account) continue;
		const id = idByName.get(r.account);
		if (id) {
			const e = map.get(id);
			if (e) e.deals += r.n;
		}
	}
	return map;
}

export async function findAccounts(
	query: ListAccountsQuery,
	actor: JWTPayload,
) {
	const baseConds = buildBaseConditions(query, actor);

	const orderCol =
		query.sortBy === "updatedAt"
			? accounts.updatedAt
			: query.sortBy === "name"
				? accounts.name
				: accounts.createdAt;
	const orderFn = query.sortOrder === "asc" ? asc : desc;
	const offset = (query.page - 1) * query.limit;

	const [totalRow] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(accounts)
		.where(and(...baseConds));
	const total = totalRow?.total ?? 0;

	const rows = await db
		.select()
		.from(accounts)
		.where(and(...baseConds))
		.orderBy(orderFn(orderCol), desc(accounts.id))
		.limit(query.limit)
		.offset(offset);

	const tierRows = await db
		.select({
			tier: accounts.tier,
			n: sql<number>`count(*)::int`,
		})
		.from(accounts)
		.where(and(...baseConds))
		.groupBy(accounts.tier);

	const byTier: Record<string, number> = {
		Strategic: 0,
		Enterprise: 0,
		"Mid-Market": 0,
		SMB: 0,
	};
	for (const r of tierRows) if (r.tier) byTier[r.tier] = r.n;

	return {
		rows,
		total,
		summary: {
			total,
			byTier,
		},
	};
}
