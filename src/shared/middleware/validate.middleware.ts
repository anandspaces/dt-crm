import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { fail } from "../utils/response";

export function validate(
	schema: ZodType,
	target: "body" | "query" | "params" = "body",
) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const result = schema.safeParse(req[target]);
		if (!result.success) {
			fail(res, 400, "Validation failed", {
				code: "VALIDATION_ERROR",
				errors: result.error.issues,
			});
			return;
		}
		// req.query is a non-writable getter in Express v5; Object.defineProperty works for all targets
		Object.defineProperty(req, target, {
			value: result.data,
			writable: true,
			configurable: true,
			enumerable: true,
		});
		next();
	};
}
