import { db } from "../../config/db";
import { dealStageHistory, deals } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { DEAL_STAGE_VALUES } from "./deals.schema";

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

function normalizeStage(v: string): string {
	if (!v) return "prospecting";
	const lower = v
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	return (DEAL_STAGE_VALUES as readonly string[]).includes(lower)
		? lower
		: "prospecting";
}

interface StagedRow {
	lineNumber: number;
	insert: typeof deals.$inferInsert;
}

export async function importDealsFromCsv(
	csv: string,
	actor: JWTPayload,
): Promise<ImportResult> {
	const { header, rows } = parseCsv(csv);
	const colIdx = (n: string) => header.indexOf(n.toLowerCase());

	const idx = {
		name: colIdx("name"),
		account: colIdx("account"),
		amount: colIdx("amount"),
		stage: colIdx("stage"),
		closeDate: colIdx("closedate"),
		source: colIdx("source"),
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
		const amountRaw = cell(r, idx.amount);
		const amount = amountRaw ? Number.parseFloat(amountRaw) : 0;
		if (amountRaw && !Number.isFinite(amount)) {
			errors.push({
				row: lineNumber,
				reason: `Invalid amount: ${amountRaw}`,
			});
			continue;
		}
		const closeDateRaw = cell(r, idx.closeDate);
		const closeDate = closeDateRaw ? new Date(closeDateRaw) : null;
		if (closeDateRaw && Number.isNaN(closeDate?.getTime() ?? Number.NaN)) {
			errors.push({
				row: lineNumber,
				reason: `Invalid closeDate: ${closeDateRaw}`,
			});
			continue;
		}

		staged.push({
			lineNumber,
			insert: {
				name,
				account: cell(r, idx.account) || null,
				amount: amount.toFixed(2),
				stage: normalizeStage(cell(r, idx.stage)) as never,
				closeDate,
				source: cell(r, idx.source) || null,
				ownerUserId: cell(r, idx.owner) || actor.sub,
			},
		});
	}

	let inserted: { id: string; stage: typeof deals.$inferSelect.stage }[] = [];
	if (staged.length > 0) {
		inserted = await db
			.insert(deals)
			.values(staged.map((s) => s.insert))
			.returning({ id: deals.id, stage: deals.stage });
	}

	if (inserted.length > 0) {
		await db.insert(dealStageHistory).values(
			inserted.map((row) => ({
				dealId: row.id,
				fromStage: null,
				toStage: row.stage,
				changedByUserId: actor.sub,
			})),
		);
	}

	return { imported: inserted.length, skipped: 0, errors };
}
