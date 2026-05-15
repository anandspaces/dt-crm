import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env";
import { logger } from "../utils/logger";

export interface CallAnalysis {
	summary: string;
	sentimentLabel: "positive" | "neutral" | "negative";
	sentimentScore: number;
	engagement: number;
	clarity: number;
	resolution: number;
	confidence: number;
	leadScore: number;
}

const ANALYSIS_PROMPT = `You analyze a sales-call transcript between an AI calling agent and a lead.
Return STRICT JSON only — no prose, no markdown — with this exact shape:

{
  "summary": string,                         // 1-2 sentences
  "sentimentLabel": "positive"|"neutral"|"negative",
  "sentimentScore": number,                  // -1.0 to 1.0
  "engagement": number,                      // 0-100
  "clarity": number,                         // 0-100
  "resolution": number,                      // 0-100
  "confidence": number,                      // 0-100, your confidence in this analysis
  "leadScore": number                        // 0-100, qualification heuristic
}

If the transcript is empty or trivial, return zeros and neutral sentiment.`;

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
	if (_client) return _client;
	if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
	_client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
	return _client;
}

const ZERO_ANALYSIS: CallAnalysis = {
	summary: "No transcript captured.",
	sentimentLabel: "neutral",
	sentimentScore: 0,
	engagement: 0,
	clarity: 0,
	resolution: 0,
	confidence: 0,
	leadScore: 0,
};

function parseAnalysis(raw: string): CallAnalysis | null {
	// Strip ```json fences if Gemini decides to add them despite instructions.
	const cleaned = raw
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/```\s*$/i, "")
		.trim();
	try {
		const obj = JSON.parse(cleaned) as Partial<CallAnalysis>;
		if (typeof obj.summary !== "string") return null;
		return {
			summary: obj.summary,
			sentimentLabel:
				obj.sentimentLabel === "positive" || obj.sentimentLabel === "negative"
					? obj.sentimentLabel
					: "neutral",
			sentimentScore: Number(obj.sentimentScore ?? 0),
			engagement: Number(obj.engagement ?? 0),
			clarity: Number(obj.clarity ?? 0),
			resolution: Number(obj.resolution ?? 0),
			confidence: Number(obj.confidence ?? 0),
			leadScore: Number(obj.leadScore ?? 0),
		};
	} catch {
		return null;
	}
}

export async function analyzeCallTranscript(
	transcriptText: string,
	leadName?: string,
): Promise<CallAnalysis> {
	if (!transcriptText || transcriptText.trim().length === 0) {
		return ZERO_ANALYSIS;
	}
	if (!env.GEMINI_API_KEY) {
		logger.warn(
			"[gemini-text] GEMINI_API_KEY missing — returning zero analysis",
		);
		return ZERO_ANALYSIS;
	}

	try {
		const response = await client().models.generateContent({
			model: env.GEMINI_MODEL,
			contents: [
				{
					role: "user",
					parts: [
						{
							text: `${ANALYSIS_PROMPT}\n\nLead: ${leadName ?? "unknown"}\n\nTranscript:\n${transcriptText}`,
						},
					],
				},
			],
			config: {
				responseMimeType: "application/json",
				temperature: 0.2,
			},
		});

		const text = response.text ?? "";
		const parsed = parseAnalysis(text);
		if (!parsed) {
			logger.warn("[gemini-text] could not parse analysis JSON", { text });
			return { ...ZERO_ANALYSIS, summary: "Analysis parse failed." };
		}
		return parsed;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error("[gemini-text] analysis failed", { error: msg });
		return { ...ZERO_ANALYSIS, summary: "Analysis failed." };
	}
}
