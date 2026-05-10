import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import type { UserRole } from "../src/shared/types/auth";
import { app } from "./setup";

// ── Auth ──────────────────────────────────────────────────────────────────────

export function makeToken(
	role: UserRole,
	overrides: Partial<{ sub: string; email: string }> = {},
): string {
	return jwt.sign(
		{
			sub: overrides.sub ?? "00000000-0000-0000-0000-000000000001",
			email: overrides.email ?? `${role.toLowerCase()}@test.local`,
			role,
		},
		process.env.JWT_ACCESS_SECRET ?? "",
		{ expiresIn: "15m" },
	);
}

// ── HTTP wrapper ──────────────────────────────────────────────────────────────

function bearer(token?: string) {
	return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
	get: (path: string, token?: string) =>
		request(app).get(path).set(bearer(token)),

	post: (path: string, body: unknown, token?: string) =>
		request(app).post(path).set(bearer(token)).send(body),

	patch: (path: string, body: unknown, token?: string) =>
		request(app).patch(path).set(bearer(token)).send(body),

	delete: (path: string, token?: string) =>
		request(app).delete(path).set(bearer(token)),

	// Default to application/octet-stream so superagent sends raw bytes (not JSON-serialized Buffer)
	postRaw: (path: string, body: Buffer, headers: Record<string, string>) =>
		request(app)
			.post(path)
			.set({ "content-type": "application/octet-stream", ...headers })
			.send(body),
};

// ── HMAC signers ──────────────────────────────────────────────────────────────

export function googleSignature(
	body: string | Buffer,
	secret = process.env.GOOGLE_ADS_WEBHOOK_SECRET ?? "",
): string {
	return createHmac("sha256", secret).update(body).digest("hex");
}
