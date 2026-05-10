import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { leadActivities, leadNotes, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { assertLeadAccess } from "../leads/leads.service";

export const createNoteSchema = z.object({
	text: z.string().min(1),
});

export const updateNoteSchema = z.object({
	text: z.string().min(1),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

function shapeNote(
	row: typeof leadNotes.$inferSelect,
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

export async function listNotes(leadId: string, actor: JWTPayload) {
	await assertLeadAccess(leadId, actor);

	const rows = await db
		.select({ note: leadNotes, author: users.name })
		.from(leadNotes)
		.leftJoin(users, eq(leadNotes.userId, users.id))
		.where(eq(leadNotes.leadId, leadId))
		.orderBy(desc(leadNotes.createdAt));

	return { notes: rows.map((r) => shapeNote(r.note, r.author)) };
}

export async function createNote(
	leadId: string,
	text: string,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const [note] = await db
		.insert(leadNotes)
		.values({ leadId, userId: actor.sub, content: text })
		.returning();
	if (!note) throw new Error("Failed to create note");

	await db.insert(leadActivities).values({
		leadId,
		userId: actor.sub,
		type: "NOTE",
		title: "Note added",
		description: text.slice(0, 500),
		metadataJson: { kind: "note" },
	});

	const [author] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, actor.sub))
		.limit(1);

	return shapeNote(note, author?.name ?? null);
}

export async function updateNote(
	leadId: string,
	noteId: string,
	text: string,
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
		.set({ content: text, updatedAt: new Date() })
		.where(eq(leadNotes.id, noteId))
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
