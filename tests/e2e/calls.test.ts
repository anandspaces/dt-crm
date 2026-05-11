import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { leads } from "../../src/db/schema";
import { api, makeToken } from "../helpers";
import { createLead, createUser, testDb, truncateAll } from "../setup";

describe("Calls API", () => {
	let salesToken: string;
	let salesId: string;
	let leadId: string;

	beforeAll(async () => {
		await truncateAll();
		const sales = await createUser({
			role: "SALES",
			email: "sales@calls.local",
		});
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });
		const lead = await createLead({ assignedUserId: salesId });
		leadId = lead.id;
	});

	afterAll(truncateAll);

	describe("POST /calls", () => {
		it("rejects missing outcome (400)", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/calls`,
				{ durationSeconds: 60 },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("logs a connected call and bumps lead.lastContactedAt", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/calls`,
				{
					callerType: "agent",
					callerName: "Riya Kapoor",
					outcome: "connected",
					durationSeconds: 444,
				},
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.outcome).toBe("connected");
			expect(res.body.data.durationSeconds).toBe(444);

			const [row] = await testDb
				.select({ lastContactedAt: leads.lastContactedAt })
				.from(leads)
				.where(eq(leads.id, leadId));
			expect(row?.lastContactedAt).not.toBeNull();
		});

		it("attaches a stub aiSummary when recordingUrl is present", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/calls`,
				{
					outcome: "connected",
					durationSeconds: 60,
					recordingUrl: "https://files.example.com/recordings/x.mp3",
				},
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.aiSummary).toBeDefined();
			expect(res.body.data.aiSummary.sentiment).toBe("neutral");
			expect(Array.isArray(res.body.data.aiSummary.keyPoints)).toBe(true);
		});

		it("missed call records 0s duration without bumping lastContactedAt", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/calls`,
				{ outcome: "missed", durationSeconds: 0 },
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.outcome).toBe("missed");
		});
	});

	describe("GET /calls", () => {
		it("returns full call history newest-first", async () => {
			const res = await api.get(`/api/v1/leads/${leadId}/calls`, salesToken);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.calls)).toBe(true);
			expect(res.body.data.calls.length).toBeGreaterThanOrEqual(3);
		});
	});
});
