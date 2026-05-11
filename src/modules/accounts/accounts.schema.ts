import { z } from "zod";

export const ACCOUNT_TIER_VALUES = [
	"Strategic",
	"Enterprise",
	"Mid-Market",
	"SMB",
] as const;

export const ACCOUNT_TYPE_VALUES = [
	"Customer",
	"Prospect",
	"Partner",
	"Vendor",
	"Other",
] as const;

const baseAccountFields = {
	name: z.string().min(1).max(255).optional(),
	industry: z.string().max(100).optional(),
	tier: z.enum(ACCOUNT_TIER_VALUES).optional(),
	type: z.enum(ACCOUNT_TYPE_VALUES).optional(),
	city: z.string().max(255).optional(),
	revenue: z.string().max(100).optional(),
	employees: z.number().int().min(0).optional(),
	owner: z.uuid().optional(),
};

export const createAccountSchema = z
	.object(baseAccountFields)
	.refine((d) => Boolean(d.name), {
		message: "`name` is required",
		path: ["name"],
	});

export const updateAccountSchema = z.object(baseAccountFields);

export const listAccountsQuerySchema = z.object({
	search: z.string().optional(),
	tier: z.enum(ACCOUNT_TIER_VALUES).optional(),
	type: z.enum(ACCOUNT_TYPE_VALUES).optional(),
	owner: z.uuid().optional(),
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

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
export type BulkReassignInput = z.infer<typeof bulkReassignSchema>;
