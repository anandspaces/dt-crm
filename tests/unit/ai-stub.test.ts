import { describe, expect, it } from "bun:test";
import { pickAction } from "../../src/modules/ai/ai.service";

describe("pickAction", () => {
	it("returns 'call' for high-intent leads (score >= 80)", () => {
		expect(pickAction(80)).toBe("call");
		expect(pickAction(99)).toBe("call");
		expect(pickAction(100)).toBe("call");
	});

	it("returns 'whatsapp' for warm leads (50 <= score < 80)", () => {
		expect(pickAction(50)).toBe("whatsapp");
		expect(pickAction(70)).toBe("whatsapp");
		expect(pickAction(79)).toBe("whatsapp");
	});

	it("returns 'email' for cold leads (score < 50)", () => {
		expect(pickAction(49)).toBe("email");
		expect(pickAction(0)).toBe("email");
	});
});
