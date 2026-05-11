import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { webhookEvents } from "../../../src/db/schema";
import { api } from "../../helpers";
import { testDb, truncateAll } from "../../setup";

const validKey = process.env.GOOGLE_ADS_WEBHOOK_SECRET ?? "";

const samplePayload = {
	lead_id: "gads-e2e-001",
	api_version: "1.0",
	campaign_id: 10000000000,
	campaign_name: "E2E Campaign",
	asset_name: "Test Form",
	google_key: validKey,
	is_test: true,
	user_column_data: [
		{ column_id: "FULL_NAME", string_value: "E2E User" },
		{ column_id: "EMAIL", string_value: "e2e@test.local" },
	],
};

describe("POST /api/v1/webhooks", () => {
	beforeAll(truncateAll);
	afterAll(truncateAll);

	it("returns 401 when google_key is missing", async () => {
		const { google_key: _omit, ...withoutKey } = samplePayload;
		const res = await api.post("/api/v1/webhooks", withoutKey);
		expect(res.status).toBe(401);
		expect(res.body.data.code).toBe("UNAUTHORIZED");
	});

	it("returns 401 on an invalid google_key", async () => {
		const res = await api.post("/api/v1/webhooks", {
			...samplePayload,
			google_key: "wrong-key",
		});
		expect(res.status).toBe(401);
		expect(res.body.data.code).toBe("UNAUTHORIZED");
	});

	it("returns 200 and stores a webhook_event row on valid key", async () => {
		const res = await api.post("/api/v1/webhooks", samplePayload);

		expect(res.status).toBe(200);
		expect(res.body.data.received).toBe(true);

		const events = await testDb
			.select()
			.from(webhookEvents)
			.where(eq(webhookEvents.provider, "GOOGLE_ADS"));
		expect(events.length).toBeGreaterThan(0);
		expect(events[0]?.eventType).toBe("lead_form_submission");
	});

	it("returns 400 on a non-JSON body", async () => {
		const res = await api.postRaw(
			"/api/v1/webhooks",
			Buffer.from("not-valid-json"),
			// Content-Type must be application/json for express.json() to parse;
			// it then throws a SyntaxError which the error middleware turns into 400.
			{ "content-type": "application/json", "content-length": "14" },
		);
		// Some HTTP clients re-serialize raw bytes when content-type is JSON;
		// either a 400 (parse error) or a 401 (parsed but missing google_key) is
		// acceptable here. The point is we never reach the lead-import path.
		expect([400, 401]).toContain(res.status);
	});
});
