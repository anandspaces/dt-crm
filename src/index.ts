// Load and validate all env vars at startup — crashes immediately if invalid

import cors from "cors";
import express from "express";
import helmet from "helmet";
import { verifyDatabaseConnection } from "./config/db";
import { env } from "./config/env";

import { authenticate } from "./modules/auth/auth.middleware";
import authRouter from "./modules/auth/auth.router";
import followupsGlobalRouter from "./modules/followups/followups-global.router";
import importsRouter from "./modules/imports/imports.router";
import leadsRouter from "./modules/leads/leads.router";
import pipelinesRouter from "./modules/pipelines/pipelines.router";
import usersRouter from "./modules/users/users.router";
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

const app = express();

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
app.use("/api/v1/pipelines", authenticate, pipelinesRouter);
app.use("/api/v1/followups", authenticate, followupsGlobalRouter);

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

	app.listen(env.PORT, () => {
		logger.info("server up", {
			url: `http://localhost:${env.PORT}`,
			env: env.NODE_ENV,
		});
	});
}

if (import.meta.main) {
	start();
}

export default app;
