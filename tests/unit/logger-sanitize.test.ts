import { describe, expect, it } from "bun:test";
import { sanitize, truncateForLog } from "../../src/shared/utils/logger";

describe("logger.sanitize", () => {
	it("redacts top-level password/token/secret keys", () => {
		const out = sanitize({
			email: "a@b.com",
			password: "hunter2",
			accessToken: "eyJ...",
			secret: "shh",
		});
		expect(out).toEqual({
			email: "a@b.com",
			password: "[REDACTED]",
			accessToken: "[REDACTED]",
			secret: "[REDACTED]",
		});
	});

	it("redacts case-insensitively (Password, ACCESSTOKEN, etc.)", () => {
		const out = sanitize({ Password: "x", ACCESSTOKEN: "y" }) as Record<
			string,
			unknown
		>;
		expect(out.Password).toBe("[REDACTED]");
		expect(out.ACCESSTOKEN).toBe("[REDACTED]");
	});

	it("redacts nested keys at any depth", () => {
		const out = sanitize({
			data: { user: { id: 1, password: "x", profile: { otp: "123456" } } },
		}) as { data: { user: { password: string; profile: { otp: string } } } };
		expect(out.data.user.password).toBe("[REDACTED]");
		expect(out.data.user.profile.otp).toBe("[REDACTED]");
	});

	it("recurses into arrays of objects", () => {
		const out = sanitize({
			users: [
				{ id: 1, password: "a" },
				{ id: 2, password: "b" },
			],
		}) as { users: Array<{ password: string }> };
		expect(out.users[0]?.password).toBe("[REDACTED]");
		expect(out.users[1]?.password).toBe("[REDACTED]");
	});

	it("preserves non-sensitive keys verbatim", () => {
		const input = { name: "Ananya", phone: "+91", tags: ["a", "b"] };
		expect(sanitize(input)).toEqual(input);
	});

	it("returns primitives unchanged", () => {
		expect(sanitize("hello")).toBe("hello");
		expect(sanitize(42)).toBe(42);
		expect(sanitize(null)).toBe(null);
		expect(sanitize(undefined)).toBe(undefined);
	});

	it("handles cycles without recursing forever", () => {
		const a: Record<string, unknown> = { name: "x" };
		a.self = a;
		const out = sanitize(a) as { self: unknown };
		expect(out.self).toBe("[Circular]");
	});
});

describe("logger.truncateForLog", () => {
	it("returns the value unchanged when small enough", () => {
		expect(truncateForLog({ a: 1 }, 1024)).toEqual({ a: 1 });
	});

	it("truncates when JSON length exceeds maxBytes", () => {
		const big = { s: "x".repeat(3000) };
		const out = truncateForLog(big, 100);
		expect(typeof out).toBe("string");
		expect((out as string).endsWith("bytes)")).toBe(true);
	});

	it("returns null/undefined unchanged", () => {
		expect(truncateForLog(null)).toBeNull();
		expect(truncateForLog(undefined)).toBeUndefined();
	});
});
