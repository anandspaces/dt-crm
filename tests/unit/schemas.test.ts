import { describe, expect, it } from "bun:test";
import {
	loginSchema,
	registerSchema,
} from "../../src/modules/auth/auth.schema";
import {
	bulkStatusSchema,
	bulkTransferSchema,
	bulkWhatsappSchema,
	createLeadSchema,
	listLeadsQuerySchema,
	updateLeadSchema,
} from "../../src/modules/leads/leads.schema";

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
	const minimal = {
		name: "Alice Wonder",
		phone: "+91 99999 88888",
		source: "WEBSITE" as const,
	};

	it("accepts minimal valid body (name + phone + source)", () => {
		const result = createLeadSchema.safeParse(minimal);
		expect(result.success).toBe(true);
	});

	it("accepts firstName as an alternative to name", () => {
		const result = createLeadSchema.safeParse({
			firstName: "Alice",
			phone: "+919999988888",
			source: "MAGICBRICKS",
		});
		expect(result.success).toBe(true);
	});

	it("rejects when both name and firstName are missing", () => {
		const result = createLeadSchema.safeParse({
			phone: "+91999",
			source: "WEBSITE",
		});
		expect(result.success).toBe(false);
	});

	it("rejects when phone is missing", () => {
		const result = createLeadSchema.safeParse({
			name: "Alice",
			source: "WEBSITE",
		});
		expect(result.success).toBe(false);
	});

	it("rejects when source is missing", () => {
		const result = createLeadSchema.safeParse({
			name: "Alice",
			phone: "+91999",
		});
		expect(result.success).toBe(false);
	});

	it("rejects an invalid status value", () => {
		const result = createLeadSchema.safeParse({
			...minimal,
			status: "NEW",
		});
		expect(result.success).toBe(false);
	});

	it("accepts all spec status values", () => {
		const statuses = [
			"fresh",
			"contacted",
			"interested",
			"appointment",
			"demo",
			"negotiation",
			"won",
			"lost",
			"not_interested",
		] as const;
		for (const status of statuses) {
			const r = createLeadSchema.safeParse({ ...minimal, status });
			expect(r.success).toBe(true);
		}
	});

	it("rejects an unknown source value", () => {
		const result = createLeadSchema.safeParse({
			...minimal,
			source: "UNKNOWN_PORTAL",
		});
		expect(result.success).toBe(false);
	});

	it("rejects a score outside 0–100", () => {
		const result = createLeadSchema.safeParse({ ...minimal, score: 150 });
		expect(result.success).toBe(false);
	});

	it("accepts tags as an array of strings", () => {
		const result = createLeadSchema.safeParse({
			...minimal,
			tags: ["loan-ready", "first-time"],
		});
		expect(result.success).toBe(true);
		expect(result.data?.tags).toEqual(["loan-ready", "first-time"]);
	});
});

// ── updateLeadSchema ──────────────────────────────────────────────────────────

describe("updateLeadSchema", () => {
	it("accepts an empty body (full partial)", () => {
		const result = updateLeadSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it("accepts a single status change", () => {
		const result = updateLeadSchema.safeParse({ status: "interested" });
		expect(result.success).toBe(true);
	});

	it("rejects invalid score on update", () => {
		const result = updateLeadSchema.safeParse({ score: -1 });
		expect(result.success).toBe(false);
	});
});

// ── listLeadsQuerySchema ──────────────────────────────────────────────────────

describe("listLeadsQuerySchema", () => {
	it("defaults sortBy=createdAt, sortOrder=desc, page=1, limit=50", () => {
		const result = listLeadsQuerySchema.safeParse({});
		expect(result.success).toBe(true);
		expect(result.data?.sortBy).toBe("createdAt");
		expect(result.data?.sortOrder).toBe("desc");
		expect(result.data?.page).toBe(1);
		expect(result.data?.limit).toBe(50);
	});

	it("coerces string page/limit/scoreMin from query strings", () => {
		const result = listLeadsQuerySchema.safeParse({
			page: "3",
			limit: "25",
			scoreMin: "60",
		});
		expect(result.success).toBe(true);
		expect(result.data?.page).toBe(3);
		expect(result.data?.limit).toBe(25);
		expect(result.data?.scoreMin).toBe(60);
	});

	it("caps limit at 200", () => {
		const result = listLeadsQuerySchema.safeParse({ limit: "201" });
		expect(result.success).toBe(false);
	});

	it("accepts group enum values", () => {
		for (const g of ["urgent", "today", "fresh"] as const) {
			expect(listLeadsQuerySchema.safeParse({ group: g }).success).toBe(true);
		}
	});

	it("rejects an unknown group value", () => {
		const result = listLeadsQuerySchema.safeParse({ group: "stale" });
		expect(result.success).toBe(false);
	});

	it("accepts dateFrom as YYYY-MM-DD or ISO datetime", () => {
		expect(
			listLeadsQuerySchema.safeParse({ dateFrom: "2026-04-01" }).success,
		).toBe(true);
		expect(
			listLeadsQuerySchema.safeParse({
				dateFrom: "2026-04-01T00:00:00.000Z",
			}).success,
		).toBe(true);
	});
});

// ── bulk schemas ──────────────────────────────────────────────────────────────

describe("bulk schemas", () => {
	const id = "11111111-1111-4111-8111-111111111111";

	it("bulkTransfer requires ids and assignedTo", () => {
		expect(bulkTransferSchema.safeParse({ ids: [id], assignedTo: id }).success).toBe(true);
		expect(bulkTransferSchema.safeParse({ ids: [], assignedTo: id }).success).toBe(false);
		expect(bulkTransferSchema.safeParse({ ids: [id] }).success).toBe(false);
	});

	it("bulkStatus accepts spec status enum only", () => {
		expect(bulkStatusSchema.safeParse({ ids: [id], status: "won" }).success).toBe(true);
		expect(bulkStatusSchema.safeParse({ ids: [id], status: "WON" }).success).toBe(false);
	});

	it("bulkWhatsapp requires non-empty message", () => {
		expect(
			bulkWhatsappSchema.safeParse({ ids: [id], message: "Hi {name}" }).success,
		).toBe(true);
		expect(bulkWhatsappSchema.safeParse({ ids: [id], message: "" }).success).toBe(false);
	});
});
