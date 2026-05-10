import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { leads } from "../../src/db/schema";
import { api, makeToken } from "../helpers";
import { createLead, createUser, testDb, truncateAll } from "../setup";

describe("Finance API", () => {
	let salesToken: string;
	let salesId: string;
	let leadId: string;

	beforeAll(async () => {
		await truncateAll();
		const sales = await createUser({ role: "SALES", email: "sales@finance.local" });
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });

		const lead = await createLead({
			assignedUserId: salesId,
			budget: "₹45L",
			requirement: "3BHK",
			city: "Pune",
		});
		leadId = lead.id;
	});

	afterAll(truncateAll);

	describe("GET /finance", () => {
		it("returns dealValue parsed from budget + zero received initially", async () => {
			const res = await api.get(`/api/v1/leads/${leadId}/finance`, salesToken);
			expect(res.status).toBe(200);
			expect(res.body.data.dealValueRaw).toBe(45_00_000);
			expect(res.body.data.dealValueDisplay).toBe("₹45,00,000");
			expect(res.body.data.received).toBe(0);
			expect(res.body.data.pending).toBe(45_00_000);
			expect(Array.isArray(res.body.data.payments)).toBe(true);
			expect(res.body.data.payments.length).toBe(0);
		});
	});

	describe("POST /finance/payments", () => {
		it("rejects missing required fields", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/finance/payments`,
				{ type: "Token amount" },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("adds a payment, returns formatted amountDisplay", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/finance/payments`,
				{
					type: "Token amount",
					amount: 250000,
					method: "UPI",
					paidAt: "2026-04-28",
					autoReminderEnabled: true,
				},
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.amount).toBe(250000);
			expect(res.body.data.amountDisplay).toBe("₹2,50,000");
			expect(res.body.data.method).toBe("UPI");
			expect(res.body.data.autoReminderEnabled).toBe(true);
			expect(res.body.data.nextReminderAt).not.toBeNull();
		});

		it("schedules nextReminderAt on the lead when autoReminderEnabled=true", async () => {
			const [row] = await testDb
				.select({ nextReminderAt: leads.nextReminderAt })
				.from(leads)
				.where(eq(leads.id, leadId));
			expect(row?.nextReminderAt).not.toBeNull();
		});

		it("subsequent GET /finance reflects the new received/pending totals", async () => {
			const res = await api.get(`/api/v1/leads/${leadId}/finance`, salesToken);
			expect(res.status).toBe(200);
			expect(res.body.data.received).toBe(250000);
			expect(res.body.data.pending).toBe(45_00_000 - 250000);
			expect(res.body.data.payments.length).toBe(1);
		});
	});
});
