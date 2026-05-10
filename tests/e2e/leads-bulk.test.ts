import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { leadActivities, leadMessages, leads } from "../../src/db/schema";
import { api, makeToken } from "../helpers";
import { createLead, createUser, testDb, truncateAll } from "../setup";

describe("Leads bulk endpoints", () => {
	let adminToken: string;
	let salesToken: string;
	let salesId: string;
	let leadIds: string[] = [];

	beforeAll(async () => {
		await truncateAll();

		const admin = await createUser({ role: "ADMIN", email: "admin@bulk.local" });
		adminToken = makeToken("ADMIN", { sub: admin.id, email: admin.email });

		const sales = await createUser({ role: "SALES", email: "sales@bulk.local" });
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });

		const created = await Promise.all([
			createLead({
				assignedUserId: salesId,
				firstName: "Ananya",
				requirement: "3BHK",
				city: "Noida",
			}),
			createLead({ assignedUserId: salesId, firstName: "Rahul" }),
			createLead({ assignedUserId: salesId, firstName: "Meera" }),
		]);
		leadIds = created.map((l) => l.id);
	});

	afterAll(truncateAll);

	describe("POST /bulk/transfer", () => {
		it("requires ADMIN/MANAGER (403 for SALES)", async () => {
			const res = await api.post(
				"/api/v1/leads/bulk/transfer",
				{ ids: leadIds, assignedTo: salesId },
				salesToken,
			);
			expect(res.status).toBe(403);
		});

		it("ADMIN bulk-transfers and logs an ASSIGNMENT activity per lead", async () => {
			const res = await api.post(
				"/api/v1/leads/bulk/transfer",
				{ ids: leadIds, assignedTo: salesId },
				adminToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.affected).toBe(leadIds.length);

			for (const id of leadIds) {
				const acts = await testDb
					.select()
					.from(leadActivities)
					.where(eq(leadActivities.leadId, id));
				expect(
					acts.some((a) => a.type === "ASSIGNMENT" && a.title === "Lead bulk transferred"),
				).toBe(true);
			}
		});

		it("rejects empty ids", async () => {
			const res = await api.post(
				"/api/v1/leads/bulk/transfer",
				{ ids: [], assignedTo: salesId },
				adminToken,
			);
			expect(res.status).toBe(400);
		});
	});

	describe("POST /bulk/status", () => {
		it("ADMIN updates status for all listed leads", async () => {
			const res = await api.post(
				"/api/v1/leads/bulk/status",
				{ ids: leadIds, status: "interested" },
				adminToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.affected).toBe(leadIds.length);

			const rows = await testDb.select().from(leads);
			for (const r of rows.filter((r) => leadIds.includes(r.id))) {
				expect(r.status).toBe("interested");
			}
		});

		it("rejects an invalid status value", async () => {
			const res = await api.post(
				"/api/v1/leads/bulk/status",
				{ ids: leadIds, status: "WON" },
				adminToken,
			);
			expect(res.status).toBe(400);
		});
	});

	describe("POST /bulk/whatsapp", () => {
		it("interpolates {name}/{requirement}/{city} per lead and persists messages", async () => {
			const res = await api.post(
				"/api/v1/leads/bulk/whatsapp",
				{
					ids: leadIds,
					message: "Hi {name}, still interested in {requirement} in {city}?",
				},
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.sent).toBe(leadIds.length);

			const ananyaId = leadIds[0]!;
			const ananyaMessages = await testDb
				.select()
				.from(leadMessages)
				.where(eq(leadMessages.leadId, ananyaId));
			expect(ananyaMessages.length).toBe(1);
			expect(ananyaMessages[0]?.text).toBe("Hi Ananya, still interested in 3BHK in Noida?");
			expect(ananyaMessages[0]?.direction).toBe("you");
		});
	});

	describe("POST /bulk/campaign", () => {
		it("requires ADMIN/MANAGER (403 for SALES)", async () => {
			const res = await api.post(
				"/api/v1/leads/bulk/campaign",
				{ ids: leadIds, campaignId: "CAMP-1" },
				salesToken,
			);
			expect(res.status).toBe(403);
		});

		it("ADMIN adds leads to campaign and returns campaignId", async () => {
			const res = await api.post(
				"/api/v1/leads/bulk/campaign",
				{ ids: leadIds, campaignId: "CAMP-7" },
				adminToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.added).toBe(leadIds.length);
			expect(res.body.data.campaignId).toBe("CAMP-7");
		});
	});

	describe("POST /bulk/ai-nurture", () => {
		it("queues nurture for the listed leads", async () => {
			const res = await api.post(
				"/api/v1/leads/bulk/ai-nurture",
				{ ids: leadIds },
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.queued).toBe(leadIds.length);
			expect(res.body.data.failed).toBe(0);
		});
	});
});
