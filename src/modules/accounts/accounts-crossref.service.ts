import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "../../config/db";
import { contacts, deals } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { assertAccountAccess } from "./accounts.service";

export async function listRelatedContacts(
	accountId: string,
	actor: JWTPayload,
) {
	const account = await assertAccountAccess(accountId, actor);
	const where = account.name
		? or(eq(contacts.accountId, accountId), eq(contacts.account, account.name))
		: eq(contacts.accountId, accountId);
	const rows = await db
		.select()
		.from(contacts)
		.where(
			and(
				where ?? eq(contacts.accountId, accountId),
				isNull(contacts.deletedAt),
			),
		)
		.orderBy(desc(contacts.createdAt));
	return { contacts: rows };
}

export async function listRelatedDeals(accountId: string, actor: JWTPayload) {
	const account = await assertAccountAccess(accountId, actor);
	const where = account.name
		? or(eq(deals.accountId, accountId), eq(deals.account, account.name))
		: eq(deals.accountId, accountId);
	const rows = await db
		.select()
		.from(deals)
		.where(
			and(where ?? eq(deals.accountId, accountId), isNull(deals.deletedAt)),
		)
		.orderBy(desc(deals.createdAt));
	return { deals: rows };
}
