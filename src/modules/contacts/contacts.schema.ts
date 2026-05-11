import { z } from "zod";

const baseContactFields = {
	name: z.string().min(1).max(511).optional(),
	title: z.string().max(255).optional(),
	account: z.string().max(255).optional(),
	accountId: z.uuid().optional(),
	email: z.email().optional(),
	phone: z.string().max(50).optional(),
	tags: z.array(z.string().min(1).max(80)).optional(),
	owner: z.uuid().optional(),
	last: z.string().max(255).optional(),
};

export const createContactSchema = z
	.object(baseContactFields)
	.refine((d) => Boolean(d.name), {
		message: "`name` is required",
		path: ["name"],
	});

export const updateContactSchema = z.object(baseContactFields);

export const listContactsQuerySchema = z.object({
	search: z.string().optional(),
	owner: z.uuid().optional(),
	tag: z.string().optional(),
	accountId: z.uuid().optional(),
	sortBy: z.enum(["createdAt", "updatedAt", "name"]).default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const bulkDeleteSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(200),
});

export const bulkReassignSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(200),
	owner: z.uuid(),
});

export const bulkAddTagSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(200),
	tag: z.string().min(1).max(80),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
export type BulkReassignInput = z.infer<typeof bulkReassignSchema>;
export type BulkAddTagInput = z.infer<typeof bulkAddTagSchema>;
