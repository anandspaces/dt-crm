import { z } from "zod";

export const startBatchSchema = z.object({
	leads: z
		.array(
			z.object({
				name: z.string().max(255).optional(),
				phone: z.string().min(1).max(50),
				company: z.string().max(255).optional(),
				email: z.email().max(255).optional(),
				leadId: z.uuid().optional(),
			}),
		)
		.min(1),
	agentId: z.uuid().optional(),
	agentName: z.string().max(255).optional(),
	fromNumber: z.string().max(50).optional(),
});
export type StartBatchInput = z.infer<typeof startBatchSchema>;
