import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../config/db";
import { dealStageHistory, deals, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { findDeals } from "./deals.repository";
import type {
	BulkChangeStageInput,
	BulkDeleteInput,
	BulkReassignInput,
	ChangeStageInput,
	CreateDealInput,
	ListDealsQuery,
	UpdateDealInput,
} from "./deals.schema";
import { type OwnerMap, shapeDeal } from "./deals.shape";

async function loadOwners(ids: Iterable<string>): Promise<OwnerMap> {
	const list = [...new Set([...ids].filter(Boolean))];
	if (list.length === 0) return new Map();
	const rows = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(inArray(users.id, list));
	return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name }]));
}

export async function assertDealAccess(id: string, actor: JWTPayload) {
	const [deal] = await db
		.select()
		.from(deals)
		.where(and(eq(deals.id, id), isNull(deals.deletedAt)))
		.limit(1);
	if (!deal) throw new NotFoundError("Deal not found");
	if (
		(actor.role === "SALES" || actor.role === "SUPPORT") &&
		deal.ownerUserId !== actor.sub
	) {
		throw new ForbiddenError("You can only access deals assigned to you");
	}
	return deal;
}

function toAmountString(v: number | undefined): string | undefined {
	if (v === undefined) return undefined;
	return v.toFixed(2);
}

export async function createDeal(input: CreateDealInput, actor: JWTPayload) {
	const ownerUserId =
		actor.role === "SALES" && !input.owner ? actor.sub : (input.owner ?? null);
	if (!input.name) throw new Error("name is required");

	const [deal] = await db
		.insert(deals)
		.values({
			name: input.name,
			account: input.account,
			accountId: input.accountId,
			contactId: input.contactId,
			amount: toAmountString(input.amount) ?? "0",
			stage: input.stage ?? "prospecting",
			closeDate: input.closeDate ? new Date(input.closeDate) : null,
			ownerUserId,
			source: input.source,
			lastActivity: input.lastActivity,
			hot: input.hot ?? false,
			ai: input.ai ?? false,
			nextStep: input.nextStep,
		})
		.returning();
	if (!deal) throw new Error("Failed to create deal");

	await db.insert(dealStageHistory).values({
		dealId: deal.id,
		fromStage: null,
		toStage: deal.stage,
		changedByUserId: actor.sub,
	});

	const owners = await loadOwners([deal.ownerUserId ?? ""]);
	return shapeDeal(deal, owners);
}

export async function getDeal(id: string, actor: JWTPayload) {
	const deal = await assertDealAccess(id, actor);
	const owners = await loadOwners([deal.ownerUserId ?? ""]);
	return shapeDeal(deal, owners);
}

export async function updateDeal(
	id: string,
	input: UpdateDealInput,
	actor: JWTPayload,
) {
	const old = await assertDealAccess(id, actor);

	const updates: Partial<typeof deals.$inferInsert> = { updatedAt: new Date() };
	if (input.name !== undefined) updates.name = input.name;
	if (input.account !== undefined) updates.account = input.account;
	if (input.accountId !== undefined) updates.accountId = input.accountId;
	if (input.contactId !== undefined) updates.contactId = input.contactId;
	if (input.amount !== undefined)
		updates.amount = toAmountString(input.amount) ?? "0";
	if (input.stage !== undefined) updates.stage = input.stage;
	if (input.closeDate !== undefined)
		updates.closeDate = input.closeDate ? new Date(input.closeDate) : null;
	if (input.owner !== undefined) updates.ownerUserId = input.owner;
	if (input.source !== undefined) updates.source = input.source;
	if (input.lastActivity !== undefined)
		updates.lastActivity = input.lastActivity;
	if (input.hot !== undefined) updates.hot = input.hot;
	if (input.ai !== undefined) updates.ai = input.ai;
	if (input.nextStep !== undefined) updates.nextStep = input.nextStep;

	const [updated] = await db
		.update(deals)
		.set(updates)
		.where(and(eq(deals.id, id), isNull(deals.deletedAt)))
		.returning();
	if (!updated) throw new Error("Failed to update deal");

	if (input.stage && input.stage !== old.stage) {
		await db.insert(dealStageHistory).values({
			dealId: id,
			fromStage: old.stage,
			toStage: input.stage,
			changedByUserId: actor.sub,
		});
	}

	const owners = await loadOwners([updated.ownerUserId ?? ""]);
	return shapeDeal(updated, owners);
}

export async function changeStage(
	id: string,
	input: ChangeStageInput,
	actor: JWTPayload,
) {
	const old = await assertDealAccess(id, actor);
	if (old.stage === input.stage) {
		const owners = await loadOwners([old.ownerUserId ?? ""]);
		return shapeDeal(old, owners);
	}

	const [updated] = await db
		.update(deals)
		.set({ stage: input.stage, updatedAt: new Date() })
		.where(and(eq(deals.id, id), isNull(deals.deletedAt)))
		.returning();
	if (!updated) throw new Error("Failed to update deal stage");

	await db.insert(dealStageHistory).values({
		dealId: id,
		fromStage: old.stage,
		toStage: input.stage,
		changedByUserId: actor.sub,
	});

	const owners = await loadOwners([updated.ownerUserId ?? ""]);
	return shapeDeal(updated, owners);
}

export async function softDeleteDeal(id: string, actor: JWTPayload) {
	if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
		throw new ForbiddenError("Only ADMIN and MANAGER can delete deals");
	}
	const [deal] = await db
		.select({ id: deals.id })
		.from(deals)
		.where(and(eq(deals.id, id), isNull(deals.deletedAt)))
		.limit(1);
	if (!deal) throw new NotFoundError("Deal not found");
	await db.update(deals).set({ deletedAt: new Date() }).where(eq(deals.id, id));
}

export async function listDeals(query: ListDealsQuery, actor: JWTPayload) {
	const { rows, total, summary } = await findDeals(query, actor);
	const ownerIds = rows
		.map((r) => r.ownerUserId)
		.filter((v): v is string => Boolean(v));
	const owners = await loadOwners(ownerIds);
	return {
		deals: rows.map((r) => shapeDeal(r, owners)),
		total,
		page: query.page,
		limit: query.limit,
		hasMore: query.page * query.limit < total,
		summary,
	};
}

export async function listStageHistory(dealId: string, actor: JWTPayload) {
	await assertDealAccess(dealId, actor);
	const rows = await db
		.select({ history: dealStageHistory, name: users.name })
		.from(dealStageHistory)
		.leftJoin(users, eq(dealStageHistory.changedByUserId, users.id))
		.where(eq(dealStageHistory.dealId, dealId))
		.orderBy(desc(dealStageHistory.changedAt));

	return {
		history: rows.map((r) => ({
			id: r.history.id,
			fromStage: r.history.fromStage,
			toStage: r.history.toStage,
			changedBy: r.name ?? null,
			changedAt: r.history.changedAt,
		})),
	};
}

export async function listActivities(_dealId: string, actor: JWTPayload) {
	await assertDealAccess(_dealId, actor);
	// Activities are scoped to leads today; for deals we surface an empty list
	// until a polymorphic activity feed lands. Keep the endpoint live so the
	// detail-panel loader works against a stable contract.
	return { activities: [] as Array<Record<string, unknown>> };
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
		.update(deals)
		.set({ deletedAt: new Date() })
		.where(and(inArray(deals.id, input.ids), isNull(deals.deletedAt)));
	return { affected: input.ids.length };
}

export async function bulkReassign(
	input: BulkReassignInput,
	actor: JWTPayload,
) {
	ensureBulkRole(actor);
	await db
		.update(deals)
		.set({ ownerUserId: input.owner, updatedAt: new Date() })
		.where(and(inArray(deals.id, input.ids), isNull(deals.deletedAt)));
	return { affected: input.ids.length };
}

export async function bulkChangeStage(
	input: BulkChangeStageInput,
	actor: JWTPayload,
) {
	ensureBulkRole(actor);
	const targets = await db
		.select({ id: deals.id, stage: deals.stage })
		.from(deals)
		.where(and(inArray(deals.id, input.ids), isNull(deals.deletedAt)));

	await db
		.update(deals)
		.set({ stage: input.stage, updatedAt: new Date() })
		.where(and(inArray(deals.id, input.ids), isNull(deals.deletedAt)));

	const changed = targets.filter((t) => t.stage !== input.stage);
	if (changed.length > 0) {
		await db.insert(dealStageHistory).values(
			changed.map((t) => ({
				dealId: t.id,
				fromStage: t.stage,
				toStage: input.stage,
				changedByUserId: actor.sub,
			})),
		);
	}
	return { affected: input.ids.length, stage: input.stage };
}
