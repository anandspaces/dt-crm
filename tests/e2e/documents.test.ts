import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createLead, createUser, truncateAll } from "../setup";

describe("Documents API", () => {
	let salesToken: string;
	let salesId: string;
	let otherSalesToken: string;
	let leadId: string;

	beforeAll(async () => {
		await truncateAll();
		const sales = await createUser({
			role: "SALES",
			email: "sales@docs.local",
		});
		salesId = sales.id;
		salesToken = makeToken("SALES", { sub: sales.id, email: sales.email });

		const other = await createUser({
			role: "SALES",
			email: "other@docs.local",
		});
		otherSalesToken = makeToken("SALES", { sub: other.id, email: other.email });

		const lead = await createLead({ assignedUserId: salesId });
		leadId = lead.id;
	});

	afterAll(truncateAll);

	describe("POST /documents (JSON metadata)", () => {
		it("rejects missing required fields", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/documents`,
				{ name: "x" },
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("creates a document record from a pre-uploaded URL", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/documents`,
				{
					name: "Floor Plan A.pdf",
					mimeType: "application/pdf",
					sizeBytes: 2516582,
					url: "https://files.example.com/docs/abc.pdf",
				},
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.name).toBe("Floor Plan A.pdf");
			expect(res.body.data.url).toContain("https://files.example.com/");
		});
	});

	describe("POST /documents/upload (multipart)", () => {
		it("rejects missing file (400)", async () => {
			const res = await api.post(
				`/api/v1/leads/${leadId}/documents/upload`,
				{},
				salesToken,
			);
			expect(res.status).toBe(400);
		});

		it("uploads a small file and returns a Document object", async () => {
			const res = await api.postFile(
				`/api/v1/leads/${leadId}/documents/upload`,
				"file",
				"brochure.pdf",
				Buffer.from("%PDF-1.4 fake content"),
				"application/pdf",
				salesToken,
			);
			expect(res.status).toBe(201);
			expect(res.body.data.name).toBe("brochure.pdf");
			expect(res.body.data.mimeType).toBe("application/pdf");
			expect(res.body.data.sizeBytes).toBeGreaterThan(0);
		});
	});

	describe("GET /documents", () => {
		it("lists all documents for the lead", async () => {
			const res = await api.get(
				`/api/v1/leads/${leadId}/documents`,
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.data.documents)).toBe(true);
			expect(res.body.data.documents.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("DELETE /documents/:docId", () => {
		it("uploader can delete their own", async () => {
			const created = await api.post(
				`/api/v1/leads/${leadId}/documents`,
				{
					name: "Owned.pdf",
					mimeType: "application/pdf",
					sizeBytes: 100,
					url: "https://files.example.com/owned.pdf",
				},
				salesToken,
			);
			const docId = created.body.data.id;

			const res = await api.delete(
				`/api/v1/leads/${leadId}/documents/${docId}`,
				salesToken,
			);
			expect(res.status).toBe(200);
			expect(res.body.data).toBeNull();
		});

		it("non-author SALES on a foreign lead is blocked at lead access (403)", async () => {
			const created = await api.post(
				`/api/v1/leads/${leadId}/documents`,
				{
					name: "Foreign.pdf",
					mimeType: "application/pdf",
					sizeBytes: 100,
					url: "https://files.example.com/foreign.pdf",
				},
				salesToken,
			);
			const docId = created.body.data.id;

			const res = await api.delete(
				`/api/v1/leads/${leadId}/documents/${docId}`,
				otherSalesToken,
			);
			expect(res.status).toBe(403);
		});
	});
});
