import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { leadActivities, leadDocuments, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import { assertLeadAccess } from "../leads/leads.service";

export const createDocumentSchema = z.object({
	name: z.string().min(1).max(500),
	mimeType: z.string().min(1).max(100),
	sizeBytes: z.number().int().min(0),
	url: z.url(),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

function shapeDocument(
	row: typeof leadDocuments.$inferSelect,
	uploaderName: string | null,
) {
	return {
		id: row.id,
		name: row.name,
		mimeType: row.mimeType,
		sizeBytes: row.sizeBytes,
		url: row.url,
		uploadedBy: uploaderName ?? null,
		uploadedAt: row.uploadedAt,
	};
}

export async function listDocuments(leadId: string, actor: JWTPayload) {
	await assertLeadAccess(leadId, actor);

	const rows = await db
		.select({ doc: leadDocuments, uploader: users.name })
		.from(leadDocuments)
		.leftJoin(users, eq(leadDocuments.uploadedBy, users.id))
		.where(eq(leadDocuments.leadId, leadId))
		.orderBy(desc(leadDocuments.uploadedAt));

	return rows.map((r) => shapeDocument(r.doc, r.uploader));
}

export async function createDocument(
	leadId: string,
	input: CreateDocumentInput,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const [row] = await db
		.insert(leadDocuments)
		.values({
			leadId,
			uploadedBy: actor.sub,
			name: input.name,
			mimeType: input.mimeType,
			sizeBytes: input.sizeBytes,
			url: input.url,
		})
		.returning();
	if (!row) throw new Error("Failed to create document");

	await db.insert(leadActivities).values({
		leadId,
		userId: actor.sub,
		type: "SYSTEM",
		title: `Document uploaded: ${input.name}`,
	});

	return shapeDocument(row, null);
}

export async function deleteDocument(
	leadId: string,
	docId: string,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const [doc] = await db
		.select()
		.from(leadDocuments)
		.where(and(eq(leadDocuments.id, docId), eq(leadDocuments.leadId, leadId)))
		.limit(1);
	if (!doc) throw new NotFoundError("Document not found");

	if (
		actor.role !== "ADMIN" &&
		actor.role !== "MANAGER" &&
		doc.uploadedBy !== actor.sub
	) {
		throw new ForbiddenError("You can only delete your own documents");
	}

	await db.delete(leadDocuments).where(eq(leadDocuments.id, docId));
}
