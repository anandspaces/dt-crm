import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { contactNotes, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { assertContactAccess } from "./contacts.service";

export const createNoteSchema = z.object({ text: z.string().min(1) });
export const updateNoteSchema = z.object({ text: z.string().min(1) });

function shapeNote(
	row: typeof contactNotes.$inferSelect,
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

export async function listNotes(contactId: string, actor: JWTPayload) {
	await assertContactAccess(contactId, actor);
	const rows = await db
		.select({ note: contactNotes, author: users.name })
		.from(contactNotes)
		.leftJoin(users, eq(contactNotes.userId, users.id))
		.where(eq(contactNotes.contactId, contactId))
		.orderBy(desc(contactNotes.createdAt));
	return { notes: rows.map((r) => shapeNote(r.note, r.author)) };
}

export async function createNote(
	contactId: string,
	text: string,
	actor: JWTPayload,
) {
	await assertContactAccess(contactId, actor);
	const [note] = await db
		.insert(contactNotes)
		.values({ contactId, userId: actor.sub, content: text })
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
	contactId: string,
	noteId: string,
	text: string,
	actor: JWTPayload,
) {
	await assertContactAccess(contactId, actor);
	const [note] = await db
		.select()
		.from(contactNotes)
		.where(
			and(eq(contactNotes.id, noteId), eq(contactNotes.contactId, contactId)),
		)
		.limit(1);
	if (!note) throw new NotFoundError("Note not found");
	if (actor.role !== "ADMIN" && note.userId !== actor.sub) {
		throw new ForbiddenError("You can only edit your own notes");
	}
	const [updated] = await db
		.update(contactNotes)
		.set({ content: text, updatedAt: new Date() })
		.where(eq(contactNotes.id, noteId))
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
	contactId: string,
	noteId: string,
	actor: JWTPayload,
) {
	await assertContactAccess(contactId, actor);
	const [note] = await db
		.select()
		.from(contactNotes)
		.where(
			and(eq(contactNotes.id, noteId), eq(contactNotes.contactId, contactId)),
		)
		.limit(1);
	if (!note) throw new NotFoundError("Note not found");
	if (actor.role !== "ADMIN" && note.userId !== actor.sub) {
		throw new ForbiddenError("You can only delete your own notes");
	}
	await db.delete(contactNotes).where(eq(contactNotes.id, noteId));
}
