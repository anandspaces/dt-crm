import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createUser, truncateAll } from "../setup";

describe("Users API", () => {
	let adminToken: string;
	let adminId: string;
	let salesToken: string;
	let salesId: string;
	let otherSalesId: string;

	beforeAll(async () => {
		await truncateAll();
		const admin = await createUser({
			role: "ADMIN",
			email: "admin@users.local",
		});
		adminId = admin.id;
		adminToken = makeToken("ADMIN", { sub: admin.id, email: admin.email });

		const sales = await createUser({
			role: "SALES",
			email: "sales@users.local",
		});
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });

		const other = await createUser({
			role: "SALES",
			email: "other-user@users.local",
		});
		otherSalesId = other.id;
	});

	afterAll(truncateAll);

	describe("GET /api/v1/users", () => {
		it("requires auth", async () => {
			const res = await api.get("/api/v1/users");
			expect(res.status).toBe(401);
		});

		it("returns list for ADMIN", async () => {
			const res = await api.get("/api/v1/users", adminToken);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.items)).toBe(true);
			expect(res.body.data.items.length).toBeGreaterThanOrEqual(3);
			expect(res.body.data.items[0].passwordHash).toBeUndefined();
		});

		it("denies SALES access (403)", async () => {
			const res = await api.get("/api/v1/users", salesToken);
			expect(res.status).toBe(403);
		});

		it("filters by role", async () => {
			const res = await api.get("/api/v1/users?role=ADMIN", adminToken);
			expect(res.status).toBe(200);
			for (const u of res.body.data.items) {
				expect(u.role).toBe("ADMIN");
			}
		});
	});

	describe("GET /api/v1/users/me", () => {
		it("returns the calling user's profile", async () => {
			const res = await api.get("/api/v1/users/me", salesToken);
			expect(res.status).toBe(200);
			expect(res.body.data.id).toBe(salesId);
			expect(res.body.data.passwordHash).toBeUndefined();
		});
	});

	describe("GET /api/v1/users/:id", () => {
		it("ADMIN can fetch any user", async () => {
			const res = await api.get(`/api/v1/users/${salesId}`, adminToken);
			expect(res.status).toBe(200);
		});

		it("SALES can fetch self", async () => {
			const res = await api.get(`/api/v1/users/${salesId}`, salesToken);
			expect(res.status).toBe(200);
		});

		it("SALES cannot fetch another user (403)", async () => {
			const res = await api.get(`/api/v1/users/${otherSalesId}`, salesToken);
			expect(res.status).toBe(403);
		});
	});

	describe("PATCH /api/v1/users/:id", () => {
		it("self can update name", async () => {
			const res = await api.patch(
				`/api/v1/users/${salesId}`,
				{ name: "Updated Sales Name" },
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.name).toBe("Updated Sales Name");
		});

		it("non-admin cannot change role on self (silently ignored, no 403 unless other user)", async () => {
			const res = await api.patch(
				`/api/v1/users/${salesId}`,
				{ role: "ADMIN" },
				salesToken,
			);
			// Service throws ForbiddenError when role/isActive is sent by non-admin
			expect(res.status).toBe(403);
		});

		it("ADMIN can change another user's role", async () => {
			const res = await api.patch(
				`/api/v1/users/${otherSalesId}`,
				{ role: "MANAGER" },
				adminToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data.role).toBe("MANAGER");
		});
	});

	describe("DELETE /api/v1/users/:id", () => {
		it("only ADMIN can deactivate (403 for SALES)", async () => {
			const res = await api.delete(`/api/v1/users/${otherSalesId}`, salesToken);
			expect(res.status).toBe(403);
		});

		it("ADMIN cannot deactivate themselves", async () => {
			const res = await api.delete(`/api/v1/users/${adminId}`, adminToken);
			expect(res.status).toBe(403);
		});

		it("ADMIN can deactivate another user", async () => {
			const target = await createUser({ email: "deactivate-me@users.local" });
			const res = await api.delete(`/api/v1/users/${target.id}`, adminToken);
			expect(res.status).toBe(200);
			expect(res.body.data).toBeNull();
		});
	});
});
