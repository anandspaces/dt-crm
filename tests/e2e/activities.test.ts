import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { leads } from "../../src/db/schema";
import { api, makeToken } from "../helpers";
import { createLead, createUser, testDb, truncateAll } from "../setup";

describe("Activities API", () => {
	let salesToken: string;
	let salesId: string;
	let leadId: string;

	beforeAll(async () => {
		await truncateAll();
		const sales = await createUser({ role: "SALES", email: "sales@act.local" });
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });
		const lead = await createLead({ assignedUserId: salesId });
		leadId = lead.id;
	});

	afterAll(truncateAll);

	describe("POST /activities", () => {
		it("rejects missing title (400)", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/activities`,
				{ type: "CALL" },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("logs an activity and returns it", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/activities`,
				{ type: "EMAIL", title: "Sent intro email" },
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.type).toBe("EMAIL");
			expect(res.body.data.title).toBe("Sent intro email");
		});

		it("contact-type activities (CALL/EMAIL/MEETING) bump lead.lastContactedAt", async () => {
			await api.post(
				`/api/v1/leads/${leadId}/activities`,
				{ type: "MEETING", title: "Quick sync" },
				salesToken,
			);
			const [row] = await testDb
				.select({ lastContactedAt: leads.lastContactedAt })
				.from(leads)
				.where(eq(leads.id, leadId));
			expect(row?.lastContactedAt).not.toBeNull();
		});
	});

	describe("GET /activities", () => {
		it("returns items + nextCursor with author projection", async () => {
			const res = await api.get(
				`/api/v1/leads/${leadId}/activities`,
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.items)).toBe(true);
			expect(res.body.data).toHaveProperty("nextCursor");
			expect(res.body.data.items[0].user).toBeDefined();
		});

		it("filters by type", async () => {
			const res = await api.get(
				`/api/v1/leads/${leadId}/activities?type=EMAIL`,
				salesToken,
			);
			expect(res.status).toBe(200);
			for (const item of res.body.data.items) {
				expect(item.type).toBe("EMAIL");
			}
		});
	});
});
