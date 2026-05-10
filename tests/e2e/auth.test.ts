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
		expect(res.body.data.message).toBe("Account created. Please verify your email.");
	});

	it("allows unauthenticated self-registration as SALES when users exist", async () => {
		const res = await api.post("/api/v1/auth/register", {
			name: "Public User",
			email: "public-signup@test.local",
			password: "password123",
			role: "SALES",
		});
		expect(res.status).toBe(201);
		expect(res.body.data.message).toBeDefined();
	});

	it("forces SALES on public signup when a privileged role is requested", async () => {
		const res = await api.post("/api/v1/auth/register", {
			name: "No Admin",
			email: "no-admin@test.local",
			password: "password123",
			role: "ADMIN",
		});
		expect(res.status).toBe(201);
		expect(res.body.data.message).toBeDefined();
	});

	it("returns 201 with pending_verification message on duplicate unverified email", async () => {
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
		expect(res.status).toBe(201);
		expect(res.body.data.message).toBe("Email registered, pending verification");
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
