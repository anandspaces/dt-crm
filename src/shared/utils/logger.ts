// Lightweight leveled logger. No external deps.
// - Honors LOG_LEVEL (debug | info | warn | error). Default: info; "warn" in tests.
// - Honors LOG_FORMAT (text | json). Default: text. JSON is structured; text is human-readable key=value.
// - Each log line includes a UTC timestamp.

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

function pickLevel(): Level {
	const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
	if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
		return raw;
	}
	return process.env.NODE_ENV === "test" ? "warn" : "info";
}

function pickFormat(): "text" | "json" {
	return process.env.LOG_FORMAT === "json" ? "json" : "text";
}

const minLevel = LEVEL_ORDER[pickLevel()];
const format = pickFormat();

function ts(): string {
	return new Date().toISOString();
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatText(
	level: Level,
	msg: string,
	meta?: Record<string, unknown>,
): string {
	const prefix = `${ts()} [${level.toUpperCase()}] ${msg}`;
	if (!meta || Object.keys(meta).length === 0) return prefix;
	const parts: string[] = [];
	for (const [k, v] of Object.entries(meta)) {
		if (v === undefined) continue;
		const value =
			typeof v === "string"
				? v.includes(" ") || v.includes("=")
					? JSON.stringify(v)
					: v
				: JSON.stringify(v);
		parts.push(`${k}=${value}`);
	}
	return `${prefix} ${parts.join(" ")}`;
}

function emit(level: Level, args: unknown[]): void {
	if (LEVEL_ORDER[level] < minLevel) return;

	// First arg is the human message; an optional final object is structured meta.
	const last = args[args.length - 1];
	const hasMeta = isPlainObject(last);
	const meta = hasMeta ? (last as Record<string, unknown>) : undefined;
	const msgParts = (hasMeta ? args.slice(0, -1) : args).map((a) =>
		typeof a === "string" ? a : JSON.stringify(a),
	);
	const msg = msgParts.join(" ");

	if (format === "json") {
		const line = JSON.stringify({ ts: ts(), level, msg, ...(meta ?? {}) });
		(level === "error" ? console.error : console.log)(line);
		return;
	}

	const line = formatText(level, msg, meta);
	(level === "error"
		? console.error
		: level === "warn"
			? console.warn
			: console.log)(line);
}

export const logger = {
	debug: (...args: unknown[]) => emit("debug", args),
	info: (...args: unknown[]) => emit("info", args),
	warn: (...args: unknown[]) => emit("warn", args),
	error: (...args: unknown[]) => emit("error", args),
};

// ── Body sanitizer ────────────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
	"password",
	"passwordhash",
	"password_hash",
	"otp",
	"token",
	"accesstoken",
	"refreshtoken",
	"secret",
	"apikey",
	"authorization",
]);

const REDACTED = "[REDACTED]";

/**
 * Deep-clones a value, replacing values at sensitive keys with [REDACTED].
 * Safe on cycles (returns "[Circular]") and arrays. Used before any body is logged.
 */
export function sanitize(
	value: unknown,
	seen = new WeakSet<object>(),
): unknown {
	if (value === null || typeof value !== "object") return value;
	if (seen.has(value as object)) return "[Circular]";
	seen.add(value as object);

	if (Array.isArray(value)) {
		return value.map((v) => sanitize(v, seen));
	}

	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (SENSITIVE_KEYS.has(k.toLowerCase())) {
			out[k] = REDACTED;
		} else {
			out[k] = sanitize(v, seen);
		}
	}
	return out;
}

/**
 * Truncates a JSON-stringifiable value to ~maxBytes when serialized.
 * Returns the original object if small enough; otherwise a string with "...".
 */
export function truncateForLog(value: unknown, maxBytes = 2048): unknown {
	if (value === undefined || value === null) return value;
	const json = typeof value === "string" ? value : JSON.stringify(value);
	if (json.length <= maxBytes) return value;
	return `${json.slice(0, maxBytes)}…(truncated, ${json.length} bytes)`;
}
