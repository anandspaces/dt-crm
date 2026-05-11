import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { accountNotes, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { assertAccountAccess } from "./accounts.service";

export const createNoteSchema = z.object({ text: z.string().min(1) });
export const updateNoteSchema = z.object({ text: z.string().min(1) });

function shapeNote(
	row: typeof accountNotes.$inferSelect,
	authorName: string | null,
) {
	return {
		id: row.id,
		text: row.content,
		createdBy: authorName ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export async function listNotes(accountId: string, actor: JWTPayload) {
	await assertAccountAccess(accountId, actor);
	const rows = await db
		.select({ note: accountNotes, author: users.name })
		.from(accountNotes)
		.leftJoin(users, eq(accountNotes.userId, users.id))
		.where(eq(accountNotes.accountId, accountId))
		.orderBy(desc(accountNotes.createdAt));
	return { notes: rows.map((r) => shapeNote(r.note, r.author)) };
}

export async function createNote(
	accountId: string,
	text: string,
	actor: JWTPayload,
) {
	await assertAccountAccess(accountId, actor);
	const [note] = await db
		.insert(accountNotes)
		.values({ accountId, userId: actor.sub, content: text })
		.returning();
	if (!note) throw new Error("Failed to create note");
	const [author] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, actor.sub))
		.limit(1);
	return shapeNote(note, author?.name ?? null);
}

export async function updateNote(
	accountId: string,
	noteId: string,
	text: string,
	actor: JWTPayload,
) {
	await assertAccountAccess(accountId, actor);
	const [note] = await db
		.select()
		.from(accountNotes)
		.where(
			and(eq(accountNotes.id, noteId), eq(accountNotes.accountId, accountId)),
		)
		.limit(1);
	if (!note) throw new NotFoundError("Note not found");
	if (actor.role !== "ADMIN" && note.userId !== actor.sub) {
		throw new ForbiddenError("You can only edit your own notes");
	}
	const [updated] = await db
		.update(accountNotes)
		.set({ content: text, updatedAt: new Date() })
		.where(eq(accountNotes.id, noteId))
		.returning();
	if (!updated) throw new Error("Failed to update note");
	const [author] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, updated.userId))
		.limit(1);
	return shapeNote(updated, author?.name ?? null);
}

export async function deleteNote(
	accountId: string,
	noteId: string,
	actor: JWTPayload,
) {
	await assertAccountAccess(accountId, actor);
	const [note] = await db
		.select()
		.from(accountNotes)
		.where(
			and(eq(accountNotes.id, noteId), eq(accountNotes.accountId, accountId)),
		)
		.limit(1);
	if (!note) throw new NotFoundError("Note not found");
	if (actor.role !== "ADMIN" && note.userId !== actor.sub) {
		throw new ForbiddenError("You can only delete your own notes");
	}
	await db.delete(accountNotes).where(eq(accountNotes.id, noteId));
}
