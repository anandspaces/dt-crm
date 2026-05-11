import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../config/db";
import { accounts, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { findAccounts, loadAccountCounts } from "./accounts.repository";
import type {
	BulkDeleteInput,
	BulkReassignInput,
	CreateAccountInput,
	ListAccountsQuery,
	UpdateAccountInput,
} from "./accounts.schema";
import { type OwnerMap, shapeAccount } from "./accounts.shape";

async function loadOwners(ids: Iterable<string>): Promise<OwnerMap> {
	const list = [...new Set([...ids].filter(Boolean))];
	if (list.length === 0) return new Map();
	const rows = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(inArray(users.id, list));
	return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name }]));
}

export async function assertAccountAccess(id: string, actor: JWTPayload) {
	const [account] = await db
		.select()
		.from(accounts)
		.where(and(eq(accounts.id, id), isNull(accounts.deletedAt)))
		.limit(1);
	if (!account) throw new NotFoundError("Account not found");
	if (
		(actor.role === "SALES" || actor.role === "SUPPORT") &&
		account.ownerUserId !== actor.sub
	) {
		throw new ForbiddenError("You can only access accounts assigned to you");
	}
	return account;
}

export async function createAccount(
	input: CreateAccountInput,
	actor: JWTPayload,
) {
	const ownerUserId =
		actor.role === "SALES" && !input.owner ? actor.sub : (input.owner ?? null);
	if (!input.name) throw new Error("name is required");

	const [account] = await db
		.insert(accounts)
		.values({
			name: input.name,
			industry: input.industry,
			tier: input.tier,
			type: input.type,
			city: input.city,
			revenue: input.revenue,
			employees: input.employees,
			ownerUserId,
		})
		.returning();
	if (!account) throw new Error("Failed to create account");

	const owners = await loadOwners([account.ownerUserId ?? ""]);
	return shapeAccount(account, owners);
}

export async function getAccount(id: string, actor: JWTPayload) {
	const account = await assertAccountAccess(id, actor);
	const [owners, counts] = await Promise.all([
		loadOwners([account.ownerUserId ?? ""]),
		loadAccountCounts([account.id], [account.name]),
	]);
	return shapeAccount(account, owners, counts);
}

export async function updateAccount(
	id: string,
	input: UpdateAccountInput,
	actor: JWTPayload,
) {
	await assertAccountAccess(id, actor);

	const updates: Partial<typeof accounts.$inferInsert> = {
		updatedAt: new Date(),
	};
	if (input.name !== undefined) updates.name = input.name;
	if (input.industry !== undefined) updates.industry = input.industry;
	if (input.tier !== undefined) updates.tier = input.tier;
	if (input.type !== undefined) updates.type = input.type;
	if (input.city !== undefined) updates.city = input.city;
	if (input.revenue !== undefined) updates.revenue = input.revenue;
	if (input.employees !== undefined) updates.employees = input.employees;
	if (input.owner !== undefined) updates.ownerUserId = input.owner;

	const [updated] = await db
		.update(accounts)
		.set(updates)
		.where(and(eq(accounts.id, id), isNull(accounts.deletedAt)))
		.returning();
	if (!updated) throw new Error("Failed to update account");

	const owners = await loadOwners([updated.ownerUserId ?? ""]);
	return shapeAccount(updated, owners);
}

export async function softDeleteAccount(id: string, actor: JWTPayload) {
	if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
		throw new ForbiddenError("Only ADMIN and MANAGER can delete accounts");
	}
	const [account] = await db
		.select({ id: accounts.id })
		.from(accounts)
		.where(and(eq(accounts.id, id), isNull(accounts.deletedAt)))
		.limit(1);
	if (!account) throw new NotFoundError("Account not found");
	await db
		.update(accounts)
		.set({ deletedAt: new Date() })
		.where(eq(accounts.id, id));
}

export async function listAccounts(
	query: ListAccountsQuery,
	actor: JWTPayload,
) {
	const { rows, total, summary } = await findAccounts(query, actor);
	const ownerIds = rows
		.map((r) => r.ownerUserId)
		.filter((v): v is string => Boolean(v));
	const [owners, counts] = await Promise.all([
		loadOwners(ownerIds),
		loadAccountCounts(
			rows.map((r) => r.id),
			rows.map((r) => r.name),
		),
	]);
	return {
		accounts: rows.map((r) => shapeAccount(r, owners, counts)),
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
		.update(accounts)
		.set({ deletedAt: new Date() })
		.where(and(inArray(accounts.id, input.ids), isNull(accounts.deletedAt)));
	return { affected: input.ids.length };
}

export async function bulkReassign(
	input: BulkReassignInput,
	actor: JWTPayload,
) {
	ensureBulkRole(actor);
	await db
		.update(accounts)
		.set({ ownerUserId: input.owner, updatedAt: new Date() })
		.where(and(inArray(accounts.id, input.ids), isNull(accounts.deletedAt)));
	return { affected: input.ids.length };
}
