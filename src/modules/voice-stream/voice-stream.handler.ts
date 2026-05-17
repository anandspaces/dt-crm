import type { IncomingMessage } from "node:http";
import { eq } from "drizzle-orm";
import type { WebSocket } from "ws";
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
import {
	appendCallTranscript,
	ensureCallArtifactDir,
} from "../../shared/utils/storage";

export interface VoiceStreamData {
	batchId: string;
	itemId: string;
	userId: string;
	callUuid: string;
	streamId: string;
	transcript: TranscriptEntry[];
	liveSession: GeminiLiveSession | null;
	closing: boolean;
	/** Storage key for this call's artifact folder (e.g. `calls/<batchId>/<itemId>`).
	 *  Empty string until the WS session opens. */
	artifactKey: string;
}

async function appendTranscriptLine(
	batchId: string,
	itemId: string,
	role: TranscriptRole,
	text: string,
): Promise<void> {
	try {
		await appendCallTranscript(
			batchId,
			itemId,
			`[${new Date().toISOString()}] ${role}: ${text}`,
		);
	} catch (err) {
		logger.warn("[voice-stream] failed to append transcript line", {
			error: err instanceof Error ? err.message : String(err),
		});
	}
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

/** Per-connection state, keyed by the underlying WebSocket. */
const sessions = new Map<WebSocket, VoiceStreamData>();

export function parseVoiceStreamRequest(
	request: IncomingMessage,
): VoiceStreamData | null {
	const url = new URL(request.url ?? "/", "http://localhost");
	const data: VoiceStreamData = {
		batchId: url.searchParams.get("batchId") ?? "",
		itemId: url.searchParams.get("itemId") ?? "",
		userId: url.searchParams.get("userId") ?? "",
		callUuid: url.searchParams.get("callUuid") ?? "",
		streamId: "",
		transcript: [],
		liveSession: null,
		closing: false,
		artifactKey: "",
	};
	if (!data.batchId || !data.itemId) return null;
	return data;
}

export function attachVoiceStreamHandlers(
	ws: WebSocket,
	request: IncomingMessage,
): void {
	const data = parseVoiceStreamRequest(request);
	if (!data) {
		ws.close(1008, "missing batchId/itemId");
		return;
	}
	sessions.set(ws, data);

	void openSession(ws, data);

	ws.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
		handleMessage(ws, data, raw);
	});

	ws.on("close", () => {
		void closeSession(ws, data);
	});

	ws.on("error", (err: Error) => {
		logger.error("[voice-stream] ws error", {
			itemId: data.itemId,
			error: err.message,
		});
	});
}

async function openSession(
	ws: WebSocket,
	data: VoiceStreamData,
): Promise<void> {
	const { batchId, itemId } = data;
	logger.info("[voice-stream] open", { batchId, itemId });

	// Ensure the artifact dir exists; persist the storage key on the queue item
	// so recovery / analysis can find the folder later (host- and backend-agnostic).
	try {
		const key = await ensureCallArtifactDir(batchId, itemId);
		data.artifactKey = key;
		await db
			.update(callQueueItems)
			.set({ artifactKey: key, updatedAt: new Date() })
			.where(eq(callQueueItems.id, itemId));
	} catch (err) {
		logger.warn("[voice-stream] failed to ensure artifact dir", {
			error: err instanceof Error ? err.message : String(err),
		});
	}

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

		// Throttle DB writes — flush transcript every ~1.5s rather than per token.
		let lastFlush = 0;
		const FLUSH_INTERVAL_MS = 1500;
		const maybeFlush = () => {
			const now = Date.now();
			if (now - lastFlush < FLUSH_INTERVAL_MS) return;
			lastFlush = now;
			void persistTranscript(itemId, [...data.transcript]).catch((err) => {
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
					data.transcript.push({
						role,
						text,
						timestamp: new Date().toISOString(),
					});
					if (data.artifactKey) {
						void appendTranscriptLine(batchId, itemId, role, text);
					}
					maybeFlush();
				},
				onAudioChunk: (mulaw: Buffer) => {
					if (data.closing || ws.readyState !== 1) return;
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
					if (data.closing || ws.readyState !== 1) return;
					ws.send(
						JSON.stringify({ event: "clearAudio", streamId: data.streamId }),
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

		data.liveSession = session;
	} catch (err) {
		logger.error("[voice-stream] failed to open gemini session", {
			itemId,
			error: err instanceof Error ? err.message : String(err),
		});
		ws.close(1011, "session_init_failed");
	}
}

function handleMessage(
	ws: WebSocket,
	data: VoiceStreamData,
	raw: Buffer | ArrayBuffer | Buffer[],
): void {
	let msg: Record<string, unknown>;
	try {
		const text = Array.isArray(raw)
			? Buffer.concat(raw).toString("utf8")
			: raw instanceof ArrayBuffer
				? Buffer.from(raw).toString("utf8")
				: raw.toString("utf8");
		msg = JSON.parse(text);
	} catch {
		return;
	}

	const event = typeof msg.event === "string" ? msg.event : "";

	if (event === "start") {
		const start = msg.start as Record<string, unknown> | undefined;
		data.streamId =
			(typeof msg.streamId === "string" && msg.streamId) ||
			(typeof start?.streamSid === "string" && start.streamSid) ||
			"";
		return;
	}

	if (event === "media" && data.liveSession) {
		const media = msg.media as Record<string, unknown> | undefined;
		const payload = typeof media?.payload === "string" ? media.payload : "";
		if (payload.length === 0) return;
		try {
			const mulaw = Buffer.from(payload, "base64");
			data.liveSession.sendAudio(mulaw);
		} catch (err) {
			logger.warn("[voice-stream] failed to forward media", {
				error: err instanceof Error ? err.message : String(err),
			});
		}
		return;
	}

	if (event === "stop") {
		void closeSession(ws, data);
	}
}

async function closeSession(
	ws: WebSocket,
	data: VoiceStreamData,
): Promise<void> {
	if (data.closing) return;
	data.closing = true;
	sessions.delete(ws);

	if (data.transcript.length > 0) {
		try {
			await persistTranscript(data.itemId, data.transcript);
		} catch (err) {
			logger.warn("[voice-stream] final transcript flush failed", {
				itemId: data.itemId,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	if (data.liveSession) {
		try {
			await data.liveSession.close();
		} catch {
			// already logged inside gemini-live
		}
		data.liveSession = null;
	}
}

// ─── Test exports (preserve previous shape for unit tests) ──────────────────
// These are kept so tests/unit/voice-stream-msg.test.ts continues to work
// without needing a real ws instance. The handler accepts any object with
// `data: VoiceStreamData`, `send()` and `close()`.

export interface VoiceStreamWsLike {
	data: VoiceStreamData;
	readyState?: number;
	send: (raw: string) => void;
	close: (code?: number, reason?: string) => void;
}

export function handleVoiceStreamMessage(
	ws: VoiceStreamWsLike,
	raw: string | Buffer,
): void {
	const buf =
		typeof raw === "string" ? Buffer.from(raw, "utf8") : (raw as Buffer);
	handleMessage(ws as unknown as WebSocket, ws.data, buf);
}
