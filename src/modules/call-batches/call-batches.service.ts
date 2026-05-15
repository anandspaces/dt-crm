import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../config/db";
import { env } from "../../config/env";
import {
	aiAgents,
	callBatches,
	callQueueItems,
	leadCalls,
} from "../../db/schema";
import { initiateVobizCall } from "../../shared/services/vobiz.client";
import type { JWTPayload } from "../../shared/types/auth";
import { NotFoundError, UnprocessableError } from "../../shared/utils/errors";
import { logger } from "../../shared/utils/logger";
import type { StartBatchInput } from "./call-batches.schema";

const batchLocks = new Set<string>();

function publicBase(): string {
	if (!env.PUBLIC_BASE_URL) {
		throw new UnprocessableError(
			"PUBLIC_BASE_URL is not configured — Vobiz needs it for webhooks",
		);
	}
	return env.PUBLIC_BASE_URL.replace(/\/+$/, "");
}

function vobizFromNumber(override?: string | null): string {
	const num = override ?? env.VOBIZ_PHONE_NUMBER;
	if (!num) {
		throw new UnprocessableError(
			"No `from` phone number — set VOBIZ_PHONE_NUMBER or pass fromNumber in the request",
		);
	}
	return num;
}

export async function startBatch(input: StartBatchInput, actor: JWTPayload) {
	// Validate Vobiz config up front so we fail before writing any rows.
	publicBase();
	vobizFromNumber(input.fromNumber);

	const validLeads = input.leads.filter(
		(l) => l.phone && l.phone.trim().length > 0,
	);
	if (validLeads.length === 0) {
		throw new UnprocessableError("No leads with phone numbers");
	}

	// If an agentId is provided, verify ownership.
	if (input.agentId) {
		const [agent] = await db
			.select({ id: aiAgents.id })
			.from(aiAgents)
			.where(
				and(eq(aiAgents.id, input.agentId), eq(aiAgents.userId, actor.sub)),
			)
			.limit(1);
		if (!agent) throw new NotFoundError("Agent not found");
	}

	const result = await db.transaction(async (tx) => {
		const [batch] = await tx
			.insert(callBatches)
			.values({
				userId: actor.sub,
				agentId: input.agentId,
				agentName: input.agentName ?? "Bulk AI Caller",
				fromNumber: input.fromNumber ?? env.VOBIZ_PHONE_NUMBER,
				totalCount: validLeads.length,
				status: "queued",
			})
			.returning();
		if (!batch) throw new Error("Failed to create batch");

		const items = await tx
			.insert(callQueueItems)
			.values(
				validLeads.map((l, idx) => ({
					batchId: batch.id,
					userId: actor.sub,
					leadId: l.leadId,
					position: idx,
					leadName: l.name,
					company: l.company,
					email: l.email,
					phoneNumber: l.phone,
				})),
			)
			.returning();

		// Pre-create lead_calls rows for items linked to a real lead. Items with
		// no leadId remain disconnected from the leads table — that's fine.
		for (const item of items) {
			if (!item.leadId) continue;
			const [call] = await tx
				.insert(leadCalls)
				.values({
					leadId: item.leadId,
					callerType: "ai",
					callerName: input.agentName ?? "AI Caller",
					outcome: "missed",
					batchId: batch.id,
					queueItemId: item.id,
				})
				.returning({ id: leadCalls.id });
			if (call) {
				await tx
					.update(callQueueItems)
					.set({ callDocumentId: call.id, updatedAt: new Date() })
					.where(eq(callQueueItems.id, item.id));
			}
		}

		return { batch, items };
	});

	// Fire-and-forget — kicks off the first call without blocking the response.
	void startNextQueuedCall(result.batch.id).catch((err) => {
		logger.error("[call-batches] startNextQueuedCall failed", {
			batchId: result.batch.id,
			error: err instanceof Error ? err.message : String(err),
		});
	});

	return {
		batchId: result.batch.id,
		total: result.batch.totalCount,
		items: result.items.map((i) => ({
			id: i.id,
			position: i.position,
			phoneNumber: i.phoneNumber,
			leadName: i.leadName,
			status: i.status,
		})),
	};
}

export async function startNextQueuedCall(batchId: string): Promise<void> {
	if (batchLocks.has(batchId)) return;
	batchLocks.add(batchId);

	try {
		// Don't pick a new one if anything is still active in this batch.
		const [active] = await db
			.select({ id: callQueueItems.id })
			.from(callQueueItems)
			.where(
				and(
					eq(callQueueItems.batchId, batchId),
					inArray(callQueueItems.status, ["dialing", "in-progress"]),
				),
			)
			.limit(1);
		if (active) return;

		const [next] = await db
			.select()
			.from(callQueueItems)
			.where(
				and(
					eq(callQueueItems.batchId, batchId),
					eq(callQueueItems.status, "queued"),
				),
			)
			.orderBy(asc(callQueueItems.position))
			.limit(1);

		if (!next) {
			await refreshBatchCounts(batchId);
			return;
		}

		await db
			.update(callBatches)
			.set({ status: "running", startedAt: new Date() })
			.where(
				and(eq(callBatches.id, batchId), eq(callBatches.status, "queued")),
			);

		await db
			.update(callQueueItems)
			.set({
				status: "dialing",
				startedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(callQueueItems.id, next.id));

		const base = publicBase();
		const qs = `batchId=${batchId}&itemId=${next.id}&userId=${next.userId}`;
		const [batch] = await db
			.select({ fromNumber: callBatches.fromNumber })
			.from(callBatches)
			.where(eq(callBatches.id, batchId))
			.limit(1);

		try {
			const resp = await initiateVobizCall({
				from: vobizFromNumber(batch?.fromNumber ?? null),
				to: next.phoneNumber,
				answerUrl: `${base}/api/v1/vobiz/answer?${qs}`,
				hangupUrl: `${base}/api/v1/vobiz/hangup?${qs}`,
			});

			await db
				.update(callQueueItems)
				.set({
					requestUuid: resp.request_uuid,
					updatedAt: new Date(),
				})
				.where(eq(callQueueItems.id, next.id));
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.error("[call-batches] Vobiz call failed", {
				itemId: next.id,
				error: msg,
			});
			await db
				.update(callQueueItems)
				.set({
					status: "failed",
					error: msg,
					endedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(callQueueItems.id, next.id));
			await refreshBatchCounts(batchId);
			// Try the next one.
			batchLocks.delete(batchId);
			void startNextQueuedCall(batchId);
			return;
		}
	} finally {
		batchLocks.delete(batchId);
	}
}

export async function refreshBatchCounts(batchId: string): Promise<void> {
	const counts = await db
		.select({
			status: callQueueItems.status,
			n: count(callQueueItems.id),
		})
		.from(callQueueItems)
		.where(eq(callQueueItems.batchId, batchId))
		.groupBy(callQueueItems.status);

	let completed = 0;
	let failed = 0;
	let pending = 0;
	for (const row of counts) {
		if (row.status === "completed") completed = row.n;
		else if (row.status === "failed") failed = row.n;
		else if (
			row.status === "queued" ||
			row.status === "dialing" ||
			row.status === "in-progress"
		) {
			pending += row.n;
		}
	}

	const isDone = pending === 0;
	await db
		.update(callBatches)
		.set({
			completedCount: completed,
			failedCount: failed,
			status: isDone ? "completed" : "running",
			finishedAt: isDone ? new Date() : null,
		})
		.where(eq(callBatches.id, batchId));
}

export async function listBatches(actor: JWTPayload) {
	return db
		.select()
		.from(callBatches)
		.where(eq(callBatches.userId, actor.sub))
		.orderBy(desc(callBatches.createdAt));
}

export async function getBatch(batchId: string, actor: JWTPayload) {
	const [batch] = await db
		.select()
		.from(callBatches)
		.where(and(eq(callBatches.id, batchId), eq(callBatches.userId, actor.sub)))
		.limit(1);
	if (!batch) throw new NotFoundError("Batch not found");

	const items = await db
		.select()
		.from(callQueueItems)
		.where(eq(callQueueItems.batchId, batchId))
		.orderBy(asc(callQueueItems.position));

	return {
		id: batch.id,
		agentId: batch.agentId,
		agentName: batch.agentName,
		status: batch.status,
		totalCount: batch.totalCount,
		completedCount: batch.completedCount,
		failedCount: batch.failedCount,
		startedAt: batch.startedAt,
		finishedAt: batch.finishedAt,
		createdAt: batch.createdAt,
		items: items.map((i) => ({
			id: i.id,
			position: i.position,
			leadName: i.leadName,
			phoneNumber: i.phoneNumber,
			status: i.status,
			durationSeconds: i.durationSeconds,
			sentimentLabel: i.sentimentLabel,
			sentimentScore: i.sentimentScore,
			summary: i.summary,
			recordingUrl: i.recordingUrl,
			error: i.error,
			startedAt: i.startedAt,
			endedAt: i.endedAt,
		})),
	};
}
