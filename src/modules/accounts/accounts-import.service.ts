import { and, inArray, isNull } from "drizzle-orm";
import { db } from "../../config/db";
import { accounts } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { ACCOUNT_TIER_VALUES, ACCOUNT_TYPE_VALUES } from "./accounts.schema";

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

function normalizeTier(v: string): string | null {
	if (!v) return null;
	const match = (ACCOUNT_TIER_VALUES as readonly string[]).find(
		(t) => t.toLowerCase() === v.toLowerCase(),
	);
	return match ?? null;
}

function normalizeType(v: string): string | null {
	if (!v) return null;
	const match = (ACCOUNT_TYPE_VALUES as readonly string[]).find(
		(t) => t.toLowerCase() === v.toLowerCase(),
	);
	return match ?? null;
}

interface StagedRow {
	lineNumber: number;
	nameKey: string;
	insert: typeof accounts.$inferInsert;
}

export async function importAccountsFromCsv(
	csv: string,
	actor: JWTPayload,
): Promise<ImportResult> {
	const { header, rows } = parseCsv(csv);
	const colIdx = (n: string) => header.indexOf(n.toLowerCase());

	const idx = {
		name: colIdx("name"),
		industry: colIdx("industry"),
		tier: colIdx("tier"),
		type: colIdx("type"),
		city: colIdx("city"),
		revenue: colIdx("revenue"),
		employees: colIdx("employees"),
		owner: colIdx("owner"),
	};

	const errors: ImportError[] = [];
	const staged: StagedRow[] = [];

	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		if (!r) continue;
		const lineNumber = i + 2;
		const name = cell(r, idx.name);
		if (!name) {
			errors.push({ row: lineNumber, reason: "Missing name" });
			continue;
		}

		const employeesRaw = cell(r, idx.employees);
		const employees = employeesRaw
			? Number.parseInt(employeesRaw, 10)
			: undefined;

		staged.push({
			lineNumber,
			nameKey: name.toLowerCase(),
			insert: {
				name,
				industry: cell(r, idx.industry) || null,
				tier: normalizeTier(cell(r, idx.tier)) as never,
				type: normalizeType(cell(r, idx.type)) as never,
				city: cell(r, idx.city) || null,
				revenue: cell(r, idx.revenue) || null,
				employees: Number.isFinite(employees) ? (employees as number) : null,
				ownerUserId: cell(r, idx.owner) || actor.sub,
			},
		});
	}

	let skipped = 0;
	let toInsert = staged;

	if (staged.length > 0) {
		const names = [...new Set(staged.map((s) => s.nameKey))];
		const existing = await db
			.select({ name: accounts.name })
			.from(accounts)
			.where(and(inArray(accounts.name, names), isNull(accounts.deletedAt)));
		const existingSet = new Set(existing.map((r) => r.name.toLowerCase()));
		const seenInBatch = new Set<string>();
		const filtered: StagedRow[] = [];
		for (const row of staged) {
			if (existingSet.has(row.nameKey)) {
				skipped++;
				continue;
			}
			if (seenInBatch.has(row.nameKey)) {
				skipped++;
				continue;
			}
			seenInBatch.add(row.nameKey);
			filtered.push(row);
		}
		toInsert = filtered;
	}

	let inserted = 0;
	if (toInsert.length > 0) {
		const result = await db
			.insert(accounts)
			.values(toInsert.map((s) => s.insert))
			.returning({ id: accounts.id });
		inserted = result.length;
	}

	return { imported: inserted, skipped, errors };
}
