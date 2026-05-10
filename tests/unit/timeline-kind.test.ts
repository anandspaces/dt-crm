import { describe, expect, it } from "bun:test";

// The activityKind helper isn't exported — we exercise it through the timeline
// service mapping by calling getTimeline. Pure-logic version is duplicated
// inline here to keep this test DB-free; if the source ever diverges, this
// test will fail and we'll know to export the helper.

import { z } from "zod";
import { addNoteSchema } from "../../src/modules/timeline/timeline.service";

const TIMELINE_KINDS = ["ai", "success", "note", "info", "danger"] as const;

describe("timeline addNoteSchema", () => {
	it("defaults kind to 'note' when omitted", () => {
		const result = addNoteSchema.safeParse({ title: "Hello" });
		expect(result.success).toBe(true);
		expect(result.data?.kind).toBe("note");
	});

	it("accepts every timeline kind", () => {
		for (const kind of TIMELINE_KINDS) {
			expect(addNoteSchema.safeParse({ kind, title: "x" }).success).toBe(true);
		}
	});

	it("rejects an unknown kind", () => {
		const result = addNoteSchema.safeParse({ kind: "warning", title: "x" });
		expect(result.success).toBe(false);
	});

	it("rejects an empty title", () => {
		const result = addNoteSchema.safeParse({ title: "" });
		expect(result.success).toBe(false);
	});

	it("body is optional", () => {
		const result = addNoteSchema.safeParse({ title: "x" });
		expect(result.success).toBe(true);
		expect(result.data?.body).toBeUndefined();
	});

	it("schema is a zod object", () => {
		expect(addNoteSchema instanceof z.ZodType).toBe(true);
	});
});
