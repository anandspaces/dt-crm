import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger, sanitize, truncateForLog } from "../utils/logger";

declare module "express-serve-static-core" {
	interface Request {
		id?: string;
		startTimeMs?: number;
		_loggedRequest?: boolean;
	}
}

const MAX_BODY_BYTES = 2048;
const SKIP_BODY_PATHS = [/^\/api\/v1\/webhooks\//];

function isMultipart(req: Request): boolean {
	const ct = req.headers["content-type"];
	return typeof ct === "string" && ct.toLowerCase().startsWith("multipart/");
}

function authHeader(req: Request): string | undefined {
	const raw = req.headers.authorization;
	if (typeof raw !== "string") return undefined;
	if (raw.toLowerCase().startsWith("bearer ")) {
		const tok = raw.slice(7);
		return `Bearer …${tok.slice(-6)}`;
	}
	return "[REDACTED]";
}

function shouldSkipBody(req: Request): boolean {
	return SKIP_BODY_PATHS.some((re) => re.test(req.path));
}

function reqBodyForLog(req: Request): unknown {
	if (req.method === "GET" || req.method === "DELETE") return undefined;
	if (shouldSkipBody(req)) {
		const len = req.headers["content-length"];
		return `<webhook raw, ${len ?? "?"} bytes>`;
	}
	if (isMultipart(req)) return "<multipart>";
	if (
		!req.body ||
		(typeof req.body === "object" && Object.keys(req.body).length === 0)
	) {
		return undefined;
	}
	return truncateForLog(sanitize(req.body), MAX_BODY_BYTES);
}

function resBodyForLog(payload: unknown): unknown {
	if (payload === undefined) return undefined;
	return truncateForLog(sanitize(payload), MAX_BODY_BYTES);
}

/**
 * Mount FIRST in the middleware chain. Tags the request with a uuid,
 * starts a timer, sets `X-Request-ID`, and hooks `res.json/send` to capture
 * the outgoing payload. Logs the response line on `res.finish`.
 *
 * The request-line log is NOT emitted here because body parsers haven't run
 * yet — use `logRequestBody` AFTER `express.json()` for that. If the request
 * never makes it past the body parser (e.g. webhook routes with raw bodies),
 * the response logger still fires.
 */
export function requestContext(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const id = randomUUID();
	req.id = id;
	req.startTimeMs = Date.now();
	res.setHeader("X-Request-ID", id);

	let captured: unknown;
	const originalJson = res.json.bind(res);
	const originalSend = res.send.bind(res);

	res.json = (body: unknown) => {
		captured = body;
		return originalJson(body);
	};

	res.send = (body: unknown) => {
		if (captured === undefined) captured = body;
		return originalSend(body);
	};

	res.on("finish", () => {
		// If the request line wasn't logged (e.g. webhook path skipped logRequestBody),
		// emit a minimal one now so the correlation pair always exists.
		if (!req._loggedRequest) {
			logger.info("→ request", {
				id,
				method: req.method,
				path: req.originalUrl ?? req.url,
				ip: req.ip,
				auth: authHeader(req),
				body: reqBodyForLog(req),
			});
		}

		const ms = Date.now() - (req.startTimeMs ?? Date.now());
		const status = res.statusCode;
		const lvl = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
		logger[lvl]("← response", {
			id,
			method: req.method,
			path: req.originalUrl ?? req.url,
			status,
			ms,
			userId: req.user?.sub,
			body: resBodyForLog(captured),
		});
	});

	next();
}

/**
 * Mount AFTER `express.json()` so `req.body` is parsed and available to log.
 * Skipped for paths that handle their own body parsing (webhooks).
 */
export function logRequestBody(
	req: Request,
	_res: Response,
	next: NextFunction,
): void {
	logger.info("→ request", {
		id: req.id,
		method: req.method,
		path: req.originalUrl ?? req.url,
		ip: req.ip,
		auth: authHeader(req),
		body: reqBodyForLog(req),
	});
	req._loggedRequest = true;
	next();
}
