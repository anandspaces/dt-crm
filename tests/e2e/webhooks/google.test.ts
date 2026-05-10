import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { webhookEvents } from "../../../src/db/schema";
import { api, googleSignature } from "../../helpers";
import { testDb, truncateAll } from "../../setup";

const samplePayload = {
	lead_id: "gads-e2e-001",
	campaign_name: "E2E Campaign",
	form_name: "Test Form",
	is_test: true,
	user_column_data: [
		{ column_name: "FULL_NAME", string_value: "E2E User" },
		{ column_name: "EMAIL", string_value: "e2e@test.local" },
	],
};

describe("POST /api/v1/webhooks/google", () => {
	beforeAll(truncateAll);
	afterAll(truncateAll);

	it("returns 401 when x-goog-signature header is missing", async () => {
		const body = Buffer.from(JSON.stringify(samplePayload));
		// postRaw defaults to application/octet-stream — no signature header
		const res = await api.postRaw("/api/v1/webhooks/google", body, {});
		expect(res.status).toBe(401);
		expect(res.body.data.code).toBe("UNAUTHORIZED");
	});

	it("returns 401 on an invalid signature", async () => {
		const body = Buffer.from(JSON.stringify(samplePayload));
		const res = await api.postRaw("/api/v1/webhooks/google", body, {
			"x-goog-signature": "bad-signature",
		});
		expect(res.status).toBe(401);
		expect(res.body.data.code).toBe("UNAUTHORIZED");
	});

	it("returns 200 and stores a webhook_event row on valid HMAC payload", async () => {
		const body = Buffer.from(JSON.stringify(samplePayload));
		const sig = googleSignature(body);

		const res = await api.postRaw("/api/v1/webhooks/google", body, {
			"x-goog-signature": sig,
		});

		expect(res.status).toBe(200);
		expect(res.body.data.received).toBe(true);

		// Verify the event was persisted synchronously
		const events = await testDb
			.select()
			.from(webhookEvents)
			.where(eq(webhookEvents.provider, "GOOGLE_ADS"));
		expect(events.length).toBeGreaterThan(0);
		expect(events[0]?.eventType).toBe("lead_form_submission");
	});

	it("returns 400 on valid signature but non-JSON body", async () => {
		const body = Buffer.from("not-valid-json");
		const sig = googleSignature(body);

		const res = await api.postRaw("/api/v1/webhooks/google", body, {
			"x-goog-signature": sig,
		});
		expect(res.status).toBe(400);
		expect(res.body.data.code).toBe("VALIDATION_ERROR");
	});
});
