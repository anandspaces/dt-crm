import { z } from "zod";

export const registerSchema = z.object({
	name: z.string().min(2).max(255),
	email: z.email(),
	password: z.string().min(8),
	role: z.enum(["ADMIN", "MANAGER", "SALES", "SUPPORT"]).default("SALES"),
});

export const loginSchema = z.object({
	email: z.email(),
	password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
	email: z.email(),
});

export const sendOtpSchema = z.object({
	email: z.email(),
});

export const verifyOtpSchema = z.object({
	email: z.email(),
	otp: z.string().length(6),
});

export const resetPasswordSchema = z.object({
	token: z.string().min(1),
	password: z.string().min(8),
});

export const onboardingSchema = z.object({
	industry: z.enum([
		"REAL_ESTATE",
		"SAAS",
		"EDUCATION",
		"FINANCIAL",
		"HEALTHCARE",
		"OTHER",
	]),
	teamSize: z.enum(["SIZE_1_10", "SIZE_11_50", "SIZE_51_200", "SIZE_200_PLUS"]),
	goals: z
		.array(
			z.enum([
				"SPEED_UP_QUALIFICATION",
				"CENTRALIZE_CALLS",
				"FORECAST_BETTER",
				"USE_AI_FOLLOWUPS",
				"RUN_CADENCES",
				"INSIGHTFUL_REPORTS",
			]),
		)
		.min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
