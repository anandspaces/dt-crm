import { timingSafeEqual } from "node:crypto";
import { env } from "../../../config/env";
import { logger } from "../../../shared/utils/logger";

/**
 * Google Ads lead-form webhooks authenticate via a shared key embedded in the
 * JSON body (`google_key`), not via an HMAC header signature. The value must
 * match the "Key" configured in the Google Ads UI (and stored here as
 * env.GOOGLE_ADS_WEBHOOK_SECRET).
 */
export function verifyGoogleKey(payload: Record<string, unknown>): boolean {
	const secret = env.GOOGLE_ADS_WEBHOOK_SECRET;
	if (!secret) {
		logger.warn(
			"[webhook] GOOGLE_ADS_WEBHOOK_SECRET not set — accepting all keys (dev only)",
		);
		return true;
	}

	const provided = payload.google_key;
	if (typeof provided !== "string" || provided.length === 0) return false;

	const a = Buffer.from(provided);
	const b = Buffer.from(secret);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
