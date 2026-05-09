import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db } from "../../config/db";
import { env } from "../../config/env";
import { passwordResetTokens, refreshTokens, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import {
	hashToken,
	signAccessToken,
	signRefreshToken,
	verifyRefreshToken,
} from "../../shared/utils/crypto";
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

async function issueTokenPair(u: typeof users.$inferSelect) {
	const payload = tokenPayload(u);
	const accessToken = signAccessToken(payload);
	const rawRefresh = signRefreshToken(payload);

	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	await db.insert(refreshTokens).values({
		userId: u.id,
		tokenHash: hashToken(rawRefresh),
		expiresAt,
	});

	return { accessToken, refreshToken: rawRefresh };
}

export async function register(
	input: RegisterInput,
	requestingUser?: JWTPayload,
) {
	const [countRow] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(users);
	const n = countRow?.n ?? 0;

	if (n > 0) {
		if (!requestingUser || requestingUser.role !== "ADMIN") {
			throw new ForbiddenError("Only ADMIN can register new users");
		}
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
			role: input.role,
		})
		.returning();

	if (!user) throw new Error("Failed to create user");

	const tokens = await issueTokenPair(user);
	return { user: safeUser(user), ...tokens };
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

	const tokens = await issueTokenPair(user);
	return { user: safeUser(user), ...tokens };
}

export async function refresh(rawRefreshToken: string) {
	let payload: JWTPayload;
	try {
		payload = verifyRefreshToken(rawRefreshToken);
	} catch {
		throw new UnauthorizedError("Refresh token is invalid or expired");
	}

	const tokenHash = hashToken(rawRefreshToken);
	const [storedToken] = await db
		.select()
		.from(refreshTokens)
		.where(
			and(
				eq(refreshTokens.tokenHash, tokenHash),
				isNull(refreshTokens.revokedAt),
				gt(refreshTokens.expiresAt, new Date()),
			),
		)
		.limit(1);

	if (!storedToken) {
		throw new UnauthorizedError("Refresh token has been revoked or expired");
	}

	await db
		.update(refreshTokens)
		.set({ revokedAt: new Date() })
		.where(eq(refreshTokens.id, storedToken.id));

	const [user] = await db
		.select()
		.from(users)
		.where(and(eq(users.id, payload.sub), eq(users.isActive, true)))
		.limit(1);

	if (!user) {
		throw new UnauthorizedError("User not found or inactive");
	}

	const tokens = await issueTokenPair(user);
	return tokens;
}

export async function logout(rawRefreshToken: string) {
	const tokenHash = hashToken(rawRefreshToken);
	await db
		.update(refreshTokens)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(refreshTokens.tokenHash, tokenHash),
				isNull(refreshTokens.revokedAt),
			),
		);
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
