import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import { env } from "./env";

const client = postgres(env.DATABASE_URL, { max: 20 });
export const db = drizzle(client, { schema });
export type DB = typeof db;

/** Lightweight connectivity check (called at server startup). */
export async function verifyDatabaseConnection(): Promise<void> {
	await db.execute(sql`SELECT 1`);
}
