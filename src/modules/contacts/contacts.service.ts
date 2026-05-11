import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../config/db";
import { contacts, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { findContacts } from "./contacts.repository";
import type {
	BulkAddTagInput,
	BulkDeleteInput,
	BulkReassignInput,
	CreateContactInput,
	ListContactsQuery,
	UpdateContactInput,
} from "./contacts.schema";
import { type OwnerMap, shapeContact } from "./contacts.shape";

async function loadOwners(ids: Iterable<string>): Promise<OwnerMap> {
	const list = [...new Set([...ids].filter(Boolean))];
	if (list.length === 0) return new Map();
	const rows = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(inArray(users.id, list));
	return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name }]));
}

export async function assertContactAccess(id: string, actor: JWTPayload) {
	const [contact] = await db
		.select()
		.from(contacts)
		.where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
		.limit(1);
	if (!contact) throw new NotFoundError("Contact not found");
	if (
		(actor.role === "SALES" || actor.role === "SUPPORT") &&
		contact.ownerUserId !== actor.sub
	) {
		throw new ForbiddenError("You can only access contacts assigned to you");
	}
	return contact;
}

export async function createContact(
	input: CreateContactInput,
	actor: JWTPayload,
) {
	const ownerUserId =
		actor.role === "SALES" && !input.owner ? actor.sub : (input.owner ?? null);
	if (!input.name) throw new Error("name is required");

	const [contact] = await db
		.insert(contacts)
		.values({
			name: input.name,
			title: input.title,
			account: input.account,
			accountId: input.accountId,
			email: input.email,
			phone: input.phone,
			tags: input.tags ?? [],
			ownerUserId,
			last: input.last,
		})
		.returning();
	if (!contact) throw new Error("Failed to create contact");

	const owners = await loadOwners([contact.ownerUserId ?? ""]);
	return shapeContact(contact, owners);
}

export async function getContact(id: string, actor: JWTPayload) {
	const contact = await assertContactAccess(id, actor);
	const owners = await loadOwners([contact.ownerUserId ?? ""]);
	return shapeContact(contact, owners);
}

export async function updateContact(
	id: string,
	input: UpdateContactInput,
	actor: JWTPayload,
) {
	await assertContactAccess(id, actor);

	const updates: Partial<typeof contacts.$inferInsert> = {
		updatedAt: new Date(),
	};
	if (input.name !== undefined) updates.name = input.name;
	if (input.title !== undefined) updates.title = input.title;
	if (input.account !== undefined) updates.account = input.account;
	if (input.accountId !== undefined) updates.accountId = input.accountId;
	if (input.email !== undefined) updates.email = input.email;
	if (input.phone !== undefined) updates.phone = input.phone;
	if (input.tags !== undefined) updates.tags = input.tags;
	if (input.owner !== undefined) updates.ownerUserId = input.owner;
	if (input.last !== undefined) updates.last = input.last;

	const [updated] = await db
		.update(contacts)
		.set(updates)
		.where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
		.returning();
	if (!updated) throw new Error("Failed to update contact");

	const owners = await loadOwners([updated.ownerUserId ?? ""]);
	return shapeContact(updated, owners);
}

export async function softDeleteContact(id: string, actor: JWTPayload) {
	if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
		throw new ForbiddenError("Only ADMIN and MANAGER can delete contacts");
	}
	const [contact] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
		.limit(1);
	if (!contact) throw new NotFoundError("Contact not found");
	await db
		.update(contacts)
		.set({ deletedAt: new Date() })
		.where(eq(contacts.id, id));
}

export async function listContacts(
	query: ListContactsQuery,
	actor: JWTPayload,
) {
	const { rows, total, summary } = await findContacts(query, actor);
	const ownerIds = rows
		.map((r) => r.ownerUserId)
		.filter((v): v is string => Boolean(v));
	const owners = await loadOwners(ownerIds);
	return {
		contacts: rows.map((r) => shapeContact(r, owners)),
		total,
		page: query.page,
		limit: query.limit,
		hasMore: query.page * query.limit < total,
		summary,
	};
}

// ─── Bulk ────────────────────────────────────────────────────────────────────

function ensureBulkRole(actor: JWTPayload) {
	if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
		throw new ForbiddenError("Bulk operations require ADMIN or MANAGER");
	}
}

export async function bulkDelete(input: BulkDeleteInput, actor: JWTPayload) {
	ensureBulkRole(actor);
	await db
		.update(contacts)
		.set({ deletedAt: new Date() })
		.where(and(inArray(contacts.id, input.ids), isNull(contacts.deletedAt)));
	return { affected: input.ids.length };
}

export async function bulkReassign(
	input: BulkReassignInput,
	actor: JWTPayload,
) {
	ensureBulkRole(actor);
	await db
		.update(contacts)
		.set({ ownerUserId: input.owner, updatedAt: new Date() })
		.where(and(inArray(contacts.id, input.ids), isNull(contacts.deletedAt)));
	return { affected: input.ids.length };
}

export async function bulkAddTag(input: BulkAddTagInput, actor: JWTPayload) {
	ensureBulkRole(actor);
	// Append tag if not present using array_append + uniqueness via SELECT.
	await db
		.update(contacts)
		.set({
			tags: sql`(
				SELECT array_agg(DISTINCT t)
				FROM unnest(array_append(${contacts.tags}, ${input.tag})) AS t
			)`,
			updatedAt: new Date(),
		})
		.where(and(inArray(contacts.id, input.ids), isNull(contacts.deletedAt)));
	return { affected: input.ids.length, tag: input.tag };
}
