import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { leadActivities, leadCalls, leads, users } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { assertLeadAccess } from "../leads/leads.service";

export const logCallSchema = z.object({
	callerType: z.enum(["agent", "ai"]).default("agent"),
	callerName: z.string().max(255).optional(),
	outcome: z.enum(["connected", "missed", "voicemail"]),
	durationSeconds: z.number().int().min(0).default(0),
	recordingUrl: z.url().optional(),
	calledAt: z.iso.datetime().optional(),
});

export type LogCallInput = z.infer<typeof logCallSchema>;

function shapeCall(
	row: typeof leadCalls.$inferSelect,
	callerName: string | null,
) {
	return {
		id: row.id,
		callerType: row.callerType,
		callerName: row.callerName ?? callerName ?? null,
		outcome: row.outcome,
		durationSeconds: row.durationSeconds,
		calledAt: row.calledAt,
		recordingUrl: row.recordingUrl ?? undefined,
		aiSummary: row.aiSummaryJson ?? undefined,
	};
}

export async function listCalls(leadId: string, actor: JWTPayload) {
	await assertLeadAccess(leadId, actor);

	const rows = await db
		.select({
			call: leadCalls,
			userName: users.name,
		})
		.from(leadCalls)
		.leftJoin(users, eq(leadCalls.userId, users.id))
		.where(eq(leadCalls.leadId, leadId))
		.orderBy(desc(leadCalls.calledAt));

	return rows.map((r) => shapeCall(r.call, r.userName));
}

export async function logCall(
	leadId: string,
	input: LogCallInput,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const calledAt = input.calledAt ? new Date(input.calledAt) : new Date();

	// Stub AI summary if recording is present
	const aiSummary = input.recordingUrl
		? {
				sentiment: "neutral",
				sentimentScore: 0.5,
				keyPoints: ["Auto-summary not yet generated"],
				actionItems: [],
			}
		: null;

	const [row] = await db
		.insert(leadCalls)
		.values({
			leadId,
			userId: input.callerType === "agent" ? actor.sub : null,
			callerType: input.callerType,
			callerName: input.callerName,
			outcome: input.outcome,
			durationSeconds: input.durationSeconds,
			recordingUrl: input.recordingUrl,
			aiSummaryJson: aiSummary,
			calledAt,
		})
		.returning();
	if (!row) throw new Error("Failed to log call");

	await db.insert(leadActivities).values({
		leadId,
		userId: actor.sub,
		type: "CALL",
		title: `Call ${input.outcome}`,
		description: `Caller: ${input.callerName ?? input.callerType} · ${input.durationSeconds}s`,
		metadataJson:
			input.outcome === "missed" ? { kind: "danger" } : { kind: "success" },
	});

	if (input.outcome === "connected") {
		await db
			.update(leads)
			.set({ lastContactedAt: calledAt })
			.where(eq(leads.id, leadId));
	}

	return shapeCall(row, null);
}
