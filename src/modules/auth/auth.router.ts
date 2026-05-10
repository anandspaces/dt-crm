import { Router } from "express";
import { otpLimiter } from "../../shared/middleware/rate-limit";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, ok } from "../../shared/utils/response";
import { optionalAuth } from "./auth.middleware";
import {
	forgotPasswordSchema,
	loginSchema,
	registerSchema,
	resetPasswordSchema,
	sendOtpSchema,
	verifyOtpSchema,
} from "./auth.schema";
import * as authService from "./auth.service";

const router = Router();

router.post(
	"/register",
	optionalAuth,
	validate(registerSchema),
	async (req, res) => {
		await authService.register(req.body, req.user);
		await authService.sendOtp(req.body.email);
		created(res, { message: "Account created. Please verify your email." });
	},
);

router.post("/login", validate(loginSchema), async (req, res) => {
	const result = await authService.login(req.body);
	ok(res, result);
});

router.post(
	"/forgot-password",
	validate(forgotPasswordSchema),
	async (req, res) => {
		await authService.forgotPassword(req.body.email);
		ok(res, { message: "If the email exists, a reset link has been sent" });
	},
);

router.post(
	"/reset-password",
	validate(resetPasswordSchema),
	async (req, res) => {
		await authService.resetPassword(req.body.token, req.body.password);
		ok(res, { message: "Password reset successfully" });
	},
);

router.post(
	"/send-otp",
	otpLimiter,
	validate(sendOtpSchema),
	async (req, res) => {
		await authService.sendOtp(req.body.email);
		ok(res, { message: "If the email exists, an OTP has been sent" });
	},
);

router.post("/verify-otp", validate(verifyOtpSchema), async (req, res) => {
	const result = await authService.verifyOtp(req.body.email, req.body.otp);
	ok(res, result);
});

export default router;
