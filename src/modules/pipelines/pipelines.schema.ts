import { z } from "zod";

const stageSchema = z.object({
	name: z.string().min(1).max(255),
	position: z.number().int().min(0),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.default("#6366f1"),
	isClosed: z.boolean().default(false),
	isWon: z.boolean().default(false),
});

export const createPipelineSchema = z.object({
	name: z.string().min(1).max(255),
	description: z.string().optional(),
	stages: z.array(stageSchema).default([]),
});

export const updatePipelineSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	description: z.string().optional(),
});

export const addStageSchema = stageSchema;

export const updateStageSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	position: z.number().int().min(0).optional(),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.optional(),
	isClosed: z.boolean().optional(),
	isWon: z.boolean().optional(),
});

export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>;
export type AddStageInput = z.infer<typeof addStageSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
