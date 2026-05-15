import { GoogleGenAI } from "@google/genai";
import { eq } from "drizzle-orm";
import { db } from "../../config/db";
import { env } from "../../config/env";
import { ragKnowledge } from "../../db/schema";
import { logger } from "../utils/logger";

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
	if (_client) return _client;
	if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
	_client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
	return _client;
}

export async function embedText(text: string): Promise<number[]> {
	const res = await client().models.embedContent({
		model: env.GEMINI_EMBEDDING_MODEL,
		contents: text,
	});
	const values = res.embeddings?.[0]?.values;
	if (!values || values.length === 0) {
		throw new Error("Embedding returned empty vector");
	}
	return values;
}

function cosine(a: number[], b: number[]): number {
	const n = Math.min(a.length, b.length);
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < n; i += 1) {
		const ai = a[i] ?? 0;
		const bi = b[i] ?? 0;
		dot += ai * bi;
		na += ai * ai;
		nb += bi * bi;
	}
	const denom = Math.sqrt(na) * Math.sqrt(nb);
	return denom === 0 ? 0 : dot / denom;
}

/**
 * Retrieve the top-k knowledge chunks for an agent, ranked by cosine similarity
 * to the query embedding. If no query is given, returns the most-recent k.
 * Returns a single concatenated context string ready to append to a system prompt.
 */
export async function retrieveKnowledge(
	agentId: string,
	query?: string,
	limit = 5,
): Promise<string> {
	const rows = await db
		.select()
		.from(ragKnowledge)
		.where(eq(ragKnowledge.agentId, agentId));

	if (rows.length === 0) return "";

	let ranked = rows;
	if (query && env.GEMINI_API_KEY) {
		try {
			const queryVec = await embedText(query);
			ranked = rows
				.map((row) => {
					const emb = Array.isArray(row.embedding)
						? (row.embedding as number[])
						: [];
					return { row, score: cosine(queryVec, emb) };
				})
				.sort((a, b) => b.score - a.score)
				.slice(0, limit)
				.map((x) => x.row);
		} catch (err) {
			logger.warn(
				"[rag] embedding-based ranking failed; falling back to recent",
				{
					error: err instanceof Error ? err.message : String(err),
				},
			);
			ranked = rows.slice(0, limit);
		}
	} else {
		ranked = rows.slice(0, limit);
	}

	return ranked
		.map((r, i) => `[${i + 1}] ${r.fileName ?? "knowledge"}: ${r.content}`)
		.join("\n\n");
}
