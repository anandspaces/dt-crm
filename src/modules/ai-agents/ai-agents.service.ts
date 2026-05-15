import { and, desc, eq } from "drizzle-orm";
import { db } from "../../config/db";
import { aiAgents, ragKnowledge } from "../../db/schema";
import { embedText } from "../../shared/services/rag";
import type { JWTPayload } from "../../shared/types/auth";
import { NotFoundError } from "../../shared/utils/errors";
import type {
	CreateAiAgentInput,
	UpdateAiAgentInput,
	UploadRagInput,
} from "./ai-agents.schema";

export async function listAgents(actor: JWTPayload) {
	return db
		.select()
		.from(aiAgents)
		.where(eq(aiAgents.userId, actor.sub))
		.orderBy(desc(aiAgents.createdAt));
}

export async function getAgent(id: string, actor: JWTPayload) {
	const [row] = await db
		.select()
		.from(aiAgents)
		.where(and(eq(aiAgents.id, id), eq(aiAgents.userId, actor.sub)))
		.limit(1);
	if (!row) throw new NotFoundError("Agent not found");
	return row;
}

export async function createAgent(
	input: CreateAiAgentInput,
	actor: JWTPayload,
) {
	const [row] = await db
		.insert(aiAgents)
		.values({
			userId: actor.sub,
			name: input.name,
			voice: input.voice ?? "Puck",
			systemInstruction: input.systemInstruction,
		})
		.returning();
	if (!row) throw new Error("Failed to create agent");
	return row;
}

export async function updateAgent(
	id: string,
	input: UpdateAiAgentInput,
	actor: JWTPayload,
) {
	await getAgent(id, actor);
	const [row] = await db
		.update(aiAgents)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(aiAgents.id, id))
		.returning();
	if (!row) throw new Error("Failed to update agent");
	return row;
}

export async function deleteAgent(id: string, actor: JWTPayload) {
	await getAgent(id, actor);
	await db.delete(aiAgents).where(eq(aiAgents.id, id));
}

export async function uploadKnowledge(
	agentId: string,
	input: UploadRagInput,
	actor: JWTPayload,
) {
	await getAgent(agentId, actor);

	// Server-side embedding fallback for chunks that didn't ship one.
	const values: (typeof ragKnowledge.$inferInsert)[] = [];
	for (const chunk of input.chunks) {
		let embedding = chunk.embedding;
		if (!embedding || embedding.length === 0) {
			try {
				embedding = await embedText(chunk.content);
			} catch {
				embedding = undefined;
			}
		}
		values.push({
			userId: actor.sub,
			agentId,
			fileName: chunk.fileName,
			content: chunk.content,
			imageUrl: chunk.imageUrl,
			pageNumber: chunk.pageNumber,
			embedding,
		});
	}

	const rows = await db.insert(ragKnowledge).values(values).returning();
	return { inserted: rows.length };
}

export async function clearKnowledge(agentId: string, actor: JWTPayload) {
	await getAgent(agentId, actor);
	await db.delete(ragKnowledge).where(eq(ragKnowledge.agentId, agentId));
}
