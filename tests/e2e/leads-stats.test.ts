import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createLead, createUser, truncateAll } from "../setup";

describe("GET /api/v1/leads/stats", () => {
	let adminToken: string;
	let salesToken: string;

	beforeAll(async () => {
		await truncateAll();
		const admin = await createUser({ role: "ADMIN", email: "admin@stats.local" });
		adminToken = makeToken("ADMIN", { sub: admin.id, email: admin.email });
		const sales = await createUser({ role: "SALES", email: "sales@stats.local" });
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });

		await Promise.all([
			createLead({ assignedUserId: sales.id, status: "fresh", source: "MAGICBRICKS", hot: true }),
			createLead({ assignedUserId: sales.id, status: "fresh", source: "MAGICBRICKS" }),
			createLead({ assignedUserId: sales.id, status: "interested", source: "META_ADS", hot: true }),
			createLead({ assignedUserId: sales.id, status: "won", source: "REFERRAL" }),
		]);
	});

	afterAll(truncateAll);

	it("returns byStatus + bySource + total + hotCount + aiEnrichedCount", async () => {
		const res = await api.get("/api/v1/leads/stats", adminToken);
		expect(res.status).toBe(200);
		expect(res.body.data.total).toBe(4);
		expect(res.body.data.byStatus.fresh).toBe(2);
		expect(res.body.data.byStatus.interested).toBe(1);
		expect(res.body.data.byStatus.won).toBe(1);
		expect(res.body.data.bySource.MAGICBRICKS).toBe(2);
		expect(res.body.data.bySource.META_ADS).toBe(1);
		expect(res.body.data.bySource.REFERRAL).toBe(1);
		expect(res.body.data.hotCount).toBe(2);
		expect(res.body.data.aiEnrichedCount).toBe(0);
	});

	it("respects RBAC — SALES sees only their own leads", async () => {
		const res = await api.get("/api/v1/leads/stats", salesToken);
		expect(res.status).toBe(200);
		expect(res.body.data.total).toBe(4); // sales is the assignee for all
	});

	it("filters can narrow stats (e.g. status=fresh)", async () => {
		const res = await api.get("/api/v1/leads/stats?status=fresh", adminToken);
		expect(res.status).toBe(200);
		expect(res.body.data.total).toBe(2);
	});

	it("requires auth", async () => {
		const res = await api.get("/api/v1/leads/stats");
		expect(res.status).toBe(401);
	});
});
