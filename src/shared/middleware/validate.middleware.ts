import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { fail } from "../utils/response";

export function validate(
	schema: ZodTypeAny,
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
		Object.assign(req, { [target]: result.data });
		next();
	};
}
