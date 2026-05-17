import { and, inArray, isNull } from "drizzle-orm";
import { db } from "../../config/db";
import { leadActivities, leads } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { PRIORITY_VALUES, SOURCE_VALUES, STATUS_VALUES } from "./leads.schema";
import { splitName } from "./leads.shape";

export interface ImportError {
	row: number;
	reason: string;
}

export interface ImportResult {
	imported: number;
	skipped: number;
	errors: ImportError[];
}

function parseCsvLine(line: string): string[] {
	const out: string[] = [];
	let cur = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i] ?? "";
		if (inQuotes) {
			if (ch === '"' && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else if (ch === '"') {
				inQuotes = false;
			} else {
				cur += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === ",") {
			out.push(cur);
			cur = "";
		} else {
			cur += ch;
		}
	}
	out.push(cur);
	return out.map((s) => s.trim());
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
	const lines = text
		.replace(/^﻿/, "")
		.split(/\r?\n/)
		.filter((l) => l.length > 0);
	const first = lines[0];
	if (!first) return { header: [], rows: [] };
	const header = parseCsvLine(first).map((h) => h.toLowerCase());
	const rows = lines.slice(1).map(parseCsvLine);
	return { header, rows };
}

function cell(row: string[], idx: number): string {
	if (idx < 0) return "";
	return row[idx] ?? "";
}

function normalizeStatus(v: string): string {
	if (!v) return "fresh";
	const lower = v.trim().toLowerCase();
	return (STATUS_VALUES as readonly string[]).includes(lower) ? lower : "fresh";
}

function normalizePriority(v: string): string {
	if (!v) return "MEDIUM";
	const upper = v.trim().toUpperCase();
	return (PRIORITY_VALUES as readonly string[]).includes(upper)
		? upper
		: "MEDIUM";
}

interface StagedRow {
	lineNumber: number;
	phoneNormalized: string;
	insert: typeof leads.$inferInsert;
}

export async function importLeadsFromCsv(
	csv: string,
	actor: JWTPayload,
): Promise<ImportResult> {
	const { header, rows } = parseCsv(csv);
	const colIdx = (n: string) => header.indexOf(n.toLowerCase());

	const idx = {
		name: colIdx("name"),
		phone: colIdx("phone"),
		email: colIdx("email"),
		source: colIdx("source"),
		city: colIdx("city"),
		budget: colIdx("budget"),
		requirement: colIdx("requirement"),
		status: colIdx("status"),
		notes: colIdx("notes"),
		assignedTo: colIdx("assignedto"),
		tags: colIdx("tags"),
		priority: colIdx("priority"),
	};

	const errors: ImportError[] = [];
	const staged: StagedRow[] = [];

	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		if (!r) continue;
		const lineNumber = i + 2;
		const name = cell(r, idx.name);
		const phone = cell(r, idx.phone);
		const sourceRaw = cell(r, idx.source);

		if (!name) {
			errors.push({ row: lineNumber, reason: "Missing name" });
			continue;
		}
		if (!phone || phone.replace(/\D/g, "").length < 7) {
			errors.push({ row: lineNumber, reason: "Invalid phone number" });
			continue;
		}
		if (!sourceRaw) {
			errors.push({ row: lineNumber, reason: "Missing source" });
			continue;
		}
		const sourceUpper = sourceRaw.trim().toUpperCase();
		if (!(SOURCE_VALUES as readonly string[]).includes(sourceUpper)) {
			errors.push({
				row: lineNumber,
				reason: `Unknown source: ${sourceRaw}`,
			});
			continue;
		}

		const { firstName, lastName } = splitName(name);
		const tagsRaw = cell(r, idx.tags);
		staged.push({
			lineNumber,
			phoneNormalized: phone,
			insert: {
				firstName,
				lastName: lastName ?? null,
				phone,
				email: cell(r, idx.email) || null,
				source: sourceUpper as never,
				city: cell(r, idx.city) || null,
				budget: cell(r, idx.budget) || null,
				requirement: cell(r, idx.requirement) || null,
				status: normalizeStatus(cell(r, idx.status)) as never,
				priority: normalizePriority(cell(r, idx.priority)) as never,
				notes: cell(r, idx.notes) || null,
				tags: tagsRaw
					? tagsRaw
							.split(/[;|]/)
							.map((s) => s.trim())
							.filter(Boolean)
					: [],
				assignedUserId: cell(r, idx.assignedTo) || null,
			},
		});
	}

	let skipped = 0;
	let toInsert = staged;

	if (staged.length > 0) {
		const phones = [...new Set(staged.map((s) => s.phoneNormalized))];
		const existing = await db
			.select({ phone: leads.phone })
			.from(leads)
			.where(and(inArray(leads.phone, phones), isNull(leads.deletedAt)));
		const existingSet = new Set(existing.map((r) => r.phone));

		// Also de-dupe phones that appear multiple times within the same CSV:
		// keep the first, count the rest as skipped.
		const seenInBatch = new Set<string>();
		const filtered: StagedRow[] = [];
		for (const row of staged) {
			if (existingSet.has(row.phoneNormalized)) {
				skipped++;
				continue;
			}
			if (seenInBatch.has(row.phoneNormalized)) {
				skipped++;
				continue;
			}
			seenInBatch.add(row.phoneNormalized);
			filtered.push(row);
		}
		toInsert = filtered;
	}

	let inserted: { id: string }[] = [];
	if (toInsert.length > 0) {
		inserted = await db
			.insert(leads)
			.values(toInsert.map((s) => s.insert))
			.returning({ id: leads.id });
	}

	if (inserted.length > 0) {
		await db.insert(leadActivities).values(
			inserted.map((row) => ({
				leadId: row.id,
				userId: actor.sub,
				type: "SYSTEM" as const,
				title: "Imported via CSV",
			})),
		);
	}

	return {
		imported: inserted.length,
		skipped,
		errors,
	};
}
