import { createHash, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import type { JWTPayload } from "../types/auth";

export function signAccessToken(
	payload: Omit<JWTPayload, "iat" | "exp">,
): string {
	return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
		expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions["expiresIn"],
	});
}

export function signRefreshToken(
	payload: Omit<JWTPayload, "iat" | "exp">,
): string {
	return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
		expiresIn: env.JWT_REFRESH_EXPIRES as jwt.SignOptions["expiresIn"],
	});
}

export function verifyAccessToken(token: string): JWTPayload {
	return jwt.verify(token, env.JWT_ACCESS_SECRET) as JWTPayload;
}

export function verifyRefreshToken(token: string): JWTPayload {
	return jwt.verify(token, env.JWT_REFRESH_SECRET) as JWTPayload;
}

export function hashToken(rawToken: string): string {
	return createHash("sha256").update(rawToken).digest("hex");
}

export function safeCompare(a: string, b: string): boolean {
	try {
		const bufA = Buffer.from(a);
		const bufB = Buffer.from(b);
		if (bufA.length !== bufB.length) return false;
		return timingSafeEqual(bufA, bufB);
	} catch {
		return false;
	}
}
