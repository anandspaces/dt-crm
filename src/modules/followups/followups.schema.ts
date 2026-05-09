import { z } from "zod";

export const createFollowupSchema = z.object({
	type: z.enum(["CALL", "EMAIL", "MEETING", "WHATSAPP"]),
	scheduledAt: z.iso.datetime(),
	assignedUserId: z.uuid().optional(),
	notes: z.string().optional(),
});

export const updateFollowupSchema = z.object({
	type: z.enum(["CALL", "EMAIL", "MEETING", "WHATSAPP"]).optional(),
	status: z.enum(["PENDING", "DONE", "MISSED", "CANCELLED"]).optional(),
	scheduledAt: z.iso.datetime().optional(),
	completedAt: z.iso.datetime().optional(),
	notes: z.string().optional(),
});

export const listFollowupsQuerySchema = z.object({
	status: z.enum(["PENDING", "DONE", "MISSED", "CANCELLED"]).optional(),
	from: z.iso.datetime().optional(),
	to: z.iso.datetime().optional(),
	assignedUserId: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	cursor: z.string().optional(),
});

export type CreateFollowupInput = z.infer<typeof createFollowupSchema>;
export type UpdateFollowupInput = z.infer<typeof updateFollowupSchema>;
export type ListFollowupsQuery = z.infer<typeof listFollowupsQuerySchema>;
