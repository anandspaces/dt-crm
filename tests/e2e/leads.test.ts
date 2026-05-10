import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createLead, createUser, truncateAll } from "../setup";

describe("Leads API", () => {
	let adminToken: string;
	let salesToken: string;
	let salesUserId: string;
	let otherSalesId: string;

	beforeAll(async () => {
		await truncateAll();

		const admin = await createUser({
			role: "ADMIN",
			email: "admin@leads.local",
		});
		adminToken = makeToken("ADMIN", { sub: admin.id, email: admin.email });

		const sales = await createUser({
			role: "SALES",
			email: "sales@leads.local",
		});
		salesUserId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });

		const other = await createUser({
			role: "SALES",
			email: "other@leads.local",
		});
		otherSalesId = other.id;
	});

	afterAll(truncateAll);

	// ── POST /api/v1/leads ────────────────────────────────────────────────────
	describe("POST /api/v1/leads", () => {
		it("rejects unauthenticated requests with 401", async () => {
			const res = await api.post("/api/v1/leads", {
				name: "Anon",
				phone: "+919999999999",
				source: "WEBSITE",
			});
			expect(res.status).toBe(401);
		});

		it("rejects when phone or source is missing (400)", async () => {
			const res = await api.post("/api/v1/leads", { name: "X" }, salesToken);
			expect(res.status).toBe(400);
			expect(res.body.data.code).toBe("VALIDATION_ERROR");
		});

		it("creates a lead with computed name + meta + group=fresh", async () => {
			const res = await api.post(
				"/api/v1/leads",
				{
					name: "Ananya Sharma",
					phone: "+91 98200 11234",
					source: "MAGICBRICKS",
					email: "ananya@example.com",
					city: "Noida",
					budget: "₹45L",
					requirement: "3BHK",
					hot: true,
					tags: ["loan-ready"],
				},
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.id).toBeDefined();
			expect(res.body.data.firstName).toBe("Ananya");
			expect(res.body.data.lastName).toBe("Sharma");
			expect(res.body.data.name).toBe("Ananya Sharma");
			expect(res.body.data.meta).toBe("₹45L · 3BHK · Noida");
			expect(res.body.data.group).toBe("fresh");
			expect(res.body.data.hot).toBe(true);
			expect(res.body.data.tags).toEqual(["loan-ready"]);
		});

		it("auto-assigns SALES creator when assignedUserId is omitted", async () => {
			const res = await api.post(
				"/api/v1/leads",
				{ name: "Auto Assigned", phone: "+919999000000", source: "WEBSITE" },
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.assignedUserId).toBe(salesUserId);
		});

		it("ADMIN can assign on creation", async () => {
			const res = await api.post(
				"/api/v1/leads",
				{
					name: "Admin Assigned",
					phone: "+919999000001",
					source: "WEBSITE",
					assignedUserId: otherSalesId,
				},
				adminToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.assignedUserId).toBe(otherSalesId);
		});
	});

	// ── GET /api/v1/leads (page pagination + summary + RBAC) ─────────────────
	describe("GET /api/v1/leads", () => {
		it("returns leads + total + page + summary for ADMIN", async () => {
			const res = await api.get("/api/v1/leads", adminToken);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.leads)).toBe(true);
			expect(typeof res.body.data.total).toBe("number");
			expect(res.body.data.page).toBe(1);
			expect(res.body.data.limit).toBe(50);
			expect(res.body.data.summary).toBeDefined();
		});

		it("SALES only sees leads assigned to them", async () => {
			await createLead({ assignedUserId: salesUserId });
			await createLead({ assignedUserId: otherSalesId });

			const res = await api.get("/api/v1/leads", salesToken);
			expect(res.status).toBe(200);
			for (const lead of res.body.data.leads) {
				expect(lead.assignedUserId).toBe(salesUserId);
			}
		});

		it("filters by status", async () => {
			await createLead({ assignedUserId: salesUserId, status: "interested" });
			const res = await api.get("/api/v1/leads?status=interested", salesToken);
			expect(res.status).toBe(200);
			for (const lead of res.body.data.leads) {
				expect(lead.status).toBe("interested");
			}
		});

		it("filters by score range (scoreMin/scoreMax)", async () => {
			await createLead({ assignedUserId: salesUserId, score: 90 });
			await createLead({ assignedUserId: salesUserId, score: 30 });
			const res = await api.get("/api/v1/leads?scoreMin=80", salesToken);
			expect(res.status).toBe(200);
			for (const lead of res.body.data.leads) {
				expect(lead.score).toBeGreaterThanOrEqual(80);
			}
		});

		it("filters by hot=true", async () => {
			await createLead({ assignedUserId: salesUserId, hot: true });
			const res = await api.get("/api/v1/leads?hot=true", salesToken);
			expect(res.status).toBe(200);
			for (const lead of res.body.data.leads) {
				expect(lead.hot).toBe(true);
			}
		});

		it("page-paginates with total reflecting full set", async () => {
			const res1 = await api.get("/api/v1/leads?page=1&limit=2", adminToken);
			expect(res1.status).toBe(200);
			expect(res1.body.data.leads.length).toBeLessThanOrEqual(2);
			expect(res1.body.data.total).toBeGreaterThanOrEqual(
				res1.body.data.leads.length,
			);
			expect(typeof res1.body.data.hasMore).toBe("boolean");
			expect(res1.body.data.hasMore).toBe(
				res1.body.data.page * res1.body.data.limit < res1.body.data.total,
			);
		});

		it("summary keys are status enum values", async () => {
			const res = await api.get("/api/v1/leads", adminToken);
			for (const k of Object.keys(res.body.data.summary)) {
				expect([
					"fresh",
					"contacted",
					"interested",
					"appointment",
					"demo",
					"negotiation",
					"won",
					"lost",
					"not_interested",
				]).toContain(k);
			}
		});
	});

	// ── GET /api/v1/leads/:id ────────────────────────────────────────────────
	describe("GET /api/v1/leads/:id", () => {
		it("returns the lead with computed fields", async () => {
			const lead = await createLead({
				assignedUserId: salesUserId,
				budget: "₹10L",
				requirement: "2BHK",
				city: "Pune",
			});
			const res = await api.get(`/api/v1/leads/${lead.id}`, salesToken);
			expect(res.status).toBe(200);
			expect(res.body.data.meta).toBe("₹10L · 2BHK · Pune");
			expect(res.body.data.group).toBe("fresh");
		});

		it("returns 404 for missing lead", async () => {
			const res = await api.get(
				"/api/v1/leads/00000000-0000-0000-0000-000000000099",
				adminToken,
			);
			expect(res.status).toBe(404);
		});

		it("returns 403 when SALES tries to read someone else's lead", async () => {
			const lead = await createLead({ assignedUserId: otherSalesId });
			const res = await api.get(`/api/v1/leads/${lead.id}`, salesToken);
			expect(res.status).toBe(403);
		});
	});

	// ── PATCH /api/v1/leads/:id ──────────────────────────────────────────────
	describe("PATCH /api/v1/leads/:id", () => {
		it("updates status and returns the new value", async () => {
			const lead = await createLead({ assignedUserId: salesUserId });
			const res = await api.patch(
				`/api/v1/leads/${lead.id}`,
				{ status: "contacted" },
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.status).toBe("contacted");
		});

		it("rejects an invalid status (400)", async () => {
			const lead = await createLead({ assignedUserId: salesUserId });
			const res = await api.patch(
				`/api/v1/leads/${lead.id}`,
				{ status: "WON" },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("requires auth (401)", async () => {
			const lead = await createLead();
			const res = await api.patch(`/api/v1/leads/${lead.id}`, {
				status: "won",
			});
			expect(res.status).toBe(401);
		});
	});

	// ── DELETE / restore ─────────────────────────────────────────────────────
	describe("DELETE & restore", () => {
		it("ADMIN can soft-delete and then restore a lead", async () => {
			const lead = await createLead({ assignedUserId: salesUserId });

			const del = await api.delete(`/api/v1/leads/${lead.id}`, adminToken);
			expect(del.status).toBe(200);
			expect(del.body.data).toBeNull();

			// Listing no longer shows it
			const list = await api.get("/api/v1/leads", adminToken);
			expect(
				list.body.data.leads.find((l: { id: string }) => l.id === lead.id),
			).toBeUndefined();

			const restore = await api.post(
				`/api/v1/leads/${lead.id}/restore`,
				{},
				adminToken,
			);
			expect(restore.status).toBe(200);
		});

		it("SALES cannot delete a lead (403)", async () => {
			const lead = await createLead({ assignedUserId: salesUserId });
			const res = await api.delete(`/api/v1/leads/${lead.id}`, salesToken);
			expect(res.status).toBe(403);
		});
	});
});
