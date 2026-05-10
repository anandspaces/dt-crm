import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { leadReminders, users } from "../../db/schema";
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
	done: z.boolean().optional(),
	dismissed: z.boolean().optional(),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;

function shapeReminder(
	row: typeof leadReminders.$inferSelect,
	authorName: string | null,
) {
	return {
		id: row.id,
		title: row.title,
		dueAt: row.dueAt,
		done: row.completedAt !== null,
		dismissed: row.dismissed,
		createdBy: authorName ?? null,
		createdAt: row.createdAt,
	};
}

export async function listReminders(leadId: string, actor: JWTPayload) {
	await assertLeadAccess(leadId, actor);
	const rows = await db
		.select({ reminder: leadReminders, author: users.name })
		.from(leadReminders)
		.leftJoin(users, eq(leadReminders.userId, users.id))
		.where(eq(leadReminders.leadId, leadId))
		.orderBy(asc(leadReminders.dueAt));

	return rows.map((r) => shapeReminder(r.reminder, r.author));
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

	const [author] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, actor.sub))
		.limit(1);

	return shapeReminder(row, author?.name ?? null);
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
	if (input.done !== undefined) {
		updates.completedAt = input.done ? new Date() : null;
	}
	if (input.dismissed !== undefined) updates.dismissed = input.dismissed;

	const [row] = await db
		.update(leadReminders)
		.set(updates)
		.where(and(eq(leadReminders.id, id), eq(leadReminders.leadId, leadId)))
		.returning();
	if (!row) throw new NotFoundError("Reminder not found");

	const [author] = row.userId
		? await db
				.select({ name: users.name })
				.from(users)
				.where(eq(users.id, row.userId))
				.limit(1)
		: [undefined];

	return shapeReminder(row, author?.name ?? null);
}

export async function deleteReminder(
	leadId: string,
	id: string,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);
	const result = await db
		.delete(leadReminders)
		.where(and(eq(leadReminders.id, id), eq(leadReminders.leadId, leadId)))
		.returning({ id: leadReminders.id });
	if (result.length === 0) throw new NotFoundError("Reminder not found");
}
