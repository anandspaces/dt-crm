import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createLead, createUser, truncateAll } from "../setup";

describe("Pipelines API", () => {
	let adminToken: string;
	let salesToken: string;
	let salesId: string;

	beforeAll(async () => {
		await truncateAll();
		const admin = await createUser({ role: "ADMIN", email: "admin@pipe.local" });
		adminToken = makeToken("ADMIN", { sub: admin.id, email: admin.email });

		const sales = await createUser({ role: "SALES", email: "sales@pipe.local" });
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });
	});

	afterAll(truncateAll);

	describe("POST + GET /pipelines", () => {
		it("requires ADMIN/MANAGER on create (403 for SALES)", async () => {
			const res = await api.post(
				"/api/v1/pipelines",
				{ name: "X" },
				salesToken,
			);
			expect(res.status).toBe(403);
		});

		it("creates a pipeline with stages in one transaction", async () => {
			const res = await api.post(
				"/api/v1/pipelines",
				{
					name: "Sales Pipeline",
					stages: [
						{ name: "New", position: 0 },
						{
							name: "Closed Won",
							position: 1,
							isClosed: true,
							isWon: true,
						},
					],
				},
				adminToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.name).toBe("Sales Pipeline");
			expect(res.body.data.stages.length).toBe(2);
		});

		it("lists pipelines with stages sorted by position", async () => {
			const res = await api.get("/api/v1/pipelines", adminToken);
			expect(res.status).toBe(200);
			const sales = res.body.data.find((p: { name: string }) => p.name === "Sales Pipeline");
			expect(sales).toBeDefined();
			expect(sales.stages[0].position).toBeLessThanOrEqual(sales.stages[1].position);
		});
	});

	describe("Stages CRUD", () => {
		let pipelineId: string;
		let stageId: string;

		beforeAll(async () => {
			const created = await api.post(
				"/api/v1/pipelines",
				{ name: "Stage Test Pipeline", stages: [] },
				adminToken,
			);
			pipelineId = created.body.data.id;

			const stageRes = await api.post(
				`/api/v1/pipelines/${pipelineId}/stages`,
				{ name: "Discovery", position: 0 },
				adminToken,
			);
			expect(stageRes.status).toBe(201);
			stageId = stageRes.body.data.id;
		});

		it("updates a stage's position and color", async () => {
			const res = await api.patch(
				`/api/v1/pipelines/${pipelineId}/stages/${stageId}`,
				{ position: 5, color: "#22c55e" },
				adminToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.position).toBe(5);
			expect(res.body.data.color).toBe("#22c55e");
		});

		it("422 when deleting a stage that still has active leads", async () => {
			await createLead({
				assignedUserId: salesId,
				stageId,
				pipelineId,
			});
			const res = await api.delete(
				`/api/v1/pipelines/${pipelineId}/stages/${stageId}`,
				adminToken,
			);
			expect(res.status).toBe(422);
			expect(res.body.data.code).toBe("UNPROCESSABLE");
		});

		it("deletes an empty stage", async () => {
			const stageRes = await api.post(
				`/api/v1/pipelines/${pipelineId}/stages`,
				{ name: "Empty stage", position: 99 },
				adminToken,
			);
			const id = stageRes.body.data.id;
			const res = await api.delete(
				`/api/v1/pipelines/${pipelineId}/stages/${id}`,
				adminToken,
			);
			expect(res.status).toBe(200);
		});
	});
});
