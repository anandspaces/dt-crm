import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { env } from "../../config/env";
import { logger } from "./logger";

// ─── Layout ──────────────────────────────────────────────────────────────────
// uploads/
// ├── leads/<leadId>/<uuid>-<sanitized>          (lead documents)
// └── calls/<batchId>/<itemId>/                  (per-call folder)
//     ├── recording.<ext>
//     ├── transcript.txt
//     └── analysis.json                          (future)
//
// All write helpers return a `StorageKey` — a forward-slash, root-relative path
// (e.g. `calls/<batchId>/<itemId>/recording.mp3`). The DB stores keys, never
// absolute paths, so swapping the backend (local → GCS) only touches this file.

export const UPLOADS_DIR = resolve(process.cwd(), "uploads");
export const URL_PREFIX = "/uploads";

export type StorageKey = string;

export interface StoredFile {
	key: StorageKey;
	url: string;
}

function ensureDirSync(dir: string): void {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

/** Resolve a storage key to its absolute filesystem path, refusing traversal. */
export function keyToAbs(key: StorageKey): string {
	const abs = resolve(UPLOADS_DIR, key);
	if (abs !== UPLOADS_DIR && !abs.startsWith(UPLOADS_DIR + sep)) {
		throw new Error(`storage: key escapes uploads root: ${key}`);
	}
	return abs;
}

/** Build the public URL for a stored object. */
export function keyToUrl(key: StorageKey): string {
	const base = env.APP_URL.replace(/\/$/, "");
	return `${base}${URL_PREFIX}/${key}`;
}

/** Inverse of `keyToUrl` — extracts the key from a stored URL. Returns null if
 *  the URL isn't one this backend issued. */
export function urlToKey(url: string): StorageKey | null {
	const marker = `${URL_PREFIX}/`;
	const idx = url.indexOf(marker);
	if (idx === -1) return null;
	return url.slice(idx + marker.length);
}

// ─── Lead documents ──────────────────────────────────────────────────────────

export async function saveLeadDocument(
	leadId: string,
	originalName: string,
	buffer: Buffer,
): Promise<StoredFile> {
	const safe = sanitizeFilename(originalName) || "file";
	const filename = `${randomUUID()}-${safe}`;
	const key: StorageKey = `leads/${leadId}/${filename}`;

	const abs = keyToAbs(key);
	ensureDirSync(dirname(abs));
	await writeFile(abs, buffer);

	return { key, url: keyToUrl(key) };
}

// ─── Call artifacts (recording + transcript + analysis) ──────────────────────

/** The bucket-key prefix for one call's artifacts. */
export function callArtifactKey(batchId: string, itemId: string): StorageKey {
	return `calls/${batchId}/${itemId}`;
}

export async function ensureCallArtifactDir(
	batchId: string,
	itemId: string,
): Promise<StorageKey> {
	const key = callArtifactKey(batchId, itemId);
	await mkdir(keyToAbs(key), { recursive: true });
	return key;
}

export async function saveCallRecording(
	batchId: string,
	itemId: string,
	ext: string,
	buffer: Buffer,
): Promise<StoredFile> {
	const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "mp3";
	const key: StorageKey = `${callArtifactKey(batchId, itemId)}/recording.${safeExt}`;
	const abs = keyToAbs(key);
	await mkdir(dirname(abs), { recursive: true });
	await writeFile(abs, buffer);
	return { key, url: keyToUrl(key) };
}

/** Append a line to the per-call transcript.txt. Creates the file/dir on demand. */
export async function appendCallTranscript(
	batchId: string,
	itemId: string,
	line: string,
): Promise<void> {
	const key = `${callArtifactKey(batchId, itemId)}/transcript.txt`;
	const abs = keyToAbs(key);
	await mkdir(dirname(abs), { recursive: true });
	await appendFile(abs, line.endsWith("\n") ? line : `${line}\n`, "utf8");
}

// ─── Deletion ────────────────────────────────────────────────────────────────

export function deleteByKey(key: StorageKey): void {
	let abs: string;
	try {
		abs = keyToAbs(key);
	} catch {
		return;
	}
	try {
		unlinkSync(abs);
	} catch (err) {
		logger.warn("storage.delete failed", {
			key,
			message: err instanceof Error ? err.message : String(err),
		});
	}
}
