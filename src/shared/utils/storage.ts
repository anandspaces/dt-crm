import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "../../config/env";
import { logger } from "./logger";

export const UPLOADS_DIR = resolve(process.cwd(), "uploads");

function ensureDir(dir: string): void {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

export interface StoredFile {
	relativePath: string;
	url: string;
}

export async function saveLeadDocument(
	leadId: string,
	originalName: string,
	buffer: Buffer,
): Promise<StoredFile> {
	const leadDir = join(UPLOADS_DIR, "leads", leadId);
	ensureDir(leadDir);

	const safe = sanitizeFilename(originalName) || "file";
	const filename = `${randomUUID()}-${safe}`;
	const absPath = join(leadDir, filename);
	await writeFile(absPath, buffer);

	const relativePath = `uploads/leads/${leadId}/${filename}`;
	const url = `${env.APP_URL.replace(/\/$/, "")}/${relativePath}`;
	return { relativePath, url };
}

export function deleteLeadDocument(relativePath: string): void {
	if (!relativePath.startsWith("uploads/")) return;
	const abs = resolve(process.cwd(), relativePath);
	if (!abs.startsWith(UPLOADS_DIR)) return;
	try {
		unlinkSync(abs);
	} catch (err) {
		logger.warn("storage.delete failed", {
			path: relativePath,
			message: err instanceof Error ? err.message : String(err),
		});
	}
}

export function urlToRelativePath(url: string): string | null {
	const idx = url.indexOf("/uploads/");
	if (idx === -1) return null;
	return url.slice(idx + 1);
}
