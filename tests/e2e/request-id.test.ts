import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createUser, truncateAll } from "../setup";

describe("X-Request-ID header", () => {
	let adminToken: string;

	beforeAll(async () => {
		await truncateAll();
		const admin = await createUser({
			role: "ADMIN",
			email: "admin@reqid.local",
		});
		adminToken = makeToken("ADMIN", { sub: admin.id, email: admin.email });
	});

	afterAll(truncateAll);

	it("is present on /health (unauthenticated public endpoint)", async () => {
		const res = await api.get("/health");
		expect(res.status).toBe(200);
		const id = res.headers["x-request-id"];
		expect(id).toBeDefined();
		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	it("is present on a successful authenticated request", async () => {
		const res = await api.get("/api/v1/users/me", adminToken);
		expect(res.status).toBe(200);
		expect(res.headers["x-request-id"]).toBeDefined();
	});

	it("is present on a 401 unauthenticated request", async () => {
		const res = await api.get("/api/v1/users/me");
		expect(res.status).toBe(401);
		expect(res.headers["x-request-id"]).toBeDefined();
	});

	it("is present on a 400 validation error", async () => {
		const res = await api.post(
			"/api/v1/leads",
			{ name: "X" }, // missing phone + source
			adminToken,
		);
		expect(res.status).toBe(400);
		expect(res.headers["x-request-id"]).toBeDefined();
	});

	it("issues a different ID on each request", async () => {
		const r1 = await api.get("/health");
		const r2 = await api.get("/health");
		expect(r1.headers["x-request-id"]).not.toBe(r2.headers["x-request-id"]);
	});
});
