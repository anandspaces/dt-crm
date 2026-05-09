export type UserRole = "ADMIN" | "MANAGER" | "SALES" | "SUPPORT";

export interface JWTPayload {
	sub: string;
	email: string;
	role: UserRole;
	iat: number;
	exp: number;
}
