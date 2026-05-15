import { z } from "zod";

const envSchema = z.object({
	DATABASE_URL: z.string().min(1),
	PORT: z.coerce.number().int().positive().default(3000),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),

	/** How many reverse proxies sit in front of this app (e.g. 1 for nginx/Caddy). Enables Express `trust proxy` so `req.ip` and rate limiting respect `X-Forwarded-For`. Omit or 0 when the app is reached directly. */
	TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(32).optional(),

	JWT_ACCESS_SECRET: z.string().min(32),
	JWT_ACCESS_EXPIRES: z.string().default("15m"),

	CORS_ORIGIN: z.string().default("*"),

	/** Shared key the Google Ads lead-form webhook embeds as `google_key` in
	 * the payload. Must match the "Key" field configured in the Google Ads UI.
	 * Leave unset in dev to accept all keys. */
	GOOGLE_ADS_WEBHOOK_SECRET: z.string().optional(),

	// Optional SMTP — if absent, password-reset emails are logged to console
	SMTP_HOST: z.string().optional(),
	SMTP_PORT: z.coerce.number().int().positive().optional(),
	SMTP_USER: z.string().optional(),
	SMTP_PASS: z.string().optional(),
	SMTP_FROM: z.string().default("noreply@dextora.com"),

	APP_URL: z.string().default("http://localhost:3000"),

	LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
	LOG_FORMAT: z.enum(["text", "json"]).default("text"),

	// ─── Calling agent (Vobiz telephony + Gemini Live) ───────────────────────
	/** Public HTTPS base for the API. Vobiz needs it for answer/hangup callbacks
	 * and to build the wss:// stream URL. Use ngrok for local dev. */
	PUBLIC_BASE_URL: z.string().optional(),
	/** Separate port for the Bun WebSocket server that handles /voice-stream.
	 * Express keeps PORT for HTTP; Bun.serve() takes this port for WS upgrades. */
	WS_PORT: z.coerce.number().int().positive().optional(),
	/** Where MP3 recordings and per-call artifacts are stored locally. */
	ARTIFACTS_DIR: z.string().default("./call-artifacts"),

	GEMINI_API_KEY: z.string().optional(),
	GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
	GEMINI_LIVE_MODEL: z
		.string()
		.default("gemini-2.5-flash-preview-native-audio-dialog"),
	GEMINI_VOICE_NAME: z.string().default("Puck"),
	GEMINI_EMBEDDING_MODEL: z.string().default("text-embedding-004"),

	VOBIZ_AUTH_ID: z.string().optional(),
	VOBIZ_AUTH_TOKEN: z.string().optional(),
	VOBIZ_PHONE_NUMBER: z.string().optional(),
	VOBIZ_RING_TIMEOUT: z.coerce.number().int().positive().default(30),
	VOBIZ_TIME_LIMIT: z.coerce.number().int().positive().default(600),
	VOBIZ_RECORDING_TIME_LIMIT: z.coerce.number().int().positive().default(900),
	VOBIZ_RECORDING_FORMAT: z.string().default("mp3"),
	VOBIZ_RECORDING_CHANNELS: z.string().default("stereo"),
	VOBIZ_MACHINE_DETECTION: z
		.preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean())
		.default(false),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
