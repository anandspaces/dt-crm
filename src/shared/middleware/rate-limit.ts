import { rateLimit } from "express-rate-limit";

export const globalApiLimiter = rateLimit({
	windowMs: 60_000,
	max: 200,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		status: 429,
		message: "Too many requests",
		data: { code: "RATE_LIMITED" },
	},
});

export const loginLimiter = rateLimit({
	windowMs: 15 * 60_000,
	max: 10,
	skipSuccessfulRequests: true,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		status: 429,
		message: "Too many login attempts",
		data: { code: "RATE_LIMITED" },
	},
});

export const webhookLimiter = rateLimit({
	windowMs: 60_000,
	max: 500,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		status: 429,
		message: "Too many requests",
		data: { code: "RATE_LIMITED" },
	},
});
