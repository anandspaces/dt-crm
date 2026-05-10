import { rateLimit } from "express-rate-limit";
import { envelopeStatus } from "../utils/response";

export const globalApiLimiter = rateLimit({
	windowMs: 60_000,
	max: 200,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		status: envelopeStatus.error,
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
		status: envelopeStatus.error,
		message: "Too many login attempts",
		data: { code: "RATE_LIMITED" },
	},
});

export const otpLimiter = rateLimit({
	windowMs: 15 * 60_000,
	max: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		status: envelopeStatus.error,
		message: "Too many OTP requests, please try again later",
		data: { code: "RATE_LIMITED" },
	},
});

export const webhookLimiter = rateLimit({
	windowMs: 60_000,
	max: 500,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		status: envelopeStatus.error,
		message: "Too many requests",
		data: { code: "RATE_LIMITED" },
	},
});
