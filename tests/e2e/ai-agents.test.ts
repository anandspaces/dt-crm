import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { aiAgents, ragKnowledge } from "../../src/db/schema";
import { api, makeToken } from "../helpers";
import { createUser, testDb, truncateAll } from "../setup";

describe("AI Agents API", () => {
	let salesToken: string;
	let salesId: string;
	let otherToken: string;
	let createdAgentId: string;

	beforeAll(async () => {
		await truncateAll();
		const sales = await createUser({
			role: "SALES",
			email: "sales@aiagents.local",
		});
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });

		const other = await createUser({
			role: "SALES",
			email: "other@aiagents.local",
		});
		otherToken = makeToken("SALES", { sub: other.id, email: other.email });
	});

	afterAll(truncateAll);

	describe("POST /ai-agents", () => {
		it("rejects unauthenticated requests (401)", async () => {
			const res = await api.post("/api/v1/ai-agents", { name: "x" });
			expect(res.status).toBe(401);
		});

		it("rejects an empty name (400)", async () => {
			const res = await api.post(
				"/api/v1/ai-agents",
				{ name: "" },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("creates an agent with defaults", async () => {
			const res = await api.post(
				"/api/v1/ai-agents",
				{
					name: "Outbound Sales Agent",
					systemInstruction: "You are friendly and concise.",
				},
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.name).toBe("Outbound Sales Agent");
			expect(res.body.data.voice).toBe("Puck");
			expect(res.body.data.isActive).toBe(true);
			expect(res.body.data.userId).toBe(salesId);
			createdAgentId = res.body.data.id;
		});

		it("creates an agent with a custom voice", async () => {
			const res = await api.post(
				"/api/v1/ai-agents",
				{ name: "Charon Agent", voice: "Charon" },
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.voice).toBe("Charon");
		});
	});

	describe("GET /ai-agents", () => {
		it("lists only the caller's agents", async () => {
			const res = await api.get("/api/v1/ai-agents", salesToken);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.agents)).toBe(true);
			expect(res.body.data.agents.length).toBe(2);
			for (const a of res.body.data.agents) {
				expect(a.userId).toBe(salesId);
			}
		});

		it("returns an empty list for a different user", async () => {
			const res = await api.get("/api/v1/ai-agents", otherToken);
			expect(res.status).toBe(200);
			expect(res.body.data.agents).toEqual([]);
		});
	});

	describe("GET /ai-agents/:id", () => {
		it("returns 404 for an agent owned by another user", async () => {
			const res = await api.get(
				`/api/v1/ai-agents/${createdAgentId}`,
				otherToken,
			);
			expect(res.status).toBe(404);
		});

		it("returns the agent for its owner", async () => {
			const res = await api.get(
				`/api/v1/ai-agents/${createdAgentId}`,
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.id).toBe(createdAgentId);
		});
	});

	describe("PATCH /ai-agents/:id", () => {
		it("updates name and voice", async () => {
			const res = await api.patch(
				`/api/v1/ai-agents/${createdAgentId}`,
				{ name: "Renamed Agent", voice: "Kore" },
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.name).toBe("Renamed Agent");
			expect(res.body.data.voice).toBe("Kore");
		});

		it("rejects updates from a different user (404)", async () => {
			const res = await api.patch(
				`/api/v1/ai-agents/${createdAgentId}`,
				{ name: "Hijack" },
				otherToken,
			);
			expect(res.status).toBe(404);
		});
	});

	describe("POST /ai-agents/:id/rag", () => {
		it("uploads knowledge chunks", async () => {
			const res = await api.post(
				`/api/v1/ai-agents/${createdAgentId}/rag`,
				{
					chunks: [
						{
							content: "Our flagship product is the Dextora CRM.",
							fileName: "product-brief.pdf",
							pageNumber: 1,
							// Provide an embedding so the service does not call Gemini.
							embedding: [0.1, 0.2, 0.3, 0.4],
						},
						{
							content: "Pricing starts at ₹999/month.",
							fileName: "pricing.pdf",
							pageNumber: 2,
							embedding: [0.5, 0.4, 0.3, 0.2],
						},
					],
				},
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.inserted).toBe(2);

			const rows = await testDb
				.select()
				.from(ragKnowledge)
				.where(eq(ragKnowledge.agentId, createdAgentId));
			expect(rows.length).toBe(2);
		});

		it("rejects an empty chunks array (400)", async () => {
			const res = await api.post(
				`/api/v1/ai-agents/${createdAgentId}/rag`,
				{ chunks: [] },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("rejects upload to another user's agent (404)", async () => {
			const res = await api.post(
				`/api/v1/ai-agents/${createdAgentId}/rag`,
				{ chunks: [{ content: "x", embedding: [0.1] }] },
				otherToken,
			);
			expect(res.status).toBe(404);
		});
	});

	describe("DELETE /ai-agents/:id/rag", () => {
		it("clears the knowledge base", async () => {
			const res = await api.delete(
				`/api/v1/ai-agents/${createdAgentId}/rag`,
				salesToken,
			);
			expect(res.status).toBe(200);

			const rows = await testDb
				.select()
				.from(ragKnowledge)
				.where(eq(ragKnowledge.agentId, createdAgentId));
			expect(rows.length).toBe(0);
		});
	});

	describe("DELETE /ai-agents/:id", () => {
		it("rejects delete from a different user (404)", async () => {
			const res = await api.delete(
				`/api/v1/ai-agents/${createdAgentId}`,
				otherToken,
			);
			expect(res.status).toBe(404);
		});

		it("deletes the agent for its owner", async () => {
			const res = await api.delete(
				`/api/v1/ai-agents/${createdAgentId}`,
				salesToken,
			);
			expect(res.status).toBe(200);

			const rows = await testDb
				.select()
				.from(aiAgents)
				.where(eq(aiAgents.id, createdAgentId));
			expect(rows.length).toBe(0);
		});
	});
});
