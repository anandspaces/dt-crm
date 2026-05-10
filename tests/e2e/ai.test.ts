import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { leads } from "../../src/db/schema";
import { api, makeToken } from "../helpers";
import { createLead, createUser, testDb, truncateAll } from "../setup";

describe("AI insight & enrichment", () => {
	let salesToken: string;
	let salesId: string;

	beforeAll(async () => {
		await truncateAll();
		const sales = await createUser({ role: "SALES", email: "sales@ai.local" });
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });
	});

	afterAll(truncateAll);

	describe("GET /ai-insight", () => {
		it("returns suggestedAction='call' for high-score leads (score >= 80)", async () => {
			const lead = await createLead({
				assignedUserId: salesId,
				score: 90,
				requirement: "3BHK",
				city: "Noida",
			});
			const res = await api.get(
				`/api/v1/leads/${lead.id}/ai-insight`,
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.suggestedAction).toBe("call");
			expect(typeof res.body.data.message).toBe("string");
			expect(typeof res.body.data.draftMessage).toBe("string");
		});

		it("returns suggestedAction='whatsapp' for warm leads (score in [50, 80))", async () => {
			const lead = await createLead({
				assignedUserId: salesId,
				score: 70,
			});
			const res = await api.get(
				`/api/v1/leads/${lead.id}/ai-insight`,
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.suggestedAction).toBe("whatsapp");
		});

		it("returns suggestedAction='email' for cold leads (score < 50)", async () => {
			const lead = await createLead({
				assignedUserId: salesId,
				score: 20,
			});
			const res = await api.get(
				`/api/v1/leads/${lead.id}/ai-insight`,
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.suggestedAction).toBe("email");
		});
	});

	describe("POST /enrich", () => {
		it("flips aiEnriched=true on the lead and returns a jobId", async () => {
			const lead = await createLead({ assignedUserId: salesId });
			const res = await api.post(
				`/api/v1/leads/${lead.id}/enrich`,
				{},
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.jobId).toMatch(/^ENRICH-/);

			const [row] = await testDb
				.select({ aiEnriched: leads.aiEnriched })
				.from(leads)
				.where(eq(leads.id, lead.id));
			expect(row?.aiEnriched).toBe(true);
		});
	});
});
