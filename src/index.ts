// Load and validate all env vars at startup — crashes immediately if invalid

import cors from "cors";
import express from "express";
import helmet from "helmet";
import { verifyDatabaseConnection } from "./config/db";
import { env } from "./config/env";

import accountsRouter from "./modules/accounts/accounts.router";
import aiAgentsRouter from "./modules/ai-agents/ai-agents.router";
import { authenticate } from "./modules/auth/auth.middleware";
import authRouter from "./modules/auth/auth.router";
import callBatchesRouter from "./modules/call-batches/call-batches.router";
import contactsRouter from "./modules/contacts/contacts.router";
import dealsRouter from "./modules/deals/deals.router";
import followupsGlobalRouter from "./modules/followups/followups-global.router";
import importsRouter from "./modules/imports/imports.router";
import leadsRouter from "./modules/leads/leads.router";
import pipelinesRouter from "./modules/pipelines/pipelines.router";
import usersRouter from "./modules/users/users.router";
import vobizRouter from "./modules/vobiz/vobiz.router";
import {
	handleVoiceStreamClose,
	handleVoiceStreamMessage,
	handleVoiceStreamOpen,
	type VoiceStreamData,
} from "./modules/voice-stream/voice-stream.handler";
import webhooksRouter from "./modules/webhooks/webhooks.router";

import { errorMiddleware } from "./shared/middleware/error.middleware";
import {
	globalApiLimiter,
	loginLimiter,
	webhookLimiter,
} from "./shared/middleware/rate-limit";
import {
	logRequestBody,
	requestContext,
} from "./shared/middleware/request-logger.middleware";
import { logger } from "./shared/utils/logger";
import { UPLOADS_DIR } from "./shared/utils/storage";

const app = express();

if (env.TRUST_PROXY_HOPS !== undefined && env.TRUST_PROXY_HOPS > 0) {
	app.set("trust proxy", env.TRUST_PROXY_HOPS);
}

// Security headers
app.use(helmet());
app.use(cors({ origin: "*", methods: "*", allowedHeaders: "*" }));

// ─── Request context (req.id, timer, response capture) ──────────────────────
// MUST be first so every downstream log line can correlate via req.id.
app.use(requestContext);

// ─── Webhook routes — MUST be before express.json() ──────────────────────────
// Webhooks use express.raw() inline for HMAC signature verification.
// They skip the JSON-aware request-body logger; requestContext still fires
// the response log (and a fallback request log) on finish.
app.use("/api/v1/webhooks", webhookLimiter, webhooksRouter);

// Vobiz telephony webhooks — public (Vobiz calls these). The router brings its
// own express.json + urlencoded middleware so it must mount before the global
// JSON parser to avoid double-parsing the body.
app.use("/api/v1/vobiz", vobizRouter);

// ─── JSON body parser for all other routes ───────────────────────────────────
app.use(express.json({ limit: "10mb" }));

// Now that req.body is parsed, log the request line with the (sanitized) body.
app.use(logRequestBody);

// ─── Rate limiting ────────────────────────────────────────────────────────────
app.use("/api/v1/auth/login", loginLimiter);
app.use("/api", globalApiLimiter);

// ─── Public auth routes ───────────────────────────────────────────────────────
app.use("/api/v1/auth", authRouter);

// ─── Protected routes (all require valid JWT) ─────────────────────────────────
app.use("/api/v1/users", authenticate, usersRouter);
// Imports router mounted under /leads BEFORE leadsRouter so /leads/import wins.
app.use("/api/v1/leads", authenticate, importsRouter);
app.use("/api/v1/leads", authenticate, leadsRouter);
app.use("/api/v1/contacts", authenticate, contactsRouter);
app.use("/api/v1/accounts", authenticate, accountsRouter);
app.use("/api/v1/deals", authenticate, dealsRouter);
app.use("/api/v1/pipelines", authenticate, pipelinesRouter);
app.use("/api/v1/followups", authenticate, followupsGlobalRouter);
app.use("/api/v1/ai-agents", authenticate, aiAgentsRouter);
app.use("/api/v1/call-batches", authenticate, callBatchesRouter);

// ─── Static uploads (lead documents) ──────────────────────────────────────────
// Mirrors the URLs returned by the documents storage helper.
app.use("/uploads", express.static(UPLOADS_DIR));

// ─── Static recordings (call audio + transcript artifacts) ───────────────────
// vobiz.service writes downloaded MP3s to ARTIFACTS_DIR and exposes them as
// `/recordings/{batchId}/{itemId}/recording.mp3` on call_queue_items.recordingUrl
// and lead_calls.recordingUrl. Without this mount the URLs would 404.
app.use("/recordings", express.static(env.ARTIFACTS_DIR));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
	res.json({ status: "ok", env: env.NODE_ENV });
});

// ─── Global error handler (must be last) ─────────────────────────────────────
app.use(errorMiddleware);

// ─── Process-level safety nets ───────────────────────────────────────────────
// Logs and continues on unhandledRejection (a typical app bug — don't crash).
// Logs and exits on uncaughtException (state may be corrupt).
process.on("unhandledRejection", (reason) => {
	const err = reason instanceof Error ? reason : new Error(String(reason));
	logger.error("unhandledRejection", {
		message: err.message,
		stack: env.NODE_ENV !== "production" ? err.stack : undefined,
	});
});

process.on("uncaughtException", (err) => {
	logger.error("uncaughtException", {
		message: err.message,
		stack: env.NODE_ENV !== "production" ? err.stack : undefined,
	});
	// Exit with non-zero so the process supervisor restarts us.
	process.exit(1);
});

function startVoiceStreamServer(): void {
	// Bun's WebSocket server lives on a separate port from Express. Vobiz dials
	// wss://{host}:{WS_PORT}/voice-stream?... — the URL is built in vobiz.service.
	// Skipped silently if WS_PORT isn't configured (calling agent disabled).
	if (!env.WS_PORT) {
		logger.info("voice-stream disabled (WS_PORT not set)");
		return;
	}

	// `Bun` is available globally under the Bun runtime. Guard for tooling that
	// loads this file under plain Node (e.g. type-checkers).
	const bun = (globalThis as { Bun?: typeof Bun }).Bun;
	if (!bun) {
		logger.warn("Bun runtime not detected — /voice-stream will not start");
		return;
	}

	bun.serve<VoiceStreamData, never>({
		port: env.WS_PORT,
		fetch(req, server) {
			const url = new URL(req.url);
			if (url.pathname !== "/voice-stream") {
				return new Response("Not found", { status: 404 });
			}
			const data: VoiceStreamData = {
				batchId: url.searchParams.get("batchId") ?? "",
				itemId: url.searchParams.get("itemId") ?? "",
				userId: url.searchParams.get("userId") ?? "",
				callUuid: url.searchParams.get("callUuid") ?? "",
				streamId: "",
				transcript: [],
				liveSession: null,
				closing: false,
				artifactDir: "",
			};
			if (!data.batchId || !data.itemId) {
				return new Response("missing batchId/itemId", { status: 400 });
			}
			if (server.upgrade(req, { data })) return undefined;
			return new Response("upgrade failed", { status: 400 });
		},
		websocket: {
			open: (ws) => {
				void handleVoiceStreamOpen(ws);
			},
			message: (ws, message) => {
				handleVoiceStreamMessage(ws, message);
			},
			close: (ws) => {
				void handleVoiceStreamClose(ws);
			},
		},
	});

	logger.info("voice-stream up", { port: env.WS_PORT });
}

async function start(): Promise<void> {
	try {
		await verifyDatabaseConnection();
		logger.info("db connected");
	} catch (err) {
		logger.error("db connection failed", {
			message: err instanceof Error ? err.message : String(err),
		});
		process.exit(1);
	}

	app.listen(env.PORT, () => {
		logger.info("server up", {
			url: `http://localhost:${env.PORT}`,
			env: env.NODE_ENV,
		});
	});

	startVoiceStreamServer();
}

if (import.meta.main) {
	start();
}

export default app;
