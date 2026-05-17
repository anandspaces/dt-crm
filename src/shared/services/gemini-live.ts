import { GoogleGenAI, Modality } from "@google/genai";
import { env } from "../../config/env";
import {
	bufferToPCM16,
	chunkBuffer,
	muLawToPCM16,
	pcm16ToBuffer,
	pcm16ToMuLaw,
	resamplePCM16,
} from "../utils/audio-codec";
import { logger } from "../utils/logger";

export type TranscriptRole = "user" | "agent";

export interface TranscriptEntry {
	role: TranscriptRole;
	text: string;
	timestamp: string;
}

export interface GeminiLiveCallbacks {
	onTranscript: (role: TranscriptRole, text: string) => void;
	/** Receives a muLaw/8 kHz buffer ready to ship to Vobiz as base64. */
	onAudioChunk: (mulaw: Buffer) => void;
	onInterrupted: () => void;
	onError?: (err: unknown) => void;
	onClose?: () => void;
}

export interface GeminiLiveSession {
	sendAudio: (mulawBuf: Buffer) => void;
	close: () => Promise<void>;
}

interface LiveServerMessage {
	serverContent?: {
		interrupted?: boolean;
		inputTranscription?: { text?: string };
		outputTranscription?: { text?: string };
		modelTurn?: {
			parts?: Array<{
				inlineData?: { mimeType?: string; data?: string };
			}>;
		};
	};
}

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
	if (_client) return _client;
	if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
	_client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
	return _client;
}

/** Convert Gemini Live's PCM16/24 kHz output to Vobiz-shaped muLaw/8 kHz chunks. */
function geminiPcmToVobizMuLaw(base64Pcm: string): Buffer {
	const buf = Buffer.from(base64Pcm, "base64");
	const pcm24 = bufferToPCM16(buf);
	const pcm8 = resamplePCM16(pcm24, 24000, 8000);
	return pcm16ToMuLaw(pcm8);
}

/** Convert Vobiz muLaw/8 kHz input to base64 PCM16/16 kHz for Gemini Live. */
function vobizMuLawToGeminiPcm(mulawBuf: Buffer): string {
	const pcm8 = muLawToPCM16(mulawBuf);
	const pcm16 = resamplePCM16(pcm8, 8000, 16000);
	return pcm16ToBuffer(pcm16).toString("base64");
}

export async function createGeminiLiveSession(
	systemInstruction: string,
	voiceName: string,
	callbacks: GeminiLiveCallbacks,
): Promise<GeminiLiveSession> {
	if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

	const handleMessage = (msg: LiveServerMessage): void => {
		const sc = msg.serverContent;
		if (!sc) return;

		if (sc.interrupted) {
			callbacks.onInterrupted();
		}
		if (sc.inputTranscription?.text) {
			callbacks.onTranscript("user", sc.inputTranscription.text);
		}
		if (sc.outputTranscription?.text) {
			callbacks.onTranscript("agent", sc.outputTranscription.text);
		}
		const parts = sc.modelTurn?.parts;
		if (parts) {
			for (const part of parts) {
				const data = part.inlineData?.data;
				const mime = part.inlineData?.mimeType ?? "";
				if (data && mime.startsWith("audio/")) {
					try {
						const mulaw = geminiPcmToVobizMuLaw(data);
						// Vobiz expects ~20 ms muLaw frames = 160 bytes @ 8 kHz.
						for (const chunk of chunkBuffer(mulaw, 160)) {
							callbacks.onAudioChunk(chunk);
						}
					} catch (err) {
						logger.error("[gemini-live] failed to convert output audio", {
							error: err instanceof Error ? err.message : String(err),
						});
					}
				}
			}
		}
	};

	const session = await client().live.connect({
		model: env.GEMINI_LIVE_MODEL,
		config: {
			responseModalities: [Modality.AUDIO],
			inputAudioTranscription: {},
			outputAudioTranscription: {},
			speechConfig: {
				voiceConfig: {
					prebuiltVoiceConfig: {
						voiceName: voiceName || env.GEMINI_VOICE_NAME,
					},
				},
			},
			systemInstruction,
		},
		callbacks: {
			onopen: () =>
				logger.info("[gemini-live] session open", {
					model: env.GEMINI_LIVE_MODEL,
					voice: voiceName,
				}),
			onmessage: handleMessage,
			onerror: (e: unknown) => {
				logger.error("[gemini-live] error", {
					error: e instanceof Error ? e.message : JSON.stringify(e),
				});
				callbacks.onError?.(e);
			},
			onclose: (e: unknown) => {
				// Capture close code/reason — when Gemini rejects a model name or
				// auth fails, it closes without firing onerror and we'd otherwise
				// lose the diagnostic. The shape varies by SDK version, so JSON-
				// stringify defensively.
				logger.warn("[gemini-live] session closed", {
					detail:
						e instanceof Error ? e.message : JSON.stringify(e, null, 0),
				});
				callbacks.onClose?.();
			},
		},
	});

	return {
		sendAudio(mulawBuf: Buffer) {
			const data = vobizMuLawToGeminiPcm(mulawBuf);
			session.sendRealtimeInput({
				audio: { data, mimeType: "audio/pcm;rate=16000" },
			});
		},
		async close() {
			try {
				await session.close();
			} catch (err) {
				logger.warn("[gemini-live] close error (ignored)", {
					error: err instanceof Error ? err.message : String(err),
				});
			}
		},
	};
}
