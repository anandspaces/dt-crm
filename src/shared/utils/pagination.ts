export interface CursorData {
	id: string;
	createdAt: string;
}

export function encodeCursor(id: string, createdAt: Date): string {
	const cursor: CursorData = { id, createdAt: createdAt.toISOString() };
	return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(cursor: string): { id: string; createdAt: Date } {
	try {
		const parsed = JSON.parse(
			Buffer.from(cursor, "base64url").toString("utf8"),
		) as CursorData;
		return { id: parsed.id, createdAt: new Date(parsed.createdAt) };
	} catch {
		throw new Error("Invalid pagination cursor");
	}
}

/**
 * Slices rows fetched with limit+1 and returns cursor + data.
 * Uses DESC order: cursor encodes the last returned item.
 * WHERE clause in repository: (created_at < cursor.createdAt)
 *   OR (created_at = cursor.createdAt AND id < cursor.id)
 */
export function buildPage<T extends { id: string; createdAt: Date }>(
	rows: T[],
	limit: number,
): { data: T[]; nextCursor: string | null } {
	const hasNextPage = rows.length > limit;
	const data = hasNextPage ? rows.slice(0, limit) : rows;
	const lastRow = data[data.length - 1];
	const nextCursor =
		hasNextPage && lastRow ? encodeCursor(lastRow.id, lastRow.createdAt) : null;
	return { data, nextCursor };
}
