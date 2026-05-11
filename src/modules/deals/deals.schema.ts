import { z } from "zod";

export const DEAL_STAGE_VALUES = [
	"prospecting",
	"qualification",
	"proposal",
	"negotiation",
	"closed_won",
	"closed_lost",
] as const;

const baseDealFields = {
	name: z.string().min(1).max(511).optional(),
	account: z.string().max(255).optional(),
	accountId: z.uuid().optional(),
	contactId: z.uuid().optional(),
	amount: z.coerce.number().nonnegative().optional(),
	stage: z.enum(DEAL_STAGE_VALUES).optional(),
	closeDate: z.union([z.iso.date(), z.iso.datetime()]).optional(),
	owner: z.uuid().optional(),
	source: z.string().max(100).optional(),
	lastActivity: z.string().max(255).optional(),
	hot: z.boolean().optional(),
	ai: z.boolean().optional(),
	nextStep: z.string().optional(),
};

export const createDealSchema = z
	.object(baseDealFields)
	.refine((d) => Boolean(d.name), {
		message: "`name` is required",
		path: ["name"],
	});

export const updateDealSchema = z.object(baseDealFields);

export const listDealsQuerySchema = z.object({
	search: z.string().optional(),
	stage: z.enum(DEAL_STAGE_VALUES).optional(),
	owner: z.uuid().optional(),
	hot: z.coerce.boolean().optional(),
	ai: z.coerce.boolean().optional(),
	closeDateFrom: z.union([z.iso.date(), z.iso.datetime()]).optional(),
	closeDateTo: z.union([z.iso.date(), z.iso.datetime()]).optional(),
	sortBy: z
		.enum(["createdAt", "updatedAt", "name", "amount", "closeDate"])
		.default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const changeStageSchema = z.object({
	stage: z.enum(DEAL_STAGE_VALUES),
});

export const bulkDeleteSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(200),
});

export const bulkReassignSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(200),
	owner: z.uuid(),
});

export const bulkChangeStageSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(200),
	stage: z.enum(DEAL_STAGE_VALUES),
});

export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
export type ListDealsQuery = z.infer<typeof listDealsQuerySchema>;
export type ChangeStageInput = z.infer<typeof changeStageSchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
export type BulkReassignInput = z.infer<typeof bulkReassignSchema>;
export type BulkChangeStageInput = z.infer<typeof bulkChangeStageSchema>;
