import { eq } from "drizzle-orm";
import express, { Router } from "express";
import { db } from "../../config/db";
import { webhookEvents } from "../../db/schema";
import { logger } from "../../shared/utils/logger";
import { fail, ok } from "../../shared/utils/response";
import { processGoogleWebhook } from "../integrations/google-ads/google-ads.service";
import { verifyGoogleSignature } from "../integrations/google-ads/google-ads.webhook";

const router = Router();

router.post(
	"/google",
	// Raw body parser — must come before global express.json()
	express.raw({ type: "*/*" }),
	async (req, res) => {
		const rawBody = req.body as Buffer;
		const signature = req.headers["x-goog-signature"] as string | undefined;

		if (!signature || !verifyGoogleSignature(rawBody, signature)) {
			fail(res, 401, "Invalid webhook signature", { code: "UNAUTHORIZED" });
			return;
		}

		let payload: Record<string, unknown>;
		try {
			payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
		} catch {
			fail(res, 400, "Invalid JSON payload", { code: "VALIDATION_ERROR" });
			return;
		}

		// Store raw event first
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

		// Respond immediately — process asynchronously (fire-and-forget)
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
	},
);

export default router;
