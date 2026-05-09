import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../../config/env";

export function verifyGoogleSignature(
	rawBody: Buffer,
	signature: string,
): boolean {
	const secret = env.GOOGLE_ADS_WEBHOOK_SECRET;
	if (!secret) {
		console.warn(
			"[webhook] GOOGLE_ADS_WEBHOOK_SECRET not set — skipping signature check",
		);
		return true;
	}

	try {
		const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
		const sigBuf = Buffer.from(signature);
		const expBuf = Buffer.from(expected);
		if (sigBuf.length !== expBuf.length) return false;
		return timingSafeEqual(sigBuf, expBuf);
	} catch {
		return false;
	}
}
