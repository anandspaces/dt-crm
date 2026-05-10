import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createUser, truncateAll } from "../setup";

describe("POST /api/v1/auth/login", () => {
	beforeAll(async () => {
		await truncateAll();
		await createUser({
			email: "admin-login@test.local",
			password: "password123",
			role: "ADMIN",
		});
	});

	afterAll(truncateAll);

	it("returns 200 and accessToken on valid credentials", async () => {
		const res = await api.post("/api/v1/auth/login", {
			email: "admin-login@test.local",
			password: "password123",
		});
		expect(res.status).toBe(200);
		expect(res.body.data.accessToken).toBeDefined();
		expect(res.body.data.user.role).toBe("ADMIN");
		expect(res.body.data.user.passwordHash).toBeUndefined();
	});

	it("returns 401 on wrong password", async () => {
		const res = await api.post("/api/v1/auth/login", {
			email: "admin-login@test.local",
			password: "wrongpassword",
		});
		expect(res.status).toBe(401);
		expect(res.body.data.code).toBe("UNAUTHORIZED");
	});

	it("returns 400 on malformed body (non-email)", async () => {
		const res = await api.post("/api/v1/auth/login", {
			email: "not-an-email",
			password: "password123",
		});
		expect(res.status).toBe(400);
		expect(res.body.data.code).toBe("VALIDATION_ERROR");
	});

	it("returns 400 when body is missing", async () => {
		const res = await api.post("/api/v1/auth/login", {});
		expect(res.status).toBe(400);
	});
});

describe("POST /api/v1/auth/register", () => {
	let adminToken: string;

	beforeAll(async () => {
		await truncateAll();
		const admin = await createUser({
			email: "admin-reg@test.local",
			password: "password123",
			role: "ADMIN",
		});
		adminToken = makeToken("ADMIN", { sub: admin.id });
	});

	afterAll(truncateAll);

	it("allows ADMIN to register a new user", async () => {
		const res = await api.post(
			"/api/v1/auth/register",
			{
				name: "Sales Rep",
				email: "sales-new@test.local",
				password: "password123",
				role: "SALES",
			},
			adminToken,
		);
		expect(res.status).toBe(201);
		expect(res.body.data.user.role).toBe("SALES");
		expect(res.body.data.accessToken).toBeDefined();
	});

	it("returns 409 on duplicate email", async () => {
		await api.post(
			"/api/v1/auth/register",
			{ name: "Dup One", email: "dup@test.local", password: "password123" },
			adminToken,
		);
		const res = await api.post(
			"/api/v1/auth/register",
			{ name: "Dup Two", email: "dup@test.local", password: "password123" },
			adminToken,
		);
		expect(res.status).toBe(409);
	});

	it("returns 403 when a non-admin attempts registration after first user exists", async () => {
		const salesToken = makeToken("SALES");
		const res = await api.post(
			"/api/v1/auth/register",
			{
				name: "Intruder",
				email: "intruder@test.local",
				password: "password123",
			},
			salesToken,
		);
		expect(res.status).toBe(403);
	});
});
