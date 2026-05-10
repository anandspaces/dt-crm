import { Router } from "express";
import { otpLimiter } from "../../shared/middleware/rate-limit";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, ok } from "../../shared/utils/response";
import { reqUser } from "../../shared/utils/route-param";
import { authenticate, optionalAuth } from "./auth.middleware";
import {
	forgotPasswordSchema,
	loginSchema,
	onboardingSchema,
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
		const status = await authService.register(req.body, req.user);
		await authService.sendOtp(req.body.email);
		const message =
			status === "pending_verification"
				? "Email registered, pending verification"
				: "Account created. Please verify your email.";
		created(res, { message });
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

router.post(
	"/onboarding",
	authenticate,
	validate(onboardingSchema),
	async (req, res) => {
		const user = await authService.completeOnboarding(req.body, reqUser(req));
		ok(res, user);
	},
);

export default router;
