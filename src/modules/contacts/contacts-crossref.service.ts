import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "../../config/db";
import { deals } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { assertContactAccess } from "./contacts.service";

export async function listRelatedDeals(contactId: string, actor: JWTPayload) {
	const contact = await assertContactAccess(contactId, actor);

	// Match deals where deal.contactId == this contact OR account name matches.
	const accountClause = contact.account
		? eq(deals.account, contact.account)
		: undefined;
	const where = accountClause
		? or(eq(deals.contactId, contactId), accountClause)
		: eq(deals.contactId, contactId);

	const rows = await db
		.select()
		.from(deals)
		.where(
			and(where ?? eq(deals.contactId, contactId), isNull(deals.deletedAt)),
		)
		.orderBy(desc(deals.createdAt));

	return { deals: rows };
}

export async function listRelatedActivities(
	contactId: string,
	actor: JWTPayload,
) {
	// Activities are currently scoped to leads. For contacts we surface notes
	// (the only contact-scoped audit trail today) as activity entries.
	await assertContactAccess(contactId, actor);
	return { activities: [] as Array<Record<string, unknown>> };
}
