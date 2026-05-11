import { and, inArray, isNull } from "drizzle-orm";
import { db } from "../../config/db";
import { contacts } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";

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

interface StagedRow {
	lineNumber: number;
	emailKey: string;
	insert: typeof contacts.$inferInsert;
}

export async function importContactsFromCsv(
	csv: string,
	actor: JWTPayload,
): Promise<ImportResult> {
	const { header, rows } = parseCsv(csv);
	const colIdx = (n: string) => header.indexOf(n.toLowerCase());

	const idx = {
		name: colIdx("name"),
		title: colIdx("title"),
		account: colIdx("account"),
		email: colIdx("email"),
		phone: colIdx("phone"),
		tags: colIdx("tags"),
		owner: colIdx("owner"),
	};

	const errors: ImportError[] = [];
	const staged: StagedRow[] = [];

	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		if (!r) continue;
		const lineNumber = i + 2;
		const name = cell(r, idx.name);
		const email = cell(r, idx.email);

		if (!name) {
			errors.push({ row: lineNumber, reason: "Missing name" });
			continue;
		}

		const tagsRaw = cell(r, idx.tags);
		staged.push({
			lineNumber,
			emailKey: email.toLowerCase(),
			insert: {
				name,
				title: cell(r, idx.title) || null,
				account: cell(r, idx.account) || null,
				email: email || null,
				phone: cell(r, idx.phone) || null,
				tags: tagsRaw
					? tagsRaw
							.split(/[;|]/)
							.map((s) => s.trim())
							.filter(Boolean)
					: [],
				ownerUserId: cell(r, idx.owner) || actor.sub,
			},
		});
	}

	let skipped = 0;
	let toInsert = staged;

	if (staged.length > 0) {
		const emails = [...new Set(staged.map((s) => s.emailKey).filter(Boolean))];
		const existingSet = new Set<string>();
		if (emails.length > 0) {
			const existing = await db
				.select({ email: contacts.email })
				.from(contacts)
				.where(
					and(inArray(contacts.email, emails), isNull(contacts.deletedAt)),
				);
			for (const e of existing) {
				if (e.email) existingSet.add(e.email.toLowerCase());
			}
		}
		const seenInBatch = new Set<string>();
		const filtered: StagedRow[] = [];
		for (const row of staged) {
			if (row.emailKey && existingSet.has(row.emailKey)) {
				skipped++;
				continue;
			}
			if (row.emailKey && seenInBatch.has(row.emailKey)) {
				skipped++;
				continue;
			}
			if (row.emailKey) seenInBatch.add(row.emailKey);
			filtered.push(row);
		}
		toInsert = filtered;
	}

	let inserted = 0;
	if (toInsert.length > 0) {
		const result = await db
			.insert(contacts)
			.values(toInsert.map((s) => s.insert))
			.returning({ id: contacts.id });
		inserted = result.length;
	}

	return { imported: inserted, skipped, errors };
}
