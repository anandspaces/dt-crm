// Load and validate all env vars at startup — crashes immediately if invalid

import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { WebSocketServer } from "ws";
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
import leadsRouter from "./modules/leads/leads.router";
import pipelinesRouter from "./modules/pipelines/pipelines.router";
import usersRouter from "./modules/users/users.router";
import vobizRouter from "./modules/vobiz/vobiz.router";
import { attachVoiceStreamHandlers } from "./modules/voice-stream/voice-stream.handler";
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
app.use("/api/v1/leads", authenticate, leadsRouter);
app.use("/api/v1/contacts", authenticate, contactsRouter);
app.use("/api/v1/accounts", authenticate, accountsRouter);
app.use("/api/v1/deals", authenticate, dealsRouter);
app.use("/api/v1/pipelines", authenticate, pipelinesRouter);
app.use("/api/v1/followups", authenticate, followupsGlobalRouter);
app.use("/api/v1/ai-agents", authenticate, aiAgentsRouter);
app.use("/api/v1/call-batches", authenticate, callBatchesRouter);

// ─── Static uploads ──────────────────────────────────────────────────────────
// Single root for every file this backend persists:
//   uploads/leads/<leadId>/<file>            — lead documents
//   uploads/calls/<batchId>/<itemId>/...     — recording.mp3, transcript.txt, …
// URL prefix matches the on-disk layout, so storage keys map 1:1 to URLs and
// to GCS object keys when we cut over.
app.use("/uploads", express.static(UPLOADS_DIR));

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

	// Wrap Express in a Node http.Server so we can attach a WebSocket upgrade
	// listener on the SAME port. This matches dextora_crm and lets a single
	// ngrok tunnel cover both HTTP routes and the wss://.../voice-stream audio
	// bridge that Vobiz dials.
	const httpServer = createServer(app);
	const wss = new WebSocketServer({ noServer: true });

	httpServer.on("upgrade", (request, socket, head) => {
		const url = new URL(request.url ?? "/", "http://localhost");
		if (url.pathname !== "/voice-stream") {
			socket.destroy();
			return;
		}
		wss.handleUpgrade(request, socket, head, (ws) => {
			attachVoiceStreamHandlers(ws, request);
		});
	});

	httpServer.listen(env.PORT, () => {
		logger.info("server up", {
			url: `http://localhost:${env.PORT}`,
			env: env.NODE_ENV,
			voiceStream: "/voice-stream (same port)",
		});
	});
}

if (import.meta.main) {
	start();
}

export default app;
