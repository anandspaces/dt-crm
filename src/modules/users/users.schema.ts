import { z } from "zod";

export const updateUserSchema = z.object({
	name: z.string().min(2).max(255).optional(),
	role: z.enum(["ADMIN", "MANAGER", "SALES", "SUPPORT"]).optional(),
	isActive: z.boolean().optional(),
	password: z.string().min(8).optional(),
});

export const listUsersQuerySchema = z.object({
	role: z.enum(["ADMIN", "MANAGER", "SALES", "SUPPORT"]).optional(),
	search: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	cursor: z.string().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
