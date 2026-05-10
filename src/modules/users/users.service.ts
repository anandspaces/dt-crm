import bcrypt from "bcryptjs";
import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "../../config/db";
import { users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { buildPage, decodeCursor } from "../../shared/utils/pagination";
import type { ListUsersQuery, UpdateUserInput } from "./users.schema";

function safeUser(u: typeof users.$inferSelect) {
	const { passwordHash: _, ...rest } = u;
	return rest;
}

export async function listUsers(query: ListUsersQuery, actor: JWTPayload) {
	const conditions = [];

	if (actor.role === "SALES" || actor.role === "SUPPORT") {
		conditions.push(eq(users.id, actor.sub));
	}

	if (query.role) conditions.push(eq(users.role, query.role));

	if (query.search) {
		const pattern = `%${query.search}%`;
		conditions.push(
			or(ilike(users.name, pattern), ilike(users.email, pattern)),
		);
	}

	if (query.cursor) {
		const { id, createdAt } = decodeCursor(query.cursor);
		conditions.push(
			or(
				lt(users.createdAt, createdAt),
				and(eq(users.createdAt, createdAt), lt(users.id, id)),
			),
		);
	}

	const [countRow] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(users)
		.where(
			conditions.length > 0 ? and(...conditions.filter(Boolean)) : undefined,
		);
	const total = countRow?.total ?? 0;

	const rows = await db
		.select()
		.from(users)
		.where(
			conditions.length > 0 ? and(...conditions.filter(Boolean)) : undefined,
		)
		.orderBy(desc(users.createdAt), desc(users.id))
		.limit(query.limit + 1);

	const { data, nextCursor } = buildPage(rows, query.limit);
	return {
		data: data.map(safeUser),
		meta: { total, limit: query.limit, nextCursor },
	};
}

export async function getUserById(id: string, actor: JWTPayload) {
	if (actor.role !== "ADMIN" && actor.role !== "MANAGER" && actor.sub !== id) {
		throw new ForbiddenError("You can only view your own profile");
	}

	const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);

	if (!user) throw new NotFoundError("User not found");
	return safeUser(user);
}

export async function updateUser(
	id: string,
	input: UpdateUserInput,
	actor: JWTPayload,
) {
	const canManageOthers = actor.role === "ADMIN";
	const isSelf = actor.sub === id;

	if (!isSelf && !canManageOthers) {
		throw new ForbiddenError("You can only update your own profile");
	}

	if (!isSelf && !canManageOthers) {
		throw new ForbiddenError("Only ADMIN can update other users");
	}

	if (
		(input.role !== undefined || input.isActive !== undefined) &&
		!canManageOthers
	) {
		throw new ForbiddenError("Only ADMIN can change role or active status");
	}

	const [existing] = await db
		.select()
		.from(users)
		.where(eq(users.id, id))
		.limit(1);
	if (!existing) throw new NotFoundError("User not found");

	const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

	if (input.name !== undefined) updates.name = input.name;
	if (input.role !== undefined && canManageOthers) updates.role = input.role;
	if (input.isActive !== undefined && canManageOthers)
		updates.isActive = input.isActive;
	if (input.password !== undefined) {
		updates.passwordHash = await bcrypt.hash(input.password, 12);
	}

	const [updated] = await db
		.update(users)
		.set(updates)
		.where(eq(users.id, id))
		.returning();

	if (!updated) throw new NotFoundError("User not found");
	return safeUser(updated);
}

export async function deactivateUser(id: string, actor: JWTPayload) {
	if (actor.role !== "ADMIN") {
		throw new ForbiddenError("Only ADMIN can deactivate users");
	}
	if (actor.sub === id) {
		throw new ForbiddenError("Cannot deactivate your own account");
	}

	const [existing] = await db
		.select()
		.from(users)
		.where(eq(users.id, id))
		.limit(1);
	if (!existing) throw new NotFoundError("User not found");

	await db
		.update(users)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(users.id, id));
}
