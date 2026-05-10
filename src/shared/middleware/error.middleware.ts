import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { fail } from "../utils/response";

/**
 * Last-resort handler for synchronous throws + rejected async handlers
 * (Express 5 forwards rejected promises automatically — no asyncHandler needed).
 *
 * AppError subclasses → mapped to their statusCode + envelope code; logged at warn.
 * Body-parser SyntaxError → 400 INVALID_JSON.
 * Anything else → 500 INTERNAL_ERROR; logged at error with stack.
 */
export function errorMiddleware(
	err: unknown,
	req: Request,
	res: Response,
	_next: NextFunction,
): void {
	const ctx = {
		id: req.id,
		method: req.method,
		path: req.originalUrl ?? req.url,
		userId: req.user?.sub,
	};

	if (err instanceof AppError) {
		logger.warn("handled error", {
			...ctx,
			code: err.code,
			status: err.statusCode,
			message: err.message,
		});
		fail(res, err.statusCode, err.message, { code: err.code });
		return;
	}

	if (
		err instanceof SyntaxError &&
		(err as { type?: string }).type === "entity.parse.failed"
	) {
		logger.warn("invalid json body", { ...ctx, code: "INVALID_JSON" });
		fail(res, 400, "Invalid JSON body", { code: "INVALID_JSON" });
		return;
	}

	const isError = err instanceof Error;
	logger.error("unhandled error", {
		...ctx,
		code: "INTERNAL_ERROR",
		message: isError ? err.message : String(err),
		stack: env.NODE_ENV !== "production" && isError ? err.stack : undefined,
	});

	fail(res, 500, "An unexpected error occurred", { code: "INTERNAL_ERROR" });
}
