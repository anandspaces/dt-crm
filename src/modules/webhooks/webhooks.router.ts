import { eq } from "drizzle-orm";
import express, { Router } from "express";
import { db } from "../../config/db";
import { webhookEvents } from "../../db/schema";
import { logger } from "../../shared/utils/logger";
import { fail, ok } from "../../shared/utils/response";
import { processGoogleWebhook } from "../integrations/google-ads/google-ads.service";
import { verifyGoogleKey } from "../integrations/google-ads/google-ads.webhook";

const router = Router();

// Inline JSON parser — the global express.json() is mounted AFTER the webhooks
// router in index.ts (so the legacy raw-body HMAC route could see bytes). Google
// Ads lead-form webhooks authenticate with a `google_key` body field instead of
// a header signature, so JSON parsing is fine here.
const jsonParser = express.json({ limit: "1mb" });

// Google Ads lead-form webhook.
// URL configured in the Google Ads UI: https://<host>/api/v1/webhooks
// Auth: payload contains a `google_key` field whose value must match
// env.GOOGLE_ADS_WEBHOOK_SECRET (the "Key" field in the Google Ads UI).
router.post("/", jsonParser, async (req, res) => {
	const payload = req.body as Record<string, unknown> | undefined;

	if (!payload || typeof payload !== "object") {
		fail(res, 400, "Invalid JSON payload", { code: "VALIDATION_ERROR" });
		return;
	}

	if (!verifyGoogleKey(payload)) {
		fail(res, 401, "Invalid webhook key", { code: "UNAUTHORIZED" });
		return;
	}

	const [event] = await db
		.insert(webhookEvents)
		.values({
			provider: "GOOGLE_ADS",
			eventType: "lead_form_submission",
			payloadJson: payload,
		})
		.returning({ id: webhookEvents.id });

	if (!event) {
		fail(res, 500, "Failed to store webhook event", {
			code: "INTERNAL_ERROR",
		});
		return;
	}

	// Respond 200 immediately — Google Ads marks the integration as failed
	// if we don't ack within a few seconds. Process the lead async.
	ok(res, { received: true }, "Webhook received");

	processGoogleWebhook(event.id, payload).catch((err: unknown) => {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error(
			`[webhook] Google Ads processing failed for event ${event.id}:`,
			msg,
		);

		db.update(webhookEvents)
			.set({ errorMessage: msg })
			.where(eq(webhookEvents.id, event.id))
			.catch((e) =>
				logger.error("[webhook] Failed to update errorMessage:", e),
			);
	});
});

export default router;
