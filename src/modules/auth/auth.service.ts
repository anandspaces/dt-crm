import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db } from "../../config/db";
import { env } from "../../config/env";
import { passwordResetTokens, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { hashToken, signAccessToken } from "../../shared/utils/crypto";
import {
	ConflictError,
	ForbiddenError,
	UnauthorizedError,
} from "../../shared/utils/errors";
import type { LoginInput, RegisterInput } from "./auth.schema";

function safeUser(u: typeof users.$inferSelect) {
	const { passwordHash: _, ...rest } = u;
	return rest;
}

function tokenPayload(
	u: typeof users.$inferSelect,
): Omit<JWTPayload, "iat" | "exp"> {
	return { sub: u.id, email: u.email, role: u.role };
}

export async function register(
	input: RegisterInput,
	requestingUser?: JWTPayload,
) {
	const [countRow] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(users);
	const n = countRow?.n ?? 0;

	let role = input.role;

	if (n === 0) {
		// Bootstrap: first account (often ADMIN) — open registration
	} else if (requestingUser?.role === "ADMIN") {
		// Admin may provision any role
	} else if (!requestingUser) {
		// Public self-registration: non-privileged role only
		role = "SALES";
	} else {
		throw new ForbiddenError("Only ADMIN can register new users");
	}

	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, input.email))
		.limit(1);

	if (existing.length > 0) {
		throw new ConflictError("Email already in use");
	}

	const passwordHash = await bcrypt.hash(input.password, 12);
	const [user] = await db
		.insert(users)
		.values({
			name: input.name,
			email: input.email,
			passwordHash,
			role,
		})
		.returning();

	if (!user) throw new Error("Failed to create user");

	const accessToken = signAccessToken(tokenPayload(user));
	return { user: safeUser(user), accessToken };
}

export async function login(input: LoginInput) {
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.email, input.email))
		.limit(1);

	if (!user?.isActive) {
		throw new UnauthorizedError("Invalid credentials");
	}

	const match = await bcrypt.compare(input.password, user.passwordHash);
	if (!match) {
		throw new UnauthorizedError("Invalid credentials");
	}

	await db
		.update(users)
		.set({ lastLoginAt: new Date() })
		.where(eq(users.id, user.id));

	const accessToken = signAccessToken(tokenPayload(user));
	return { user: safeUser(user), accessToken };
}

export async function forgotPassword(email: string) {
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.email, email))
		.limit(1);

	if (!user) return;

	const rawToken = randomBytes(32).toString("hex");
	const tokenHash = hashToken(rawToken);
	const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

	await db.insert(passwordResetTokens).values({
		userId: user.id,
		tokenHash,
		expiresAt,
	});

	const resetUrl = `${env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;

	if (env.SMTP_HOST) {
		const transporter = nodemailer.createTransport({
			host: env.SMTP_HOST,
			port: env.SMTP_PORT ?? 587,
			auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
		});
		await transporter.sendMail({
			from: env.SMTP_FROM,
			to: user.email,
			subject: "Password Reset — Dextora CRM",
			text: `Reset your password within 15 minutes:\n\n${resetUrl}`,
		});
	} else {
		console.log(`[dev] Password reset URL for ${email}: ${resetUrl}`);
	}
}

export async function resetPassword(rawToken: string, newPassword: string) {
	const tokenHash = hashToken(rawToken);
	const [resetToken] = await db
		.select()
		.from(passwordResetTokens)
		.where(
			and(
				eq(passwordResetTokens.tokenHash, tokenHash),
				isNull(passwordResetTokens.usedAt),
				gt(passwordResetTokens.expiresAt, new Date()),
			),
		)
		.limit(1);

	if (!resetToken) {
		throw new UnauthorizedError("Reset token is invalid or expired");
	}

	const passwordHash = await bcrypt.hash(newPassword, 12);
	await db
		.update(users)
		.set({ passwordHash, updatedAt: new Date() })
		.where(eq(users.id, resetToken.userId));

	await db
		.update(passwordResetTokens)
		.set({ usedAt: new Date() })
		.where(eq(passwordResetTokens.id, resetToken.id));
}
