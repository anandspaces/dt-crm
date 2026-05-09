import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../../shared/utils/crypto";
import { fail } from "../../shared/utils/response";

export function authenticate(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const authHeader = req.headers.authorization;
	if (!authHeader?.startsWith("Bearer ")) {
		fail(res, 401, "Missing or malformed Authorization header", {
			code: "UNAUTHORIZED",
		});
		return;
	}

	const token = authHeader.slice(7);
	try {
		req.user = verifyAccessToken(token);
		next();
	} catch {
		fail(res, 401, "Access token is invalid or expired", {
			code: "UNAUTHORIZED",
		});
	}
}

export function optionalAuth(
	req: Request,
	_res: Response,
	next: NextFunction,
): void {
	const authHeader = req.headers.authorization;
	if (authHeader?.startsWith("Bearer ")) {
		try {
			req.user = verifyAccessToken(authHeader.slice(7));
		} catch {
			// invalid token → treat as unauthenticated
		}
	}
	next();
}
