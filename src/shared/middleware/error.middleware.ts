import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { fail } from "../utils/response";

export function errorMiddleware(
	err: unknown,
	_req: Request,
	res: Response,
	_next: NextFunction,
): void {
	if (err instanceof AppError) {
		fail(res, err.statusCode, err.message, { code: err.code });
		return;
	}

	if (err instanceof Error) {
		logger.error("[unhandled error]", err.message, err.stack);
	} else {
		logger.error("[unhandled error]", err);
	}

	fail(res, 500, "An unexpected error occurred", { code: "INTERNAL_ERROR" });
}
