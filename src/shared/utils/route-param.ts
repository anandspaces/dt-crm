import type { Request } from "express";
import type { JWTPayload } from "../types/auth";
import { AppError } from "./errors";

type ParamsRecord = Record<string, string | string[] | undefined>;

/** Express 5 types each param as `string | string[]`; collapse to a single string. */
export function routeParam(value: string | string[] | undefined): string {
	const v = Array.isArray(value) ? value[0] : value;
	if (typeof v !== "string" || v.length === 0) {
		throw new AppError(400, "BAD_REQUEST", "Invalid route parameter");
	}
	return v;
}

/** With `mergeParams: true`, parent keys (e.g. `leadId`) are omitted from Express's inferred `req.params` on child routes like `/:noteId`. */
export function mergedParam(req: Request, key: string): string {
	return routeParam((req.params as ParamsRecord)[key]);
}

export function reqUser(req: Request): JWTPayload {
	if (!req.user) throw new Error("Unauthenticated");
	return req.user;
}
