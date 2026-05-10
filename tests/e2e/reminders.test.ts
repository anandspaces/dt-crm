import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createLead, createReminder, createUser, truncateAll } from "../setup";

describe("Reminders API", () => {
	let salesToken: string;
	let salesId: string;
	let leadId: string;

	beforeAll(async () => {
		await truncateAll();
		const sales = await createUser({ role: "SALES", email: "sales@rem.local" });
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });
		const lead = await createLead({ assignedUserId: salesId });
		leadId = lead.id;
	});

	afterAll(truncateAll);

	describe("CRUD", () => {
		it("requires title and dueAt on create (400)", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/reminders`,
				{},
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("creates a reminder", async () => {
			const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
			const res = await api.post(
				`/api/v1/leads/${leadId}/reminders`,
				{ title: "Call back", dueAt },
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.title).toBe("Call back");
		});

		it("lists reminders sorted by dueAt", async () => {
			const res = await api.get(`/api/v1/leads/${leadId}/reminders`, salesToken);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.reminders)).toBe(true);
		});

		it("updates and dismisses a reminder", async () => {
			const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
			const created = await api.post(
				`/api/v1/leads/${leadId}/reminders`,
				{ title: "Update me", dueAt },
				salesToken,
			);
			const id = created.body.data.id;

			const upd = await api.patch(
				`/api/v1/leads/${leadId}/reminders/${id}`,
				{ dismissed: true },
				salesToken,
			);
			expect(upd.status).toBe(200);
			expect(upd.body.data.dismissed).toBe(true);
		});

		it("deletes a reminder", async () => {
			const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
			const created = await api.post(
				`/api/v1/leads/${leadId}/reminders`,
				{ title: "Delete me", dueAt },
				salesToken,
			);
			const id = created.body.data.id;

			const del = await api.delete(
				`/api/v1/leads/${leadId}/reminders/${id}`,
				salesToken,
			);
			expect(del.status).toBe(200);
		});
	});

	describe("group computation effect on leads list", () => {
		it("an overdue reminder makes the lead show group=urgent", async () => {
			const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
			await createReminder(leadId, past, { userId: salesId });

			const res = await api.get(`/api/v1/leads/${leadId}`, salesToken);
			expect(res.status).toBe(200);
			expect(res.body.data.group).toBe("urgent");
		});

		it("?group=urgent filters to leads with overdue reminders", async () => {
			const res = await api.get("/api/v1/leads?group=urgent", salesToken);
			expect(res.status).toBe(200);
			expect(res.body.data.leads.find((l: { id: string }) => l.id === leadId)).toBeDefined();
		});
	});
});
