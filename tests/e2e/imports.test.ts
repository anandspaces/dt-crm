import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { leads } from "../../src/db/schema";
import { api, makeToken } from "../helpers";
import { createUser, testDb, truncateAll } from "../setup";

describe("CSV Import API", () => {
	let adminToken: string;
	let salesToken: string;

	beforeAll(async () => {
		await truncateAll();
		const admin = await createUser({ role: "ADMIN", email: "admin@imp.local" });
		adminToken = makeToken("ADMIN", { sub: admin.id, email: admin.email });
		const sales = await createUser({ role: "SALES", email: "sales@imp.local" });
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });
	});

	afterAll(truncateAll);

	it("requires ADMIN/MANAGER (403 for SALES)", async () => {
		const csv = "name,phone\nJane,+919999000000\n";
		const res = await api.postFile(
			"/api/v1/leads/import",
			"file",
			"x.csv",
			csv,
			"text/csv",
			salesToken,
		);
		expect(res.status).toBe(403);
	});

	it("rejects when file is missing (400)", async () => {
		const res = await api.post("/api/v1/leads/import", {}, adminToken);
		expect(res.status).toBe(400);
	});

	it("imports valid rows, reports per-row errors for invalid rows", async () => {
		const csv = [
			"name,phone,email,source,city,budget,requirement,status,priority,assignedTo,tags",
			"Ananya Sharma,+91 98200 11234,ananya@example.com,MAGICBRICKS,Noida,₹45L,3BHK,interested,HIGH,,loan-ready;first-time",
			'"Rahul, Jr.",+919999111111,rahul@example.com,99ACRES,Pune,₹1.2Cr,4BHK,fresh,MEDIUM,,',
			",,no-name@example.com,WEBSITE,Delhi,,2BHK,fresh,LOW,,",
			"Shorty,123,short@example.com,WEBSITE,,,1RK,fresh,LOW,,",
		].join("\n");

		const res = await api.postFile(
			"/api/v1/leads/import",
			"file",
			"leads.csv",
			csv,
			"text/csv",
			adminToken,
		);
		expect(res.status).toBe(200);
		expect(res.body.data.imported).toBe(2);
		expect(res.body.data.skipped).toBe(2);

		const reasons = res.body.data.errors.map((e: { reason: string }) => e.reason);
		expect(reasons).toContain("Missing name");
		expect(reasons).toContain("Invalid phone number");

		const [countRow] = await testDb
			.select({ count: sql<number>`count(*)::int` })
			.from(leads);
		expect(countRow?.count).toBe(2);
	});

	it("falls back to OTHER for unknown source values", async () => {
		const csv = [
			"name,phone,source",
			"Falback Person,+919876543210,UNKNOWN_PORTAL",
		].join("\n");

		const res = await api.postFile(
			"/api/v1/leads/import",
			"file",
			"fallback.csv",
			csv,
			"text/csv",
			adminToken,
		);
		expect(res.status).toBe(200);
		expect(res.body.data.imported).toBe(1);
	});
});
