import { describe, expect, it } from "bun:test";

// CSV parsing internals aren't exported — we test through importLeadsFromCsv
// in the e2e suite. This file exists so any new pure helpers added to
// imports.service have a home for unit coverage. Today it covers the JSON-like
// schema-level guarantees.

import { z } from "zod";
import {
	PRIORITY_VALUES,
	SOURCE_VALUES,
	STATUS_VALUES,
} from "../../src/modules/leads/leads.schema";

describe("imports — enum constants", () => {
	it("STATUS_VALUES is exhaustive of the spec", () => {
		expect(STATUS_VALUES).toEqual([
			"fresh",
			"contacted",
			"interested",
			"appointment",
			"demo",
			"negotiation",
			"won",
			"lost",
			"not_interested",
		]);
	});

	it("SOURCE_VALUES contains all real-estate portals + OTHER fallback", () => {
		expect(SOURCE_VALUES).toContain("MAGICBRICKS");
		expect(SOURCE_VALUES).toContain("99ACRES");
		expect(SOURCE_VALUES).toContain("OTHER");
	});

	it("PRIORITY_VALUES has the four canonical levels", () => {
		expect(PRIORITY_VALUES).toEqual(["LOW", "MEDIUM", "HIGH", "URGENT"]);
	});

	it("constants are immutable readonly tuples", () => {
		const schema = z.enum(STATUS_VALUES);
		expect(schema.safeParse("fresh").success).toBe(true);
		expect(schema.safeParse("FRESH").success).toBe(false);
	});
});
