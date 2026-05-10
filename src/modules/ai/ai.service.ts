import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../config/db";
import { leadActivities, leads } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { assertLeadAccess } from "../leads/leads.service";

export const SUGGESTED_ACTIONS = ["whatsapp", "call", "email"] as const;
export type SuggestedAction = (typeof SUGGESTED_ACTIONS)[number];

export function pickAction(score: number): SuggestedAction {
	if (score >= 80) return "call";
	if (score >= 50) return "whatsapp";
	return "email";
}

export async function getInsight(leadId: string, actor: JWTPayload) {
	const lead = await assertLeadAccess(leadId, actor);

	const daysSinceContact = lead.lastContactedAt
		? Math.max(
				1,
				Math.floor(
					(Date.now() - lead.lastContactedAt.getTime()) / (1000 * 60 * 60 * 24),
				),
			)
		: null;

	const action = pickAction(lead.score);
	const name = lead.firstName;

	const message = daysSinceContact
		? `${name} hasn't responded in ${daysSinceContact} day(s). A ${action} with a time-limited offer typically lifts re-engagement here.`
		: `${name} is a fresh lead. Open with a ${action} to qualify intent quickly.`;

	const draftMessage =
		action === "whatsapp"
			? `Hi ${name}! We have limited slots this weekend for ${lead.requirement ?? "your requirement"}${lead.city ? ` in ${lead.city}` : ""}. Would you like me to lock one for you?`
			: action === "email"
				? `Hi ${name},\n\nFollowing up on your interest. Happy to share a tailored brief if you can share your timeline.\n\nThanks!`
				: `Aria suggests calling ${name} now — best window based on prior response patterns.`;

	return {
		message,
		suggestedAction: action,
		draftMessage,
	};
}

export async function triggerEnrichment(leadId: string, actor: JWTPayload) {
	await assertLeadAccess(leadId, actor);

	await db
		.update(leads)
		.set({ aiEnriched: true, updatedAt: new Date() })
		.where(eq(leads.id, leadId));

	await db.insert(leadActivities).values({
		leadId,
		userId: actor.sub,
		type: "SYSTEM",
		title: "AI enrichment started",
		metadataJson: { kind: "ai" },
	});

	return { jobId: `ENRICH-${randomUUID().slice(0, 8).toUpperCase()}` };
}
