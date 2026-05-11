import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { dealNotes, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { assertDealAccess } from "./deals.service";

export const createNoteSchema = z.object({ text: z.string().min(1) });
export const updateNoteSchema = z.object({ text: z.string().min(1) });

function shapeNote(
	row: typeof dealNotes.$inferSelect,
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

export async function listNotes(dealId: string, actor: JWTPayload) {
	await assertDealAccess(dealId, actor);
	const rows = await db
		.select({ note: dealNotes, author: users.name })
		.from(dealNotes)
		.leftJoin(users, eq(dealNotes.userId, users.id))
		.where(eq(dealNotes.dealId, dealId))
		.orderBy(desc(dealNotes.createdAt));
	return { notes: rows.map((r) => shapeNote(r.note, r.author)) };
}

export async function createNote(
	dealId: string,
	text: string,
	actor: JWTPayload,
) {
	await assertDealAccess(dealId, actor);
	const [note] = await db
		.insert(dealNotes)
		.values({ dealId, userId: actor.sub, content: text })
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
	dealId: string,
	noteId: string,
	text: string,
	actor: JWTPayload,
) {
	await assertDealAccess(dealId, actor);
	const [note] = await db
		.select()
		.from(dealNotes)
		.where(and(eq(dealNotes.id, noteId), eq(dealNotes.dealId, dealId)))
		.limit(1);
	if (!note) throw new NotFoundError("Note not found");
	if (actor.role !== "ADMIN" && note.userId !== actor.sub) {
		throw new ForbiddenError("You can only edit your own notes");
	}
	const [updated] = await db
		.update(dealNotes)
		.set({ content: text, updatedAt: new Date() })
		.where(eq(dealNotes.id, noteId))
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
	dealId: string,
	noteId: string,
	actor: JWTPayload,
) {
	await assertDealAccess(dealId, actor);
	const [note] = await db
		.select()
		.from(dealNotes)
		.where(and(eq(dealNotes.id, noteId), eq(dealNotes.dealId, dealId)))
		.limit(1);
	if (!note) throw new NotFoundError("Note not found");
	if (actor.role !== "ADMIN" && note.userId !== actor.sub) {
		throw new ForbiddenError("You can only delete your own notes");
	}
	await db.delete(dealNotes).where(eq(dealNotes.id, noteId));
}
