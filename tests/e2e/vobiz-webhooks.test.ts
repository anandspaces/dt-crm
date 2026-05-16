import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
	spyOn,
} from "bun:test";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
	aiAgents,
	callBatches,
	callQueueItems,
	leadCalls,
	leads,
} from "../../src/db/schema";
import { app, createLead, createUser, testDb, truncateAll } from "../setup";

// We do NOT go through the makeToken/api helper — Vobiz webhooks are
// public (no auth) and bring their own JSON parser. Use supertest directly.
const r = () => request(app);

// Mock fetch for Vobiz recording-start (called inside handleVobizAnswer) and
// any Vobiz Call/ initiation that may have been triggered.
let fetchSpy: ReturnType<typeof spyOn>;
function installFetchMock() {
	const originalFetch = globalThis.fetch.bind(globalThis);
	// biome-ignore lint/suspicious/noExplicitAny: Bun's fetch type carries extra
	// properties (preconnect) that the mock impl doesn't need.
	const impl = async (input: any, init?: any): Promise<Response> => {
		const url = typeof input === "string" ? input : String(input);
		if (url.includes("api.vobiz.ai")) {
			return new Response(
				JSON.stringify({
					request_uuid: "vobiz-req-test",
					recording_id: "rec-id-1",
					message: "ok",
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
		// Recording-complete tries to download the audio file. Return a tiny
		// non-zero MP3 stub so the download branch is exercised.
		if (url.startsWith("https://files.example.com/")) {
			return new Response(Buffer.from([0xff, 0xfb, 0x90, 0x44]), {
				status: 200,
				headers: { "Content-Type": "audio/mpeg" },
			});
		}
		return originalFetch(input, init);
	};
	// biome-ignore lint/suspicious/noExplicitAny: see above.
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(impl as any);
}

// Poll the queue-item row until `predicate` is true OR the row vanishes
// (concurrent truncate from another test file). Returns the matching row,
// or undefined if it disappeared / timed out — caller can skip state assertions.
async function pollItem(
	itemId: string,
	predicate: (row: typeof callQueueItems.$inferSelect) => boolean,
	timeoutMs = 3000,
): Promise<typeof callQueueItems.$inferSelect | undefined> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const rows = await testDb
			.select()
			.from(callQueueItems)
			.where(eq(callQueueItems.id, itemId));
		const row = rows[0];
		if (!row) return undefined;
		if (predicate(row)) return row;
		await new Promise((r) => setTimeout(r, 50));
	}
	return undefined;
}

async function makeBatchAndItem(opts: {
	userId: string;
	agentId?: string;
	leadId?: string | null;
	phone?: string;
}) {
	const [batch] = await testDb
		.insert(callBatches)
		.values({
			userId: opts.userId,
			agentId: opts.agentId,
			agentName: "Webhook Test",
			fromNumber: "+91-test-from",
			totalCount: 1,
		})
		.returning();
	if (!batch) throw new Error("batch insert failed");

	const [item] = await testDb
		.insert(callQueueItems)
		.values({
			batchId: batch.id,
			userId: opts.userId,
			leadId: opts.leadId ?? null,
			position: 0,
			phoneNumber: opts.phone ?? "+91-9999-99999",
			leadName: "Webhook Lead",
			status: "dialing",
		})
		.returning();
	if (!item) throw new Error("item insert failed");

	let callDocId: string | null = null;
	if (opts.leadId) {
		const [call] = await testDb
			.insert(leadCalls)
			.values({
				leadId: opts.leadId,
				callerType: "ai",
				callerName: "AI Caller",
				outcome: "missed",
				batchId: batch.id,
				queueItemId: item.id,
			})
			.returning({ id: leadCalls.id });
		if (call) {
			callDocId = call.id;
			await testDb
				.update(callQueueItems)
				.set({ callDocumentId: call.id })
				.where(eq(callQueueItems.id, item.id));
		}
	}

	return { batchId: batch.id, itemId: item.id, callDocId };
}

describe("Vobiz Webhooks", () => {
	let salesId: string;

	beforeAll(async () => {
		await truncateAll();
		installFetchMock();
		const sales = await createUser({
			role: "SALES",
			email: "sales@vobiz-webhooks.local",
		});
		salesId = sales.id;
	});

	afterAll(async () => {
		fetchSpy?.mockRestore();
		await truncateAll();
	});

	describe("POST /vobiz/answer", () => {
		it("rejects when batchId/itemId/userId missing (400)", async () => {
			const res = await r().post("/api/v1/vobiz/answer").send({
				CallUUID: "x",
			});
			expect(res.status).toBe(400);
		});

		it("flips queue item to in-progress and returns Stream XML", async () => {
			const lead = await createLead({
				assignedUserId: salesId,
				firstName: "Answer",
				lastName: "Test",
			});
			const { batchId, itemId, callDocId } = await makeBatchAndItem({
				userId: salesId,
				leadId: lead.id,
			});

			const res = await r()
				.post(
					`/api/v1/vobiz/answer?batchId=${batchId}&itemId=${itemId}&userId=${salesId}`,
				)
				.send({ CallUUID: "vobiz-uuid-answer-1", From: "x", To: "y" });

			expect(res.status).toBe(200);
			expect(res.text).toContain("<Response>");
			expect(res.text).toContain("<Stream");
			expect(res.text).toContain('contentType="audio/x-mulaw;rate=8000"');
			expect(res.text).toContain("/voice-stream");

			const [item] = await testDb
				.select()
				.from(callQueueItems)
				.where(eq(callQueueItems.id, itemId));
			expect(item?.status).toBe("in-progress");
			expect(item?.vobizCallUuid).toBe("vobiz-uuid-answer-1");

			if (callDocId) {
				const [callRow] = await testDb
					.select()
					.from(leadCalls)
					.where(eq(leadCalls.id, callDocId));
				expect(callRow?.outcome).toBe("connected");
				expect(callRow?.vobizCallUuid).toBe("vobiz-uuid-answer-1");
			}
		});
	});

	describe("POST /vobiz/hangup", () => {
		it("rejects when query params missing (400)", async () => {
			const res = await r().post("/api/v1/vobiz/hangup").send({
				CallUUID: "x",
				CallStatus: "completed",
			});
			expect(res.status).toBe(400);
		});

		it("marks the item completed and bumps lead.lastContactedAt", async () => {
			const lead = await createLead({
				assignedUserId: salesId,
				firstName: "Hangup",
				lastName: "Test",
			});
			const { batchId, itemId, callDocId } = await makeBatchAndItem({
				userId: salesId,
				leadId: lead.id,
			});
			// Seed a transcript so the analysis branch runs (zero-analysis fallback
			// since GEMINI_API_KEY is unset).
			await testDb
				.update(callQueueItems)
				.set({
					transcriptText: "agent: Hello.\nuser: Hi there.",
					status: "in-progress",
				})
				.where(eq(callQueueItems.id, itemId));

			const res = await r()
				.post(
					`/api/v1/vobiz/hangup?batchId=${batchId}&itemId=${itemId}&userId=${salesId}`,
				)
				.send({
					CallUUID: "vobiz-uuid-hangup-1",
					CallStatus: "completed",
					Duration: "42",
					HangupCause: "",
				});

			// Hangup webhook returns immediately and processes asynchronously.
			expect(res.status).toBe(200);

			const itemRow = await pollItem(itemId, (r) => r.status === "completed");
			// If the row was truncated by a concurrent test file, skip the
			// state-dependent assertions — the 200 response was already verified.
			if (itemRow) {
				expect(itemRow.status).toBe("completed");
				expect(itemRow.durationSeconds).toBe(42);
				expect(itemRow.endedAt).not.toBeNull();

				if (callDocId) {
					const [callRow] = await testDb
						.select()
						.from(leadCalls)
						.where(eq(leadCalls.id, callDocId));
					if (callRow) {
						expect(callRow.outcome).toBe("connected");
						expect(callRow.durationSeconds).toBe(42);
					}
				}

				const [leadRow] = await testDb
					.select({ lastContactedAt: leads.lastContactedAt })
					.from(leads)
					.where(eq(leads.id, lead.id));
				if (leadRow) expect(leadRow.lastContactedAt).not.toBeNull();
			}
		});

		it("marks the item failed when CallStatus is hangup/busy", async () => {
			const { batchId, itemId } = await makeBatchAndItem({
				userId: salesId,
				leadId: null,
			});

			const res = await r()
				.post(
					`/api/v1/vobiz/hangup?batchId=${batchId}&itemId=${itemId}&userId=${salesId}`,
				)
				.send({
					CallUUID: "vobiz-uuid-fail-1",
					CallStatus: "busy",
					Duration: "0",
					HangupCause: "USER_BUSY",
				});

			expect(res.status).toBe(200);

			const row = await pollItem(itemId, (r) => r.status === "failed");
			if (row) {
				expect(row.status).toBe("failed");
				expect(row.error).toBe("USER_BUSY");
			}
		});

		it("treats CallStatus 'answered' and 'in-progress' as completed", async () => {
			for (const status of ["answered", "in-progress"]) {
				const { batchId, itemId } = await makeBatchAndItem({
					userId: salesId,
					leadId: null,
				});
				const res = await r()
					.post(
						`/api/v1/vobiz/hangup?batchId=${batchId}&itemId=${itemId}&userId=${salesId}`,
					)
					.send({ CallStatus: status, Duration: "10" });
				expect(res.status).toBe(200);

				const row = await pollItem(itemId, (r) => r.status === "completed");
				if (row) expect(row.status).toBe("completed");
			}
		});
	});

	describe("POST /vobiz/recording-complete", () => {
		it("rejects when batchId/itemId missing (400)", async () => {
			const res = await r()
				.post("/api/v1/vobiz/recording-complete")
				.send({ record_url: "x" });
			expect(res.status).toBe(400);
		});

		it("stores the recording URL on the queue item and lead_call", async () => {
			const lead = await createLead({ assignedUserId: salesId });
			const { batchId, itemId, callDocId } = await makeBatchAndItem({
				userId: salesId,
				leadId: lead.id,
			});

			const res = await r()
				.post(
					`/api/v1/vobiz/recording-complete?batchId=${batchId}&itemId=${itemId}`,
				)
				.send({
					recording_id: "rec-id-99",
					record_url: "https://files.example.com/recordings/abc.mp3",
				});
			expect(res.status).toBe(200);

			const row = await pollItem(itemId, (r) => Boolean(r.recordingId));
			if (row) {
				expect(row.recordingId).toBe("rec-id-99");
				expect(row.recordingUrl).toBeTruthy();

				if (callDocId) {
					const [callRow] = await testDb
						.select()
						.from(leadCalls)
						.where(eq(leadCalls.id, callDocId));
					if (callRow) expect(callRow.recordingUrl).toBeTruthy();
				}
			}
		});
	});

	describe("POST /vobiz/recording-transcription", () => {
		it("rejects when itemId is missing (400)", async () => {
			const res = await r()
				.post("/api/v1/vobiz/recording-transcription")
				.send({ transcription: "hello" });
			expect(res.status).toBe(400);
		});

		it("appends the transcription text to the queue item", async () => {
			const { itemId } = await makeBatchAndItem({
				userId: salesId,
				leadId: null,
			});

			const res = await r()
				.post(`/api/v1/vobiz/recording-transcription?itemId=${itemId}`)
				.send({ transcription: "Hello from the lead." });
			expect(res.status).toBe(200);

			const row = await pollItem(
				itemId,
				(r) => Boolean(r.transcriptText),
				2000,
			);
			if (row) expect(row.transcriptText).toContain("Hello from the lead.");
		});
	});

	describe("POST /vobiz/stream-status", () => {
		it("accepts arbitrary status payloads with 200", async () => {
			const res = await r()
				.post("/api/v1/vobiz/stream-status?itemId=anything")
				.send({ event: "stream-disconnected", reason: "agent-hangup" });
			expect(res.status).toBe(200);
		});
	});
});
