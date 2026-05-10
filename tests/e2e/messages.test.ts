import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { leadMessages, leads } from "../../src/db/schema";
import { api, makeToken } from "../helpers";
import { createLead, createUser, testDb, truncateAll } from "../setup";

describe("WhatsApp messages API", () => {
	let salesToken: string;
	let salesId: string;
	let leadId: string;

	beforeAll(async () => {
		await truncateAll();
		const sales = await createUser({ role: "SALES", email: "sales@msg.local" });
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });
		const lead = await createLead({ assignedUserId: salesId });
		leadId = lead.id;
	});

	afterAll(truncateAll);

	describe("POST /whatsapp", () => {
		it("rejects empty text (400)", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/whatsapp`,
				{ text: "" },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("sends a message with from='you' and updates lead.lastContactedAt", async () => {
			const before = await testDb
				.select({ lastContactedAt: leads.lastContactedAt })
				.from(leads)
				.where(eq(leads.id, leadId))
				.limit(1);
			expect(before[0]?.lastContactedAt).toBeNull();

			const res = await api.post(
				`/api/v1/leads/${leadId}/whatsapp`,
				{ text: "Hi! Following up." },
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.from).toBe("you");
			expect(res.body.data.isAi).toBe(false);

			const after = await testDb
				.select({ lastContactedAt: leads.lastContactedAt })
				.from(leads)
				.where(eq(leads.id, leadId))
				.limit(1);
			expect(after[0]?.lastContactedAt).not.toBeNull();
		});

		it("marks AI-sent messages with from='ai' and isAi=true", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/whatsapp`,
				{ text: "Auto-reply", sentByAi: true },
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.from).toBe("ai");
			expect(res.body.data.isAi).toBe(true);
		});
	});

	describe("GET /whatsapp", () => {
		it("returns messages oldest-first within a page + page meta", async () => {
			const res = await api.get(`/api/v1/leads/${leadId}/whatsapp`, salesToken);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.messages)).toBe(true);
			expect(res.body.data.page).toBe(1);
			expect(res.body.data.limit).toBe(50);
			expect(res.body.data.total).toBeGreaterThanOrEqual(2);
		});

		it("suggestedReply is null when there is no inbound 'them' message", async () => {
			const res = await api.get(`/api/v1/leads/${leadId}/whatsapp`, salesToken);
			expect(res.body.data.suggestedReply).toBeNull();
		});

		it("suggestedReply is non-null after an inbound 'them' message", async () => {
			// Insert an inbound message directly (mimics a webhook callback)
			await testDb.insert(leadMessages).values({
				leadId,
				direction: "them",
				text: "Is the 3BHK still available?",
				isAi: false,
			});

			const res = await api.get(`/api/v1/leads/${leadId}/whatsapp`, salesToken);
			expect(res.body.data.suggestedReply).not.toBeNull();
			expect(typeof res.body.data.suggestedReply.text).toBe("string");
			expect(res.body.data.suggestedReply.generatedBy).toBe("ai");
		});
	});
});
