import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { leadReminders } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { NotFoundError } from "../../shared/utils/errors";
import { assertLeadAccess } from "../leads/leads.service";

export const createReminderSchema = z.object({
	title: z.string().min(1).max(500),
	dueAt: z.iso.datetime(),
});

export const updateReminderSchema = z.object({
	title: z.string().min(1).max(500).optional(),
	dueAt: z.iso.datetime().optional(),
	completedAt: z.iso.datetime().nullable().optional(),
	dismissed: z.boolean().optional(),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;

export async function listReminders(leadId: string, actor: JWTPayload) {
	await assertLeadAccess(leadId, actor);
	return db
		.select()
		.from(leadReminders)
		.where(eq(leadReminders.leadId, leadId))
		.orderBy(asc(leadReminders.dueAt));
}

export async function createReminder(
	leadId: string,
	input: CreateReminderInput,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const [row] = await db
		.insert(leadReminders)
		.values({
			leadId,
			userId: actor.sub,
			title: input.title,
			dueAt: new Date(input.dueAt),
		})
		.returning();
	if (!row) throw new Error("Failed to create reminder");
	return row;
}

export async function updateReminder(
	leadId: string,
	id: string,
	input: UpdateReminderInput,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const updates: Partial<typeof leadReminders.$inferInsert> = {};
	if (input.title !== undefined) updates.title = input.title;
	if (input.dueAt !== undefined) updates.dueAt = new Date(input.dueAt);
	if (input.completedAt !== undefined) {
		updates.completedAt = input.completedAt ? new Date(input.completedAt) : null;
	}
	if (input.dismissed !== undefined) updates.dismissed = input.dismissed;

	const [row] = await db
		.update(leadReminders)
		.set(updates)
		.where(and(eq(leadReminders.id, id), eq(leadReminders.leadId, leadId)))
		.returning();
	if (!row) throw new NotFoundError("Reminder not found");
	return row;
}

export async function deleteReminder(
	leadId: string,
	id: string,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);
	await db
		.delete(leadReminders)
		.where(and(eq(leadReminders.id, id), eq(leadReminders.leadId, leadId)));
}
