import { and, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { leadActivities, leads } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { buildPage, decodeCursor } from "../../shared/utils/pagination";
import { assertLeadAccess } from "../leads/leads.service";

export const logActivitySchema = z.object({
	type: z.enum([
		"CALL",
		"EMAIL",
		"NOTE",
		"MEETING",
		"WHATSAPP",
		"STATUS_CHANGE",
		"ASSIGNMENT",
		"FOLLOWUP",
		"SYSTEM",
	]),
	title: z.string().min(1).max(500),
	description: z.string().optional(),
	metadataJson: z.record(z.string(), z.unknown()).optional(),
});

export const listActivitiesQuerySchema = z.object({
	type: z
		.enum([
			"CALL",
			"EMAIL",
			"NOTE",
			"MEETING",
			"WHATSAPP",
			"STATUS_CHANGE",
			"ASSIGNMENT",
			"FOLLOWUP",
			"SYSTEM",
		])
		.optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	cursor: z.string().optional(),
});

export type LogActivityInput = z.infer<typeof logActivitySchema>;

export async function listActivities(
	leadId: string,
	query: z.infer<typeof listActivitiesQuerySchema>,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const conditions = [eq(leadActivities.leadId, leadId)];

	if (query.type) conditions.push(eq(leadActivities.type, query.type));

	if (query.cursor) {
		const { id, createdAt } = decodeCursor(query.cursor);
		const cursorClause = or(
			lt(leadActivities.createdAt, createdAt),
			and(eq(leadActivities.createdAt, createdAt), lt(leadActivities.id, id)),
		);
		if (cursorClause) conditions.push(cursorClause);
	}

	const rows = await db.query.leadActivities.findMany({
		where: and(...conditions),
		with: {
			user: {
				columns: { id: true, name: true, email: true, role: true },
			},
		},
		orderBy: (a, { desc }) => [desc(a.createdAt)],
		limit: query.limit + 1,
	});

	const { data, nextCursor } = buildPage(rows, query.limit);
	return { data, nextCursor };
}

const CONTACT_TYPES = new Set(["CALL", "EMAIL", "MEETING"]);

export async function logActivity(
	leadId: string,
	input: LogActivityInput,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const [activity] = await db
		.insert(leadActivities)
		.values({
			leadId,
			userId: actor.sub,
			type: input.type,
			title: input.title,
			description: input.description,
			metadataJson: input.metadataJson,
		})
		.returning();

	// Update lastContactedAt when a contact-type activity is logged
	if (CONTACT_TYPES.has(input.type)) {
		await db
			.update(leads)
			.set({ lastContactedAt: new Date() })
			.where(eq(leads.id, leadId));
	}

	return activity;
}
