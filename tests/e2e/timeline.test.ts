import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createLead, createUser, truncateAll } from "../setup";

describe("Timeline API", () => {
	let salesToken: string;
	let salesId: string;
	let leadId: string;

	beforeAll(async () => {
		await truncateAll();
		const sales = await createUser({
			role: "SALES",
			email: "sales@timeline.local",
		});
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });
		const lead = await createLead({ assignedUserId: salesId });
		leadId = lead.id;
	});

	afterAll(truncateAll);

	describe("POST /timeline", () => {
		it("requires auth", async () => {
			const res = await api.post(`/api/v1/leads/${leadId}/timeline`, {
				kind: "note",
				title: "Hello",
			});
			expect(res.status).toBe(401);
		});

		it("rejects empty title", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/timeline`,
				{ kind: "note", title: "" },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("creates a timeline note with default kind=note", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/timeline`,
				{ title: "Manual note" },
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.title).toBe("Manual note");
			expect(res.body.data.kind).toBe("note");
		});
	});

	describe("GET /timeline", () => {
		it("returns timeline items shaped for the UI", async () => {
			const res = await api.get(`/api/v1/leads/${leadId}/timeline`, salesToken);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.items)).toBe(true);
			const item = res.body.data.items[0];
			expect(item.id).toBeDefined();
			expect(item.kind).toBeDefined();
			expect(item.title).toBeDefined();
			expect(item.createdAt).toBeDefined();
		});

		it("includes auto-events from status changes", async () => {
			await api.patch(
				`/api/v1/leads/${leadId}`,
				{ status: "interested" },
				salesToken,
			);
			const res = await api.get(`/api/v1/leads/${leadId}/timeline`, salesToken);
			const titles = res.body.data.items.map((i: { title: string }) => i.title);
			expect(
				titles.some((t: string) => t.includes("Status changed to interested")),
			).toBe(true);
		});
	});

	it("returns 403 for SALES on a foreign lead", async () => {
		const otherSales = await createUser({
			role: "SALES",
			email: "stranger@timeline.local",
		});
		const otherToken = makeToken("SALES", {
			sub: otherSales.id,
			email: otherSales.email,
		});
		const res = await api.get(`/api/v1/leads/${leadId}/timeline`, otherToken);
		expect(res.status).toBe(403);
	});
});
