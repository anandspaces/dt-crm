import type { ServerWebSocket } from "bun";
import { eq } from "drizzle-orm";
import { db } from "../../config/db";
import { env } from "../../config/env";
import {
	aiAgents,
	callBatches,
	callQueueItems,
	leadCalls,
} from "../../db/schema";
import {
	createGeminiLiveSession,
	type GeminiLiveSession,
	type TranscriptEntry,
	type TranscriptRole,
} from "../../shared/services/gemini-live";
import { retrieveKnowledge } from "../../shared/services/rag";
import { logger } from "../../shared/utils/logger";

export interface VoiceStreamData {
	batchId: string;
	itemId: string;
	userId: string;
	callUuid: string;
	streamId: string;
	transcript: TranscriptEntry[];
	liveSession: GeminiLiveSession | null;
	closing: boolean;
}

const DEFAULT_SYSTEM_INSTRUCTION =
	"You are a friendly, concise outbound sales caller. Speak naturally, " +
	"listen actively, and confirm interest before continuing. If the lead is " +
	"not interested, politely thank them and end the call.";

async function loadAgentForBatch(batchId: string): Promise<{
	agentId: string | null;
	systemInstruction: string;
	voice: string;
}> {
	const [batch] = await db
		.select({ agentId: callBatches.agentId, agentName: callBatches.agentName })
		.from(callBatches)
		.where(eq(callBatches.id, batchId))
		.limit(1);
	if (!batch?.agentId) {
		return {
			agentId: null,
			systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
			voice: env.GEMINI_VOICE_NAME,
		};
	}

	const [agent] = await db
		.select()
		.from(aiAgents)
		.where(eq(aiAgents.id, batch.agentId))
		.limit(1);

	return {
		agentId: agent?.id ?? null,
		systemInstruction: agent?.systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION,
		voice: agent?.voice ?? env.GEMINI_VOICE_NAME,
	};
}

async function persistTranscript(
	itemId: string,
	transcript: TranscriptEntry[],
): Promise<void> {
	const text = transcript.map((t) => `[${t.role}] ${t.text}`).join("\n");
	await db
		.update(callQueueItems)
		.set({
			transcriptText: text,
			transcriptJson: transcript,
			updatedAt: new Date(),
		})
		.where(eq(callQueueItems.id, itemId));

	const [item] = await db
		.select({ callDocumentId: callQueueItems.callDocumentId })
		.from(callQueueItems)
		.where(eq(callQueueItems.id, itemId))
		.limit(1);
	if (item?.callDocumentId) {
		await db
			.update(leadCalls)
			.set({ transcriptJson: transcript })
			.where(eq(leadCalls.id, item.callDocumentId));
	}
}

export async function handleVoiceStreamOpen(
	ws: ServerWebSocket<VoiceStreamData>,
): Promise<void> {
	const { batchId, itemId } = ws.data;
	logger.info("[voice-stream] open", { batchId, itemId });

	try {
		const agentConfig = await loadAgentForBatch(batchId);
		const ragContext = agentConfig.agentId
			? await retrieveKnowledge(
					agentConfig.agentId,
					agentConfig.systemInstruction,
				).catch(() => "")
			: "";
		const systemInstruction =
			agentConfig.systemInstruction +
			(ragContext ? `\n\n### CONTEXT:\n${ragContext}` : "");

		// Throttle DB writes — flush transcript every ~1.5s rather than on every token.
		let lastFlush = 0;
		const FLUSH_INTERVAL_MS = 1500;
		const maybeFlush = () => {
			const now = Date.now();
			if (now - lastFlush < FLUSH_INTERVAL_MS) return;
			lastFlush = now;
			void persistTranscript(itemId, [...ws.data.transcript]).catch((err) => {
				logger.warn("[voice-stream] transcript flush failed", {
					itemId,
					error: err instanceof Error ? err.message : String(err),
				});
			});
		};

		const session = await createGeminiLiveSession(
			systemInstruction,
			agentConfig.voice,
			{
				onTranscript: (role: TranscriptRole, text: string) => {
					ws.data.transcript.push({
						role,
						text,
						timestamp: new Date().toISOString(),
					});
					maybeFlush();
				},
				onAudioChunk: (mulaw: Buffer) => {
					if (ws.data.closing) return;
					ws.send(
						JSON.stringify({
							event: "playAudio",
							media: {
								contentType: "audio/x-mulaw",
								sampleRate: 8000,
								payload: mulaw.toString("base64"),
							},
						}),
					);
				},
				onInterrupted: () => {
					if (ws.data.closing) return;
					ws.send(
						JSON.stringify({ event: "clearAudio", streamId: ws.data.streamId }),
					);
				},
				onError: (err) => {
					logger.error("[voice-stream] gemini error", {
						itemId,
						error: err instanceof Error ? err.message : String(err),
					});
				},
			},
		);

		ws.data.liveSession = session;
	} catch (err) {
		logger.error("[voice-stream] failed to open gemini session", {
			itemId,
			error: err instanceof Error ? err.message : String(err),
		});
		ws.close(1011, "session_init_failed");
	}
}

export function handleVoiceStreamMessage(
	ws: ServerWebSocket<VoiceStreamData>,
	raw: string | Buffer,
): void {
	let msg: Record<string, unknown>;
	try {
		msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
	} catch {
		return;
	}

	const event = typeof msg.event === "string" ? msg.event : "";

	if (event === "start") {
		const start = msg.start as Record<string, unknown> | undefined;
		ws.data.streamId =
			(typeof msg.streamId === "string" && msg.streamId) ||
			(typeof start?.streamSid === "string" && start.streamSid) ||
			"";
		return;
	}

	if (event === "media" && ws.data.liveSession) {
		const media = msg.media as Record<string, unknown> | undefined;
		const payload = typeof media?.payload === "string" ? media.payload : "";
		if (payload.length === 0) return;
		try {
			const mulaw = Buffer.from(payload, "base64");
			ws.data.liveSession.sendAudio(mulaw);
		} catch (err) {
			logger.warn("[voice-stream] failed to forward media", {
				error: err instanceof Error ? err.message : String(err),
			});
		}
		return;
	}

	if (event === "stop") {
		void closeSession(ws);
	}
}

export async function handleVoiceStreamClose(
	ws: ServerWebSocket<VoiceStreamData>,
): Promise<void> {
	await closeSession(ws);
}

async function closeSession(
	ws: ServerWebSocket<VoiceStreamData>,
): Promise<void> {
	if (ws.data.closing) return;
	ws.data.closing = true;

	if (ws.data.transcript.length > 0) {
		try {
			await persistTranscript(ws.data.itemId, ws.data.transcript);
		} catch (err) {
			logger.warn("[voice-stream] final transcript flush failed", {
				itemId: ws.data.itemId,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	if (ws.data.liveSession) {
		try {
			await ws.data.liveSession.close();
		} catch {
			// already logged inside gemini-live
		}
		ws.data.liveSession = null;
	}
}
