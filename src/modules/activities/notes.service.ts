import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { leadNotes } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { assertLeadAccess } from "../leads/leads.service";

export const createNoteSchema = z.object({
	content: z.string().min(1),
});

export const updateNoteSchema = z.object({
	content: z.string().min(1),
});

export async function listNotes(leadId: string, actor: JWTPayload) {
	await assertLeadAccess(leadId, actor);

	return db.query.leadNotes.findMany({
		where: (n, { eq }) => eq(n.leadId, leadId),
		with: {
			user: { columns: { id: true, name: true, email: true } },
		},
		orderBy: (n, { desc }) => [desc(n.createdAt)],
	});
}

export async function createNote(
	leadId: string,
	content: string,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const [note] = await db
		.insert(leadNotes)
		.values({ leadId, userId: actor.sub, content })
		.returning();

	return note;
}

export async function updateNote(
	leadId: string,
	noteId: string,
	content: string,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const [note] = await db
		.select()
		.from(leadNotes)
		.where(and(eq(leadNotes.id, noteId), eq(leadNotes.leadId, leadId)))
		.limit(1);

	if (!note) throw new NotFoundError("Note not found");

	if (actor.role !== "ADMIN" && note.userId !== actor.sub) {
		throw new ForbiddenError("You can only edit your own notes");
	}

	const [updated] = await db
		.update(leadNotes)
		.set({ content, updatedAt: new Date() })
		.where(eq(leadNotes.id, noteId))
		.returning();

	return updated;
}

export async function deleteNote(
	leadId: string,
	noteId: string,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const [note] = await db
		.select()
		.from(leadNotes)
		.where(and(eq(leadNotes.id, noteId), eq(leadNotes.leadId, leadId)))
		.limit(1);

	if (!note) throw new NotFoundError("Note not found");

	if (actor.role !== "ADMIN" && note.userId !== actor.sub) {
		throw new ForbiddenError("You can only delete your own notes");
	}

	await db.delete(leadNotes).where(eq(leadNotes.id, noteId));
}
