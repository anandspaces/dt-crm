import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	spyOn,
} from "bun:test";
import { eq } from "drizzle-orm";
import {
	aiAgents,
	callBatches,
	callQueueItems,
	leadCalls,
} from "../../src/db/schema";
import { api, makeToken } from "../helpers";
import { createLead, createUser, testDb, truncateAll } from "../setup";

// Vobiz fetch mock — swap globalThis.fetch so the API client returns a fake
// request_uuid instead of hitting the live Vobiz endpoint. Pass through any
// other fetches (Gemini is skipped because GEMINI_API_KEY is unset).
let fetchSpy: ReturnType<typeof spyOn>;
const VOBIZ_HOST = "api.vobiz.ai";
let vobizRequests: { url: string; body: unknown }[] = [];

function installFetchMock() {
	const originalFetch = globalThis.fetch.bind(globalThis);
	// biome-ignore lint/suspicious/noExplicitAny: Bun's fetch type carries extra
	// properties (preconnect) that the mock impl doesn't need.
	const impl = async (input: any, init?: any): Promise<Response> => {
		const url = typeof input === "string" ? input : String(input);
		if (url.includes(VOBIZ_HOST)) {
			let parsed: unknown = null;
			if (init?.body) {
				try {
					parsed = JSON.parse(String(init.body));
				} catch {
					parsed = init.body;
				}
			}
			vobizRequests.push({ url, body: parsed });
			return new Response(
				JSON.stringify({
					request_uuid: `req-${vobizRequests.length}`,
					message: "queued",
					api_id: "fake-api-id",
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
		return originalFetch(input, init);
	};
	// biome-ignore lint/suspicious/noExplicitAny: see above.
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(impl as any);
}

async function waitForVobizCall(timeoutMs = 2000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (vobizRequests.some((r) => r.url.endsWith("/Call/"))) return true;
		await new Promise((r) => setTimeout(r, 25));
	}
	return false;
}

describe("Call Batches API", () => {
	let salesToken: string;
	let salesId: string;
	let agentId: string;
	let leadAId: string;
	let leadBId: string;

	beforeAll(async () => {
		await truncateAll();
		installFetchMock();

		const sales = await createUser({
			role: "SALES",
			email: "sales@batches.local",
		});
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });

		const [agent] = await testDb
			.insert(aiAgents)
			.values({
				userId: salesId,
				name: "Batch Test Agent",
				voice: "Puck",
				systemInstruction: "Be brief.",
			})
			.returning();
		if (!agent) throw new Error("seed agent failed");
		agentId = agent.id;

		const leadA = await createLead({
			assignedUserId: salesId,
			firstName: "Lead",
			lastName: "Alpha",
			phone: "+91-99000-00001",
		});
		leadAId = leadA.id;
		const leadB = await createLead({
			assignedUserId: salesId,
			firstName: "Lead",
			lastName: "Beta",
			phone: "+91-99000-00002",
		});
		leadBId = leadB.id;
	});

	afterEach(() => {
		vobizRequests = [];
	});

	afterAll(async () => {
		fetchSpy?.mockRestore();
		await truncateAll();
	});

	describe("POST /call-batches/start", () => {
		it("rejects unauthenticated (401)", async () => {
			const res = await api.post("/api/v1/call-batches/start", {
				leads: [{ phone: "+91" }],
			});
			expect(res.status).toBe(401);
		});

		it("rejects empty leads (400)", async () => {
			const res = await api.post(
				"/api/v1/call-batches/start",
				{ leads: [] },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("rejects leads missing phone (400)", async () => {
			const res = await api.post(
				"/api/v1/call-batches/start",
				{ leads: [{ name: "no phone" }] },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("creates a batch and queues items", async () => {
			const res = await api.post(
				"/api/v1/call-batches/start",
				{
					leads: [
						{ leadId: leadAId, name: "Lead Alpha", phone: "+91-99000-00001" },
						{ leadId: leadBId, name: "Lead Beta", phone: "+91-99000-00002" },
					],
					agentId,
					agentName: "Batch Test Agent",
				},
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.total).toBe(2);
			expect(res.body.data.items.length).toBe(2);
			const batchId = res.body.data.batchId as string;

			// Verify batch row
			const [batch] = await testDb
				.select()
				.from(callBatches)
				.where(eq(callBatches.id, batchId));
			expect(batch).toBeDefined();
			expect(batch?.userId).toBe(salesId);
			expect(batch?.agentId).toBe(agentId);
			expect(batch?.totalCount).toBe(2);

			// Items should exist and be linked to leads
			const items = await testDb
				.select()
				.from(callQueueItems)
				.where(eq(callQueueItems.batchId, batchId));
			expect(items.length).toBe(2);
			const linkedLeadIds = items.map((i) => i.leadId).sort();
			expect(linkedLeadIds).toEqual([leadAId, leadBId].sort());

			// lead_calls rows should be pre-created for linked leads
			for (const itm of items) {
				const calls = await testDb
					.select()
					.from(leadCalls)
					.where(eq(leadCalls.queueItemId, itm.id));
				expect(calls.length).toBe(1);
				expect(calls[0]?.callerType).toBe("ai");
				expect(calls[0]?.batchId).toBe(batchId);
			}

			// The first position's call should hit Vobiz via the background task
			// kicked off after the response is sent. We poll the *captured fetch
			// requests* (in-memory) rather than the DB so the assertion is robust
			// against other test files truncating tables concurrently.
			const sawCall = await waitForVobizCall();
			expect(sawCall).toBe(true);
			const callPosts = vobizRequests.filter((r) => r.url.endsWith("/Call/"));
			expect(callPosts.length).toBeGreaterThanOrEqual(1);
			const body = callPosts[0]?.body as Record<string, unknown>;
			expect(body.from).toBeDefined();
			expect(body.to).toBe("+91-99000-00001");
			expect(String(body.answer_url)).toContain("/api/v1/vobiz/answer");
			expect(String(body.hangup_url)).toContain("/api/v1/vobiz/hangup");
		});

		it("rejects an agentId owned by a different user (404)", async () => {
			const other = await createUser({
				role: "SALES",
				email: "other-batch@test.local",
			});
			const otherToken = makeToken("SALES", {
				sub: other.id,
				email: other.email,
			});
			const res = await api.post(
				"/api/v1/call-batches/start",
				{
					leads: [{ phone: "+91-9999-99999" }],
					agentId, // belongs to salesId
				},
				otherToken,
			);
			expect(res.status).toBe(404);
		});

		it("works without leadId (ad-hoc number)", async () => {
			const res = await api.post(
				"/api/v1/call-batches/start",
				{
					leads: [{ name: "Walk-in", phone: "+91-9999-12345" }],
				},
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.total).toBe(1);

			const items = await testDb
				.select()
				.from(callQueueItems)
				.where(eq(callQueueItems.batchId, res.body.data.batchId));
			expect(items[0]?.leadId).toBeNull();

			// No lead_calls row should be created for items without a leadId.
			const calls = await testDb
				.select()
				.from(leadCalls)
				.where(eq(leadCalls.queueItemId, items[0]?.id ?? ""));
			expect(calls.length).toBe(0);
		});
	});

	describe("GET /call-batches", () => {
		it("returns only the caller's batches", async () => {
			const res = await api.get("/api/v1/call-batches", salesToken);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.batches)).toBe(true);
			for (const b of res.body.data.batches) {
				expect(b.userId).toBe(salesId);
			}
		});
	});

	describe("GET /call-batches/:batchId", () => {
		it("returns the batch with its items", async () => {
			const listRes = await api.get("/api/v1/call-batches", salesToken);
			const batchId = listRes.body.data.batches[0]?.id as string;
			expect(batchId).toBeDefined();

			const res = await api.get(
				`/api/v1/call-batches/${batchId}`,
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.id).toBe(batchId);
			expect(Array.isArray(res.body.data.items)).toBe(true);
		});

		it("returns 404 for a non-existent batch", async () => {
			const res = await api.get(
				"/api/v1/call-batches/00000000-0000-0000-0000-000000000999",
				salesToken,
			);
			expect(res.status).toBe(404);
		});
	});
});
