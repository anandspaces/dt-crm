import { z } from "zod";

export const createAiAgentSchema = z.object({
	name: z.string().min(1).max(255),
	voice: z.string().max(100).optional(),
	systemInstruction: z.string().optional(),
});
export type CreateAiAgentInput = z.infer<typeof createAiAgentSchema>;

export const updateAiAgentSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	voice: z.string().max(100).optional(),
	systemInstruction: z.string().optional(),
	isActive: z.boolean().optional(),
});
export type UpdateAiAgentInput = z.infer<typeof updateAiAgentSchema>;

export const uploadRagSchema = z.object({
	chunks: z
		.array(
			z.object({
				content: z.string().min(1),
				embedding: z.array(z.number()).optional(),
				fileName: z.string().max(255).optional(),
				pageNumber: z.number().int().nonnegative().optional(),
				imageUrl: z.string().max(1024).optional(),
			}),
		)
		.min(1),
});
export type UploadRagInput = z.infer<typeof uploadRagSchema>;
