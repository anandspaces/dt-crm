import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createLead, createUser, truncateAll } from "../setup";

describe("Followups API", () => {
	let salesToken: string;
	let salesId: string;
	let adminToken: string;
	let leadId: string;

	beforeAll(async () => {
		await truncateAll();

		const sales = await createUser({ role: "SALES", email: "sales@fu.local" });
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });

		const admin = await createUser({ role: "ADMIN", email: "admin@fu.local" });
		adminToken = makeToken("ADMIN", { sub: admin.id, email: admin.email });

		const lead = await createLead({ assignedUserId: salesId });
		leadId = lead.id;
	});

	afterAll(truncateAll);

	describe("Per-lead followups", () => {
		it("rejects missing scheduledAt (400)", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/followups`,
				{ type: "CALL" },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("creates a followup and defaults assignee to caller", async () => {
			const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
			const res = await api.post(
				`/api/v1/leads/${leadId}/followups`,
				{ type: "CALL", scheduledAt },
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.assignedUserId).toBe(salesId);
			expect(res.body.data.status).toBe("PENDING");
		});

		it("lists followups for the lead", async () => {
			const res = await api.get(
				`/api/v1/leads/${leadId}/followups`,
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.items)).toBe(true);
			expect(res.body.data).toHaveProperty("nextCursor");
		});

		it("setting status=DONE auto-stamps completedAt", async () => {
			const scheduledAt = new Date(Date.now() + 3600 * 1000).toISOString();
			const created = await api.post(
				`/api/v1/leads/${leadId}/followups`,
				{ type: "EMAIL", scheduledAt },
				salesToken,
			);
			const id = created.body.data.id;

			const upd = await api.patch(
				`/api/v1/leads/${leadId}/followups/${id}`,
				{ status: "DONE" },
				salesToken,
			);
			expect(upd.status).toBe(200);
			expect(upd.body.data.status).toBe("DONE");
			expect(upd.body.data.completedAt).not.toBeNull();
		});
	});

	describe("Global /api/v1/followups", () => {
		it("SALES sees only their own followups", async () => {
			const res = await api.get("/api/v1/followups", salesToken);
			expect(res.status).toBe(200);
			for (const f of res.body.data.items) {
				expect(f.assignedUserId).toBe(salesId);
			}
		});

		it("ADMIN sees all followups (and may filter)", async () => {
			const res = await api.get("/api/v1/followups", adminToken);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.items)).toBe(true);
		});
	});
});
