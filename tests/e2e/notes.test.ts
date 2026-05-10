import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createLead, createUser, truncateAll } from "../setup";

describe("Notes API", () => {
	let salesAToken: string;
	let salesAId: string;
	let salesBToken: string;
	let adminToken: string;
	let leadId: string;

	beforeAll(async () => {
		await truncateAll();

		const a = await createUser({ role: "SALES", email: "a@notes.local" });
		salesAId = a.id;
		salesAToken = makeToken("SALES", { sub: a.id, email: a.email });

		const b = await createUser({ role: "SALES", email: "b@notes.local" });
		salesBToken = makeToken("SALES", { sub: b.id, email: b.email });

		const admin = await createUser({ role: "ADMIN", email: "admin@notes.local" });
		adminToken = makeToken("ADMIN", { sub: admin.id, email: admin.email });

		const lead = await createLead({ assignedUserId: salesAId });
		leadId = lead.id;
	});

	afterAll(truncateAll);

	it("creates a note (author = caller)", async () => {
		const res = await api.post(
			`/api/v1/leads/${leadId}/notes`,
			{ content: "Called and left voicemail" },
			salesAToken,
		);
		expect(res.status).toBe(201);
		expect(res.body.data.userId).toBe(salesAId);
		expect(res.body.data.content).toBe("Called and left voicemail");
	});

	it("rejects empty content (400)", async () => {
		const res = await api.post(
			`/api/v1/leads/${leadId}/notes`,
			{ content: "" },
			salesAToken,
		);
		expect(res.status).toBe(400);
	});

	it("lists notes with author projection", async () => {
		const res = await api.get(`/api/v1/leads/${leadId}/notes`, salesAToken);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.data)).toBe(true);
		expect(res.body.data[0].user).toBeDefined();
		expect(res.body.data[0].user.email).toContain("@notes.local");
	});

	it("author can edit their own note", async () => {
		const created = await api.post(
			`/api/v1/leads/${leadId}/notes`,
			{ content: "Editable" },
			salesAToken,
		);
		const noteId = created.body.data.id;

		const upd = await api.patch(
			`/api/v1/leads/${leadId}/notes/${noteId}`,
			{ content: "Edited" },
			salesAToken,
		);
		expect(upd.status).toBe(200);
		expect(upd.body.data.content).toBe("Edited");
	});

	it("non-author SALES is blocked at lead access (403) before note ownership", async () => {
		const created = await api.post(
			`/api/v1/leads/${leadId}/notes`,
			{ content: "Foreign-touch" },
			salesAToken,
		);
		const noteId = created.body.data.id;

		// salesB isn't assigned the lead → blocked before reaching the note check
		const res = await api.patch(
			`/api/v1/leads/${leadId}/notes/${noteId}`,
			{ content: "stolen" },
			salesBToken,
		);
		expect(res.status).toBe(403);
	});

	it("ADMIN can edit anyone's note", async () => {
		const created = await api.post(
			`/api/v1/leads/${leadId}/notes`,
			{ content: "Admin will overwrite" },
			salesAToken,
		);
		const noteId = created.body.data.id;

		const res = await api.patch(
			`/api/v1/leads/${leadId}/notes/${noteId}`,
			{ content: "Overwritten by admin" },
			adminToken,
		);
		expect(res.status).toBe(200);
		expect(res.body.data.content).toBe("Overwritten by admin");
	});

	it("author can delete their own note", async () => {
		const created = await api.post(
			`/api/v1/leads/${leadId}/notes`,
			{ content: "Delete me" },
			salesAToken,
		);
		const noteId = created.body.data.id;

		const res = await api.delete(
			`/api/v1/leads/${leadId}/notes/${noteId}`,
			salesAToken,
		);
		expect(res.status).toBe(200);
	});
});
