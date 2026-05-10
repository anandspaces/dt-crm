import type { Response } from "express";

/**
 * All JSON API responses use this shape (including errors via `fail`):
 * `{ status, message, data }` — see `envelopeStatus` for `status` values.
 * HTTP status codes are set only on the response line, not duplicated as HTTP in `status`.
 */
export const envelopeStatus = {
	/** Operation succeeded */
	success: 1,
	/** Neutral / unused by default; reserved for domain-specific envelopes */
	neutral: 0,
	/** Operation failed (paired with appropriate HTTP status on the wire) */
	error: -1,
	/** Reserved for warning / partial success if needed later */
	warning: 2,
} as const;

export function ok<T>(res: Response, data: T, message = "OK"): void {
	res.status(200).json({ status: envelopeStatus.success, message, data });
}

export function created<T>(res: Response, data: T, message = "Created"): void {
	res.status(201).json({ status: envelopeStatus.success, message, data });
}

/** Successful delete / deactivate: HTTP 200 with `data: null` (same envelope as `ok`). */
export function deleted(res: Response, message = "Deleted"): void {
	ok(res, null, message);
}

export function fail(
	res: Response,
	httpStatus: number,
	message: string,
	data?: unknown,
): void {
	res
		.status(httpStatus)
		.json({
			status: envelopeStatus.error,
			message,
			data: data ?? null,
		});
}
