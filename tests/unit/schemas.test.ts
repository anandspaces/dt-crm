import { describe, expect, it } from "bun:test";
import {
	loginSchema,
	registerSchema,
} from "../../src/modules/auth/auth.schema";
import { createLeadSchema } from "../../src/modules/leads/leads.schema";

// ── loginSchema ───────────────────────────────────────────────────────────────

describe("loginSchema", () => {
	it("accepts valid credentials", () => {
		const result = loginSchema.safeParse({
			email: "user@example.com",
			password: "secret",
		});
		expect(result.success).toBe(true);
	});

	it("rejects a non-email address", () => {
		const result = loginSchema.safeParse({
			email: "not-an-email",
			password: "secret",
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toContain("email");
	});

	it("rejects an empty password", () => {
		const result = loginSchema.safeParse({
			email: "user@example.com",
			password: "",
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toContain("password");
	});
});

// ── registerSchema ────────────────────────────────────────────────────────────

describe("registerSchema", () => {
	it("accepts a fully valid registration body", () => {
		const result = registerSchema.safeParse({
			name: "Jane Doe",
			email: "jane@example.com",
			password: "strongpass",
			role: "SALES",
		});
		expect(result.success).toBe(true);
	});

	it("defaults role to SALES when omitted", () => {
		const result = registerSchema.safeParse({
			name: "Jane",
			email: "jane@example.com",
			password: "strongpass",
		});
		expect(result.success).toBe(true);
		expect(result.data?.role).toBe("SALES");
	});

	it("rejects name shorter than 2 characters", () => {
		const result = registerSchema.safeParse({
			name: "J",
			email: "jane@example.com",
			password: "strongpass",
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toContain("name");
	});

	it("rejects password shorter than 8 characters", () => {
		const result = registerSchema.safeParse({
			name: "Jane",
			email: "jane@example.com",
			password: "short",
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toContain("password");
	});

	it("rejects an invalid role value", () => {
		const result = registerSchema.safeParse({
			name: "Jane",
			email: "jane@example.com",
			password: "strongpass",
			role: "SUPERUSER",
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toContain("role");
	});
});

// ── createLeadSchema ──────────────────────────────────────────────────────────

describe("createLeadSchema", () => {
	it("accepts minimal valid body (firstName only)", () => {
		const result = createLeadSchema.safeParse({ firstName: "Alice" });
		expect(result.success).toBe(true);
		expect(result.data?.status).toBe("NEW");
		expect(result.data?.priority).toBe("MEDIUM");
	});

	it("rejects an empty firstName", () => {
		const result = createLeadSchema.safeParse({ firstName: "" });
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toContain("firstName");
	});

	it("rejects an invalid status value", () => {
		const result = createLeadSchema.safeParse({
			firstName: "Alice",
			status: "UNKNOWN",
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toContain("status");
	});
});
