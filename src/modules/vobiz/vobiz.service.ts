import { mkdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../../config/db";
import { env } from "../../config/env";
import { callQueueItems, leadCalls, leads } from "../../db/schema";
import { analyzeCallTranscript } from "../../shared/services/gemini-text";
import { startVobizRecording } from "../../shared/services/vobiz.client";
import { logger } from "../../shared/utils/logger";
import {
	refreshBatchCounts,
	startNextQueuedCall,
} from "../call-batches/call-batches.service";

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export function buildStreamXml(
	wsUrl: string,
	statusCallbackUrl: string,
): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" statusCallbackUrl="${escapeXml(statusCallbackUrl)}" statusCallbackMethod="POST">${escapeXml(wsUrl)}</Stream>
</Response>`;
}

interface AnswerContext {
	batchId: string;
	itemId: string;
	userId: string;
	callUuid: string;
}

/**
 * Vobiz calls this when the lead picks up. We must respond with the <Stream>
 * XML quickly (under ~3s) — recording start is fire-and-forget.
 */
export async function handleVobizAnswer(ctx: AnswerContext): Promise<string> {
	await db
		.update(callQueueItems)
		.set({
			status: "in-progress",
			vobizCallUuid: ctx.callUuid,
			updatedAt: new Date(),
		})
		.where(eq(callQueueItems.id, ctx.itemId));

	// Optimistically mark the lead_calls row as connected.
	await db
		.update(leadCalls)
		.set({ outcome: "connected", vobizCallUuid: ctx.callUuid })
		.where(eq(leadCalls.queueItemId, ctx.itemId));

	const base = (env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
	const wsBase = base.replace(
		/^https?:/,
		base.startsWith("https") ? "wss:" : "ws:",
	);
	const wsPort = env.WS_PORT ? `:${env.WS_PORT}` : "";
	const wsHost = wsBase.replace(/^(wss?:\/\/[^/]+)\/?.*$/, "$1");
	const wsUrl = `${wsHost}${wsPort}/voice-stream?batchId=${ctx.batchId}&itemId=${ctx.itemId}&userId=${ctx.userId}&callUuid=${ctx.callUuid}`;
	const statusUrl = `${base}/api/v1/vobiz/stream-status?itemId=${ctx.itemId}`;

	// Fire-and-forget recording start. Failure is logged but doesn't break the call.
	if (ctx.callUuid) {
		const recordingUrl = `${base}/api/v1/vobiz/recording-complete?itemId=${ctx.itemId}&batchId=${ctx.batchId}`;
		const transcriptUrl = `${base}/api/v1/vobiz/recording-transcription?itemId=${ctx.itemId}`;
		void startVobizRecording(ctx.callUuid, recordingUrl, transcriptUrl).catch(
			(err) => {
				logger.warn("[vobiz] startRecording failed (ignored)", {
					callUuid: ctx.callUuid,
					error: err instanceof Error ? err.message : String(err),
				});
			},
		);
	}

	return buildStreamXml(wsUrl, statusUrl);
}

interface HangupContext {
	batchId: string;
	itemId: string;
	userId: string;
	callUuid?: string;
	callStatus?: string;
	durationSeconds?: number;
	hangupCause?: string;
}

export async function handleVobizHangup(ctx: HangupContext): Promise<void> {
	// Vobiz emits CallStatus values like "completed", "answered", "in-progress"
	// for successful calls and "failed", "no-answer", "busy", "cancel" otherwise.
	const raw = (ctx.callStatus ?? "").toLowerCase();
	const finalStatus: "completed" | "failed" =
		raw === "completed" || raw === "answered" || raw === "in-progress"
			? "completed"
			: "failed";

	const [item] = await db
		.select()
		.from(callQueueItems)
		.where(eq(callQueueItems.id, ctx.itemId))
		.limit(1);
	if (!item) {
		logger.warn("[vobiz] hangup for unknown item", { itemId: ctx.itemId });
		return;
	}

	await db
		.update(callQueueItems)
		.set({
			status: finalStatus,
			durationSeconds: ctx.durationSeconds ?? item.durationSeconds ?? null,
			endedAt: new Date(),
			vobizCallUuid: ctx.callUuid ?? item.vobizCallUuid,
			error: finalStatus === "failed" ? (ctx.hangupCause ?? null) : null,
			updatedAt: new Date(),
		})
		.where(eq(callQueueItems.id, ctx.itemId));

	// Run post-call analysis if we have a transcript.
	if (item.transcriptText && item.transcriptText.length > 0) {
		try {
			const analysis = await analyzeCallTranscript(
				item.transcriptText,
				item.leadName ?? undefined,
			);
			await db
				.update(callQueueItems)
				.set({
					summary: analysis.summary,
					sentimentLabel: analysis.sentimentLabel,
					sentimentScore: analysis.sentimentScore,
					updatedAt: new Date(),
				})
				.where(eq(callQueueItems.id, ctx.itemId));

			if (item.callDocumentId) {
				await db
					.update(leadCalls)
					.set({
						outcome: finalStatus === "completed" ? "connected" : "missed",
						durationSeconds: ctx.durationSeconds ?? 0,
						aiSummaryJson: analysis,
						sentimentLabel: analysis.sentimentLabel,
						sentimentScore: analysis.sentimentScore,
					})
					.where(eq(leadCalls.id, item.callDocumentId));
			}
			if (item.leadId && finalStatus === "completed") {
				await db
					.update(leads)
					.set({ lastContactedAt: new Date() })
					.where(eq(leads.id, item.leadId));
			}
		} catch (err) {
			logger.error("[vobiz] post-call analysis failed", {
				itemId: ctx.itemId,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	} else if (item.callDocumentId) {
		await db
			.update(leadCalls)
			.set({
				outcome: finalStatus === "completed" ? "connected" : "missed",
				durationSeconds: ctx.durationSeconds ?? 0,
			})
			.where(eq(leadCalls.id, item.callDocumentId));
	}

	await refreshBatchCounts(ctx.batchId);

	// Kick off the next call in the batch.
	void startNextQueuedCall(ctx.batchId).catch((err) => {
		logger.error("[vobiz] startNextQueuedCall failed after hangup", {
			batchId: ctx.batchId,
			error: err instanceof Error ? err.message : String(err),
		});
	});
}

interface RecordingContext {
	batchId: string;
	itemId: string;
	recordingId?: string;
	recordUrl?: string;
}

export async function handleRecordingComplete(
	ctx: RecordingContext,
): Promise<void> {
	if (!ctx.recordUrl) {
		logger.warn("[vobiz] recording-complete called without record_url", {
			ctx,
		});
		return;
	}

	let localUrl: string | undefined;
	try {
		const targetDir = path.join(env.ARTIFACTS_DIR, ctx.batchId, ctx.itemId);
		await mkdir(targetDir, { recursive: true });
		const fileName = `recording.${env.VOBIZ_RECORDING_FORMAT}`;
		const target = path.join(targetDir, fileName);

		const res = await fetch(ctx.recordUrl);
		if (res.ok) {
			const ab = await res.arrayBuffer();
			await Bun.write(target, ab);
			localUrl = `/recordings/${ctx.batchId}/${ctx.itemId}/${fileName}`;
		} else {
			logger.warn("[vobiz] recording fetch failed", {
				status: res.status,
				url: ctx.recordUrl,
			});
		}
	} catch (err) {
		logger.error("[vobiz] failed to download recording", {
			error: err instanceof Error ? err.message : String(err),
		});
	}

	const updates: Partial<typeof callQueueItems.$inferInsert> = {
		recordingId: ctx.recordingId,
		recordingUrl: localUrl ?? ctx.recordUrl,
		updatedAt: new Date(),
	};
	await db
		.update(callQueueItems)
		.set(updates)
		.where(eq(callQueueItems.id, ctx.itemId));

	const [item] = await db
		.select({ callDocumentId: callQueueItems.callDocumentId })
		.from(callQueueItems)
		.where(eq(callQueueItems.id, ctx.itemId))
		.limit(1);
	if (item?.callDocumentId) {
		await db
			.update(leadCalls)
			.set({ recordingUrl: localUrl ?? ctx.recordUrl })
			.where(eq(leadCalls.id, item.callDocumentId));
	}
}

export async function appendVobizTranscript(
	itemId: string,
	transcription: string,
): Promise<void> {
	if (!transcription || transcription.length === 0) return;
	const [item] = await db
		.select({ existing: callQueueItems.transcriptText })
		.from(callQueueItems)
		.where(eq(callQueueItems.id, itemId))
		.limit(1);
	const joined = [item?.existing, transcription].filter(Boolean).join("\n");
	await db
		.update(callQueueItems)
		.set({ transcriptText: joined, updatedAt: new Date() })
		.where(eq(callQueueItems.id, itemId));
}
