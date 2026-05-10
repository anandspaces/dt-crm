import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { leadActivities, leadMessages, leads } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { assertLeadAccess } from "../leads/leads.service";

export const listMessagesQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const sendMessageSchema = z.object({
	text: z.string().min(1).max(4096),
	sentByAi: z.boolean().default(false),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

function shapeMessage(row: typeof leadMessages.$inferSelect) {
	return {
		id: row.id,
		from: row.direction,
		text: row.text,
		isAi: row.isAi,
		sentAt: row.sentAt,
	};
}

export async function listMessages(
	leadId: string,
	query: z.infer<typeof listMessagesQuerySchema>,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const offset = (query.page - 1) * query.limit;

	const [totalRow] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(leadMessages)
		.where(eq(leadMessages.leadId, leadId));
	const total = totalRow?.total ?? 0;

	const rows = await db
		.select()
		.from(leadMessages)
		.where(eq(leadMessages.leadId, leadId))
		.orderBy(desc(leadMessages.sentAt))
		.limit(query.limit)
		.offset(offset);

	const sorted = rows.slice().reverse();

	const lastInbound = rows.find((r) => r.direction === "them");
	const suggestedReply = lastInbound
		? {
				text: `Hi! Just saw your message — let me follow up on "${lastInbound.text.slice(0, 60)}".`,
				generatedBy: "ai" as const,
			}
		: null;

	return {
		messages: sorted.map(shapeMessage),
		total,
		page: query.page,
		limit: query.limit,
		suggestedReply,
	};
}

export async function sendMessage(
	leadId: string,
	input: SendMessageInput,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const [row] = await db
		.insert(leadMessages)
		.values({
			leadId,
			userId: actor.sub,
			direction: input.sentByAi ? "ai" : "you",
			text: input.text,
			isAi: input.sentByAi,
		})
		.returning();
	if (!row) throw new Error("Failed to insert message");

	await db.insert(leadActivities).values({
		leadId,
		userId: actor.sub,
		type: "WHATSAPP",
		title: input.sentByAi ? "AI sent WhatsApp" : "WhatsApp sent",
		description: input.text.slice(0, 280),
	});

	await db
		.update(leads)
		.set({ lastContactedAt: new Date() })
		.where(eq(leads.id, leadId));

	return shapeMessage(row);
}

// Inbound endpoint (e.g. WhatsApp Business API webhook → call this from your webhook layer)
export async function recordInbound(
	leadId: string,
	text: string,
): Promise<void> {
	const [lead] = await db
		.select({ id: leads.id })
		.from(leads)
		.where(and(eq(leads.id, leadId)))
		.limit(1);
	if (!lead) return;

	await db.insert(leadMessages).values({
		leadId,
		direction: "them",
		text,
		isAi: false,
	});
}
