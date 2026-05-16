import { execSync } from "node:child_process";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

const { users, leads, pipelines, pipelineStages, leadReminders } = schema;

// Shared DB client for fixtures — lazy, won't connect until first query
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
	throw new Error("DATABASE_URL is not set — run with --env-file .env.test");
const client = postgres(databaseUrl, { max: 5 });
export const testDb = drizzle(client, { schema });

// Re-export app for supertest — import.meta.main guard prevents listen()
export { default as app } from "../src/index";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LeadStatus =
	| "fresh"
	| "contacted"
	| "interested"
	| "appointment"
	| "demo"
	| "negotiation"
	| "won"
	| "lost"
	| "not_interested";

export type Role = "ADMIN" | "MANAGER" | "SALES" | "SUPPORT";

// ── Fixtures ──────────────────────────────────────────────────────────────────

export async function createUser(
	overrides: Partial<{
		name: string;
		email: string;
		password: string;
		role: Role;
	}> = {},
) {
	const [user] = await testDb
		.insert(users)
		.values({
			name: overrides.name ?? "Test User",
			email:
				overrides.email ??
				`user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
			passwordHash: await bcrypt.hash(overrides.password ?? "password123", 10),
			role: overrides.role ?? "SALES",
		})
		.returning();
	if (!user) throw new Error("createUser: DB insert returned no rows");
	return user;
}

export async function createPipeline(name = "Test Pipeline") {
	const [pipeline] = await testDb
		.insert(pipelines)
		.values({ name })
		.returning();
	if (!pipeline)
		throw new Error("createPipeline: pipeline insert returned no rows");

	const [stage] = await testDb
		.insert(pipelineStages)
		.values({ pipelineId: pipeline.id, name: "Stage 1", position: 1 })
		.returning();
	if (!stage) throw new Error("createPipeline: stage insert returned no rows");

	return { pipeline, stage };
}

export async function createLead(
	overrides: Partial<{
		firstName: string;
		lastName: string;
		email: string;
		phone: string;
		source: string;
		status: LeadStatus;
		city: string;
		budget: string;
		requirement: string;
		hot: boolean;
		score: number;
		assignedUserId: string;
		pipelineId: string;
		stageId: string;
		lastContactedAt: Date | null;
	}> = {},
) {
	const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const [lead] = await testDb
		.insert(leads)
		.values({
			firstName: overrides.firstName ?? "Test",
			lastName: overrides.lastName,
			email: overrides.email ?? `lead-${suffix}@test.local`,
			phone:
				overrides.phone ?? `+91-9${suffix.slice(0, 9).replace(/\D/g, "0")}`,
			source: overrides.source ?? "WEBSITE",
			status: overrides.status ?? "fresh",
			city: overrides.city,
			budget: overrides.budget,
			requirement: overrides.requirement,
			hot: overrides.hot ?? false,
			score: overrides.score ?? 0,
			assignedUserId: overrides.assignedUserId,
			pipelineId: overrides.pipelineId,
			stageId: overrides.stageId,
			lastContactedAt: overrides.lastContactedAt,
		})
		.returning();
	if (!lead) throw new Error("createLead: DB insert returned no rows");
	return lead;
}

export async function createReminder(
	leadId: string,
	dueAt: Date,
	overrides: Partial<{ title: string; userId: string }> = {},
) {
	const [row] = await testDb
		.insert(leadReminders)
		.values({
			leadId,
			userId: overrides.userId,
			title: overrides.title ?? "Follow up",
			dueAt,
		})
		.returning();
	if (!row) throw new Error("createReminder: DB insert returned no rows");
	return row;
}

// Wipes all tables in dependency-safe order. Call in beforeAll/afterAll.
export async function truncateAll() {
	await testDb.execute(
		`TRUNCATE TABLE
      call_queue_items, call_batches, rag_knowledge, ai_agents,
      lead_reminders, lead_payments, lead_documents, lead_calls, lead_messages,
      lead_tags, lead_notes, lead_activities, ai_lead_summaries,
      followups, lead_imports, webhook_events, password_reset_tokens,
      email_otps, leads, pipeline_stages, pipelines, tags,
      automation_rules, integrations, users
    RESTART IDENTITY CASCADE`,
	);
}

// ── DB Bootstrap (runs when executed directly: bun db:test:setup) ─────────────

async function bootstrapTestDb() {
	const dbUrl = process.env.DATABASE_URL;
	if (!dbUrl) throw new Error("DATABASE_URL is not set");
	const dbName = new URL(dbUrl).pathname.replace("/", "");
	const adminUrl = dbUrl.replace(`/${dbName}`, "/postgres");

	console.log(`[test:setup] Ensuring database "${dbName}" exists...`);
	const admin = postgres(adminUrl, { max: 1 });
	try {
		await admin.unsafe(`CREATE DATABASE "${dbName}"`);
		console.log(`[test:setup] Created database "${dbName}"`);
	} catch (err: unknown) {
		const code = (err as { code?: string }).code;
		if (code !== "42P04") throw err;
		console.log(`[test:setup] Database "${dbName}" already exists`);
	} finally {
		await admin.end();
	}

	console.log("[test:setup] Running migrations...");
	execSync("bun run db:migrate", {
		env: { ...process.env, DATABASE_URL: dbUrl },
		stdio: "inherit",
		cwd: resolve(import.meta.dir, ".."),
	});
	console.log("[test:setup] Done.");

	process.exit(0);
}

if (import.meta.main) {
	await bootstrapTestDb();
}
