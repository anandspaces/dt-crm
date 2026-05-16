import { describe, expect, it } from "bun:test";
import { analyzeCallTranscript } from "../../src/shared/services/gemini-text";

// These tests exercise the safe-fallback paths only — no live Gemini call.
// .env.test intentionally leaves GEMINI_API_KEY unset, which makes
// analyzeCallTranscript short-circuit to the zero-analysis result.

describe("gemini-text — analyzeCallTranscript (no API key)", () => {
	it("returns zero analysis for an empty transcript", async () => {
		const result = await analyzeCallTranscript("");
		expect(result.summary).toMatch(/no transcript/i);
		expect(result.sentimentLabel).toBe("neutral");
		expect(result.sentimentScore).toBe(0);
		expect(result.engagement).toBe(0);
		expect(result.leadScore).toBe(0);
	});

	it("returns zero analysis for a whitespace-only transcript", async () => {
		const result = await analyzeCallTranscript("   \n\t  ");
		expect(result.sentimentLabel).toBe("neutral");
		expect(result.engagement).toBe(0);
	});

	it("returns zero analysis when the API key is missing, never throws", async () => {
		// Even with real-ish content, missing key takes the safe path.
		const result = await analyzeCallTranscript(
			"agent: Hi there. user: Hello.",
			"Priya",
		);
		expect(result).toMatchObject({
			sentimentLabel: "neutral",
			sentimentScore: 0,
		});
		expect(typeof result.summary).toBe("string");
	});
});
