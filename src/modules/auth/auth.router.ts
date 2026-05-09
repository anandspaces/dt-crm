import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, noContent, ok } from "../../shared/utils/response";
import { optionalAuth } from "./auth.middleware";
import {
	forgotPasswordSchema,
	loginSchema,
	refreshSchema,
	registerSchema,
	resetPasswordSchema,
} from "./auth.schema";
import * as authService from "./auth.service";

const router = Router();

router.post(
	"/register",
	optionalAuth,
	validate(registerSchema),
	async (req, res) => {
		const result = await authService.register(req.body, req.user);
		created(res, result);
	},
);

router.post("/login", validate(loginSchema), async (req, res) => {
	const result = await authService.login(req.body);
	ok(res, result);
});

router.post("/refresh", validate(refreshSchema), async (req, res) => {
	const tokens = await authService.refresh(req.body.refreshToken);
	ok(res, tokens);
});

router.post("/logout", validate(refreshSchema), async (req, res) => {
	await authService.logout(req.body.refreshToken);
	noContent(res);
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

export default router;
