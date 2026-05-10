import { describe, expect, it } from "bun:test";
import { mapGoogleAdsLead } from "../../src/modules/integrations/google-ads/google-ads.mapper";

const base = {
	lead_id: "gads-001",
	campaign_name: "Brand Search",
	form_name: "Contact Us",
	is_test: false,
};

describe("mapGoogleAdsLead", () => {
	it("maps all standard fields correctly", () => {
		const payload = {
			...base,
			user_column_data: [
				{ column_name: "FULL_NAME", string_value: "Jane Smith" },
				{ column_name: "EMAIL", string_value: "jane@example.com" },
				{ column_name: "PHONE_NUMBER", string_value: "+919876543210" },
				{ column_name: "COMPANY_NAME", string_value: "Acme Corp" },
				{ column_name: "JOB_TITLE", string_value: "CTO" },
			],
		};

		const result = mapGoogleAdsLead(payload);

		expect(result.firstName).toBe("Jane");
		expect(result.lastName).toBe("Smith");
		expect(result.email).toBe("jane@example.com");
		expect(result.phone).toBe("+919876543210");
		expect(result.company).toBe("Acme Corp");
		expect(result.jobTitle).toBe("CTO");
		expect(result.sourceProvider).toBe("GOOGLE_ADS");
		expect(result.externalLeadId).toBe("gads-001");
		expect(result.isTest).toBe(false);
		// source is derived from campaign + form name
		expect(result.source).toBe("Brand Search — Contact Us");
	});

	it("handles single-word name — lastName is undefined", () => {
		const result = mapGoogleAdsLead({
			...base,
			user_column_data: [{ column_name: "FULL_NAME", string_value: "Cher" }],
		});
		expect(result.firstName).toBe("Cher");
		expect(result.lastName).toBeUndefined();
	});

	it("returns undefined for all optional fields when user_column_data is empty", () => {
		const result = mapGoogleAdsLead({ ...base, user_column_data: [] });
		expect(result.email).toBeUndefined();
		expect(result.phone).toBeUndefined();
		expect(result.company).toBeUndefined();
		expect(result.jobTitle).toBeUndefined();
		expect(result.lastName).toBeUndefined();
	});

	it("falls back to 'Google Ads' source when campaign and form names are missing", () => {
		const result = mapGoogleAdsLead({ lead_id: "x", user_column_data: [] });
		expect(result.source).toBe("Google Ads");
	});

	it("generates a UUID externalLeadId when lead_id is absent", () => {
		const result = mapGoogleAdsLead({ user_column_data: [] });
		expect(result.externalLeadId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	it("marks test leads correctly", () => {
		const result = mapGoogleAdsLead({
			...base,
			is_test: true,
			user_column_data: [],
		});
		expect(result.isTest).toBe(true);
	});
});
