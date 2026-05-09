// Load and validate all env vars at startup — crashes immediately if invalid

import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";

import { authenticate } from "./modules/auth/auth.middleware";
import authRouter from "./modules/auth/auth.router";
import followupsGlobalRouter from "./modules/followups/followups-global.router";
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

const app = express();

// Security headers
app.use(helmet());
app.use(
	cors({
		origin: env.CORS_ORIGIN === "*" ? "*" : env.CORS_ORIGIN.split(","),
		credentials: true,
	}),
);

// ─── Webhook routes — MUST be before express.json() ──────────────────────────
// Webhooks use express.raw() inline for HMAC signature verification
app.use("/api/v1/webhooks", webhookLimiter, webhooksRouter);

// ─── JSON body parser for all other routes ───────────────────────────────────
app.use(express.json());

// ─── Rate limiting ────────────────────────────────────────────────────────────
app.use("/api/v1/auth/login", loginLimiter);
app.use("/api", globalApiLimiter);

// ─── Public auth routes ───────────────────────────────────────────────────────
app.use("/api/v1/auth", authRouter);

// ─── Protected routes (all require valid JWT) ─────────────────────────────────
app.use("/api/v1/users", authenticate, usersRouter);
app.use("/api/v1/leads", authenticate, leadsRouter);
app.use("/api/v1/pipelines", authenticate, pipelinesRouter);
app.use("/api/v1/followups", authenticate, followupsGlobalRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
	res.json({ status: "ok", env: env.NODE_ENV });
});

// ─── Global error handler (must be last) ─────────────────────────────────────
app.use(errorMiddleware);

app.listen(env.PORT, () => {
	console.log(
		`[server] Dextora CRM running on http://localhost:${env.PORT} (${env.NODE_ENV})`,
	);
});

export default app;
