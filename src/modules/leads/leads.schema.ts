import { z } from "zod";

export const STATUS_VALUES = [
	"fresh",
	"contacted",
	"interested",
	"appointment",
	"demo",
	"negotiation",
	"won",
	"lost",
	"not_interested",
] as const;

export const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const SOURCE_VALUES = [
	"99ACRES",
	"MAGICBRICKS",
	"HOUSING",
	"JUSTDIAL",
	"META_ADS",
	"GOOGLE_ADS",
	"REFERRAL",
	"WALK_IN",
	"LINKEDIN",
	"WEBSITE",
	"OTHER",
] as const;

export const GROUP_VALUES = ["urgent", "today", "fresh"] as const;

const baseLeadFields = {
	name: z.string().min(1).max(511).optional(),
	firstName: z.string().min(1).max(255).optional(),
	lastName: z.string().max(255).optional(),
	email: z.email().optional(),
	phone: z.string().max(50).optional(),
	company: z.string().max(255).optional(),
	jobTitle: z.string().max(255).optional(),
	website: z.url().optional(),
	source: z.enum(SOURCE_VALUES).optional(),
	sourceProvider: z.string().max(100).optional(),
	status: z.enum(STATUS_VALUES).optional(),
	priority: z.enum(PRIORITY_VALUES).optional(),
	score: z.number().int().min(0).max(100).optional(),
	hot: z.boolean().optional(),
	city: z.string().max(255).optional(),
	budget: z.string().max(100).optional(),
	requirement: z.string().max(255).optional(),
	tags: z.array(z.string().min(1).max(80)).optional(),
	pipelineId: z.uuid().optional(),
	stageId: z.uuid().optional(),
	assignedUserId: z.uuid().optional(),
	notes: z.string().optional(),
};

export const createLeadSchema = z
	.object({
		...baseLeadFields,
	})
	.refine((d) => Boolean(d.name || d.firstName), {
		message: "Either `name` or `firstName` is required",
		path: ["name"],
	})
	.refine((d) => Boolean(d.phone), {
		message: "`phone` is required",
		path: ["phone"],
	})
	.refine((d) => Boolean(d.source), {
		message: "`source` is required",
		path: ["source"],
	});

export const updateLeadSchema = z.object(baseLeadFields);

export const listLeadsQuerySchema = z.object({
	source: z.enum(SOURCE_VALUES).optional(),
	status: z.enum(STATUS_VALUES).optional(),
	priority: z.enum(PRIORITY_VALUES).optional(),
	scoreMin: z.coerce.number().int().min(0).max(100).optional(),
	scoreMax: z.coerce.number().int().min(0).max(100).optional(),
	hot: z.coerce.boolean().optional(),
	group: z.enum(GROUP_VALUES).optional(),
	assignedTo: z.uuid().optional(),
	pipelineId: z.uuid().optional(),
	stageId: z.uuid().optional(),
	city: z.string().optional(),
	search: z.string().optional(),
	dateFrom: z.union([z.iso.date(), z.iso.datetime()]).optional(),
	dateTo: z.union([z.iso.date(), z.iso.datetime()]).optional(),
	sortBy: z
		.enum(["createdAt", "updatedAt", "score", "name", "lastContactedAt"])
		.default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const bulkTransferSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(200),
	assignedTo: z.uuid(),
});

export const bulkStatusSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(200),
	status: z.enum(STATUS_VALUES),
});

export const bulkWhatsappSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(200),
	message: z.string().min(1).max(4096),
});

export const bulkCampaignSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(200),
	campaignId: z.string().min(1).max(100),
});

export const bulkAiNurtureSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(200),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
export type BulkTransferInput = z.infer<typeof bulkTransferSchema>;
export type BulkStatusInput = z.infer<typeof bulkStatusSchema>;
export type BulkWhatsappInput = z.infer<typeof bulkWhatsappSchema>;
export type BulkCampaignInput = z.infer<typeof bulkCampaignSchema>;
export type BulkAiNurtureInput = z.infer<typeof bulkAiNurtureSchema>;
