import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { leadActivities } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { assertLeadAccess } from "../leads/leads.service";

export const ACTIVITY_TYPES = [
	"CALL",
	"EMAIL",
	"NOTE",
	"MEETING",
	"WHATSAPP",
	"STATUS_CHANGE",
	"ASSIGNMENT",
	"FOLLOWUP",
	"SYSTEM",
] as const;

export const TIMELINE_KINDS = ["ai", "success", "note", "info", "danger"] as const;

export const addNoteSchema = z.object({
	kind: z.enum(TIMELINE_KINDS).default("note"),
	title: z.string().min(1).max(500),
	body: z.string().optional(),
});

export type AddNoteInput = z.infer<typeof addNoteSchema>;

function activityKind(
	type: (typeof ACTIVITY_TYPES)[number],
	metadata?: Record<string, unknown> | null,
): (typeof TIMELINE_KINDS)[number] {
	if (metadata && typeof (metadata as { kind?: string }).kind === "string") {
		const k = (metadata as { kind: string }).kind;
		if ((TIMELINE_KINDS as readonly string[]).includes(k)) {
			return k as (typeof TIMELINE_KINDS)[number];
		}
	}
	switch (type) {
		case "CALL":
		case "MEETING":
			return "success";
		case "NOTE":
			return "note";
		case "STATUS_CHANGE":
		case "ASSIGNMENT":
		case "WHATSAPP":
		case "EMAIL":
		case "FOLLOWUP":
			return "info";
		case "SYSTEM":
			return "info";
	}
}

export async function getTimeline(leadId: string, actor: JWTPayload) {
	await assertLeadAccess(leadId, actor);

	const rows = await db.query.leadActivities.findMany({
		where: eq(leadActivities.leadId, leadId),
		with: {
			user: { columns: { id: true, name: true, email: true } },
		},
		orderBy: (a) => [desc(a.createdAt)],
		limit: 200,
	});

	return rows.map((row) => ({
		id: row.id,
		kind: activityKind(row.type, row.metadataJson as Record<string, unknown> | null),
		actor: row.user?.name ?? "System",
		title: row.title,
		body: row.description ?? null,
		createdAt: row.createdAt,
	}));
}

export async function addTimelineNote(
	leadId: string,
	input: AddNoteInput,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const [row] = await db
		.insert(leadActivities)
		.values({
			leadId,
			userId: actor.sub,
			type: "NOTE",
			title: input.title,
			description: input.body,
			metadataJson: { kind: input.kind },
		})
		.returning();
	if (!row) throw new Error("Failed to create timeline note");

	return {
		id: row.id,
		kind: input.kind,
		actor: actor.email,
		title: row.title,
		body: row.description ?? null,
		createdAt: row.createdAt,
	};
}
