import { z } from "zod";

const envSchema = z.object({
	DATABASE_URL: z.string().min(1),
	PORT: z.coerce.number().int().positive().default(3000),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),

	JWT_ACCESS_SECRET: z.string().min(32),
	JWT_ACCESS_EXPIRES: z.string().default("15m"),

	CORS_ORIGIN: z.string().default("*"),

	GOOGLE_ADS_WEBHOOK_SECRET: z.string().optional(),

	// Optional SMTP — if absent, password-reset emails are logged to console
	SMTP_HOST: z.string().optional(),
	SMTP_PORT: z.coerce.number().int().positive().optional(),
	SMTP_USER: z.string().optional(),
	SMTP_PASS: z.string().optional(),
	SMTP_FROM: z.string().default("noreply@dextora.com"),

	APP_URL: z.string().default("http://localhost:3000"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
