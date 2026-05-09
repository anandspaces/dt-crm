import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../types/auth";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";

export function guard(...roles: UserRole[]) {
	return (_req: Request, _res: Response, next: NextFunction): void => {
		const user = _req.user;
		if (!user) {
			throw new UnauthorizedError();
		}
		if (!roles.includes(user.role)) {
			throw new ForbiddenError(`Requires one of: ${roles.join(", ")}`);
		}
		next();
	};
}
