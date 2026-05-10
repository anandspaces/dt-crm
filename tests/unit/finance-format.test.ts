import { describe, expect, it } from "bun:test";
import {
	inrFormat,
	parseDealValue,
} from "../../src/modules/finance/finance.service";

describe("parseDealValue", () => {
	it("parses lakhs (L suffix, case-insensitive)", () => {
		expect(parseDealValue("₹45L")).toBe(45_00_000);
		expect(parseDealValue("45l")).toBe(45_00_000);
		expect(parseDealValue("1.2L")).toBe(1_20_000);
	});

	it("parses crores (Cr suffix, case-insensitive)", () => {
		expect(parseDealValue("₹1.2Cr")).toBe(1_20_00_000);
		expect(parseDealValue("2cr")).toBe(2_00_00_000);
	});

	it("parses thousands (K suffix)", () => {
		expect(parseDealValue("500K")).toBe(500_000);
		expect(parseDealValue("12.5k")).toBe(12_500);
	});

	it("parses a bare number", () => {
		expect(parseDealValue("250000")).toBe(250_000);
	});

	it("returns 0 for null/undefined/empty/non-numeric", () => {
		expect(parseDealValue(null)).toBe(0);
		expect(parseDealValue(undefined)).toBe(0);
		expect(parseDealValue("")).toBe(0);
		expect(parseDealValue("free quote")).toBe(0);
	});
});

describe("inrFormat", () => {
	it("formats INR with Indian grouping", () => {
		expect(inrFormat(4500000, "INR")).toBe("₹45,00,000");
	});

	it("formats INR small numbers without grouping", () => {
		expect(inrFormat(0, "INR")).toBe("₹0");
		expect(inrFormat(999, "INR")).toBe("₹999");
	});

	it("falls back to currency code prefix for non-INR currencies", () => {
		expect(inrFormat(1234, "USD")).toBe("USD 1,234");
	});
});
