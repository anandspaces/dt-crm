import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createLead, createPipeline, createUser, truncateAll } from "../setup";

describe("Leads API", () => {
	let adminToken: string;
	let salesToken: string;
	let salesUserId: string;
	let pipelineId: string;
	let stageId: string;

	beforeAll(async () => {
		await truncateAll();

		const admin = await createUser({
			role: "ADMIN",
			email: "admin@leads.local",
		});
		adminToken = makeToken("ADMIN", { sub: admin.id });

		const sales = await createUser({
			role: "SALES",
			email: "sales@leads.local",
		});
		salesUserId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id });

		const { pipeline, stage } = await createPipeline("Test Pipeline");
		pipelineId = pipeline.id;
		stageId = stage.id;
	});

	afterAll(truncateAll);

	describe("POST /api/v1/leads", () => {
		it("returns 401 without a token", async () => {
			const res = await api.post("/api/v1/leads", { firstName: "Anon" });
			expect(res.status).toBe(401);
		});

		it("returns 400 on missing firstName", async () => {
			const res = await api.post("/api/v1/leads", {}, salesToken);
			expect(res.status).toBe(400);
			expect(res.body.data.code).toBe("VALIDATION_ERROR");
		});

		it("creates a lead and returns 201 (SALES role)", async () => {
			const res = await api.post(
				"/api/v1/leads",
				{
					firstName: "John",
					lastName: "Doe",
					email: "john@example.com",
					status: "NEW",
					priority: "HIGH",
					pipelineId,
					stageId,
					assignedUserId: salesUserId,
				},
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.firstName).toBe("John");
			expect(res.body.data.id).toBeDefined();
		});
	});

	describe("GET /api/v1/leads", () => {
		it("returns list with items and meta for ADMIN", async () => {
			const res = await api.get("/api/v1/leads", adminToken);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.items)).toBe(true);
			expect(res.body.data.meta).toBeDefined();
		});

		it("SALES user only sees leads assigned to them", async () => {
			// Lead assigned to sales user
			await createLead({
				email: `assigned-${Date.now()}@test.local`,
				assignedUserId: salesUserId,
			});
			// Lead not assigned to anyone
			await createLead({ email: `unassigned-${Date.now()}@test.local` });

			const res = await api.get("/api/v1/leads", salesToken);
			expect(res.status).toBe(200);
			for (const lead of res.body.data.items as Array<{
				assignedUserId: string | null;
			}>) {
				expect(lead.assignedUserId).toBe(salesUserId);
			}
		});
	});

	describe("PATCH /api/v1/leads/:id", () => {
		it("updates a lead and returns the new status", async () => {
			const lead = await createLead({
				email: `patch-${Date.now()}@test.local`,
				assignedUserId: salesUserId,
			});

			const res = await api.patch(
				`/api/v1/leads/${lead.id}`,
				{ status: "CONTACTED" },
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.status).toBe("CONTACTED");
		});

		it("returns 401 without a token", async () => {
			const lead = await createLead();
			const res = await api.patch(`/api/v1/leads/${lead.id}`, {
				status: "WON",
			});
			expect(res.status).toBe(401);
		});
	});
});
