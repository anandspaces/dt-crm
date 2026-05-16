import { describe, expect, it } from "bun:test";
import { buildStreamXml } from "../../src/modules/vobiz/vobiz.service";

describe("vobiz buildStreamXml", () => {
	it("emits a well-formed Stream response", () => {
		const xml = buildStreamXml(
			"wss://example.com:3001/voice-stream?batchId=a&itemId=b",
			"https://example.com/api/v1/vobiz/stream-status?itemId=b",
		);
		expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		expect(xml).toContain("<Response>");
		expect(xml).toContain('<Stream bidirectional="true"');
		expect(xml).toContain('contentType="audio/x-mulaw;rate=8000"');
		expect(xml).toContain("/voice-stream");
		expect(xml).toContain("</Response>");
	});

	it("escapes ampersands in the websocket URL", () => {
		const xml = buildStreamXml(
			"wss://example.com/voice-stream?batchId=a&itemId=b&userId=c",
			"https://example.com/x?q=1&r=2",
		);
		// & must be encoded as &amp; in XML attribute values
		expect(xml).toContain("&amp;itemId=");
		expect(xml).toContain("&amp;userId=");
		// raw & should NOT appear as standalone in attribute values
		expect(xml.match(/&(?!amp;|lt;|gt;|quot;|apos;)/)).toBeNull();
	});

	it("escapes quotes and angle brackets", () => {
		const xml = buildStreamXml(
			'wss://x/y?evil="<script>alert(1)</script>"',
			"https://x/cb",
		);
		expect(xml).not.toContain("<script>");
		expect(xml).toContain("&lt;script&gt;");
		expect(xml).toContain("&quot;");
	});
});
