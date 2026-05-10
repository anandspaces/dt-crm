import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { leadActivities, leadDocuments, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ForbiddenError, NotFoundError } from "../../shared/utils/errors";
import {
	deleteLeadDocument,
	saveLeadDocument,
	urlToRelativePath,
} from "../../shared/utils/storage";
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

async function persistDocument(
	leadId: string,
	values: {
		name: string;
		mimeType: string;
		sizeBytes: number;
		url: string;
	},
	actor: JWTPayload,
) {
	const [row] = await db
		.insert(leadDocuments)
		.values({
			leadId,
			uploadedBy: actor.sub,
			name: values.name,
			mimeType: values.mimeType,
			sizeBytes: values.sizeBytes,
			url: values.url,
		})
		.returning();
	if (!row) throw new Error("Failed to create document");

	await db.insert(leadActivities).values({
		leadId,
		userId: actor.sub,
		type: "SYSTEM",
		title: `Document uploaded: ${values.name}`,
		metadataJson: { kind: "info" },
	});

	const [uploader] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, actor.sub))
		.limit(1);

	return shapeDocument(row, uploader?.name ?? null);
}

export async function uploadDocument(
	leadId: string,
	file: {
		buffer: Buffer;
		originalname: string;
		mimetype: string;
		size: number;
	},
	nameOverride: string | undefined,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const displayName =
		nameOverride && nameOverride.length > 0 ? nameOverride : file.originalname;

	const stored = await saveLeadDocument(leadId, file.originalname, file.buffer);

	return persistDocument(
		leadId,
		{
			name: displayName,
			mimeType: file.mimetype,
			sizeBytes: file.size,
			url: stored.url,
		},
		actor,
	);
}

export async function createDocumentFromUrl(
	leadId: string,
	input: CreateDocumentInput,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);
	return persistDocument(leadId, input, actor);
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

	await db.delete(leadDocuments).where(eq(leadDocuments.id, doc.id));

	const relPath = urlToRelativePath(doc.url);
	if (relPath) deleteLeadDocument(relPath);
}
