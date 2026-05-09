import { z } from "zod";

const STATUS_VALUES = [
	"NEW",
	"CONTACTED",
	"QUALIFIED",
	"PROPOSAL_SENT",
	"NEGOTIATION",
	"WON",
	"LOST",
	"ARCHIVED",
] as const;

const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const createLeadSchema = z.object({
	firstName: z.string().min(1).max(255),
	lastName: z.string().max(255).optional(),
	email: z.email().optional(),
	phone: z.string().max(50).optional(),
	company: z.string().max(255).optional(),
	jobTitle: z.string().max(255).optional(),
	website: z.url().optional(),
	source: z.string().max(100).optional(),
	sourceProvider: z.string().max(100).optional(),
	status: z.enum(STATUS_VALUES).default("NEW"),
	priority: z.enum(PRIORITY_VALUES).default("MEDIUM"),
	score: z.number().int().min(0).max(100).optional(),
	pipelineId: z.uuid().optional(),
	stageId: z.uuid().optional(),
	assignedUserId: z.uuid().optional(),
	notes: z.string().optional(),
});

export const updateLeadSchema = createLeadSchema.partial();

export const listLeadsQuerySchema = z.object({
	status: z.enum(STATUS_VALUES).optional(),
	priority: z.enum(PRIORITY_VALUES).optional(),
	assignedUserId: z.uuid().optional(),
	pipelineId: z.uuid().optional(),
	stageId: z.uuid().optional(),
	source: z.string().optional(),
	search: z.string().optional(),
	createdFrom: z.iso.datetime().optional(),
	createdTo: z.iso.datetime().optional(),
	sortBy: z.enum(["createdAt", "updatedAt", "score"]).default("createdAt"),
	sortDir: z.enum(["asc", "desc"]).default("desc"),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	cursor: z.string().optional(),
});

export const bulkLeadSchema = z.object({
	action: z.enum(["assign", "status", "delete"]),
	leadIds: z.array(z.uuid()).min(1).max(100),
	payload: z
		.object({
			assignedUserId: z.uuid().optional(),
			status: z.enum(STATUS_VALUES).optional(),
		})
		.optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
export type BulkLeadInput = z.infer<typeof bulkLeadSchema>;
