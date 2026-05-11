import { randomUUID } from "node:crypto";

export interface LeadInput {
	externalLeadId: string;
	firstName: string;
	lastName?: string;
	email?: string;
	phone?: string;
	company?: string;
	jobTitle?: string;
	source: string;
	sourceProvider: "GOOGLE_ADS";
	metadataJson: Record<string, unknown>;
	isTest: boolean;
}

interface ColumnData {
	column_id?: string;
	column_name?: string;
	string_value?: string;
}

interface GoogleAdsPayload {
	lead_id?: string;
	user_column_data?: ColumnData[];
	campaign_id?: number | string;
	campaign_name?: string;
	adgroup_id?: number | string;
	adgroup_name?: string;
	form_id?: number | string;
	form_name?: string;
	asset_id?: number | string;
	asset_name?: string;
	creative_id?: number | string;
	gcl_id?: string;
	is_test?: boolean;
}

export function mapGoogleAdsLead(raw: Record<string, unknown>): LeadInput {
	const payload = raw as GoogleAdsPayload;

	// Google Ads keys user data by stable `column_id` (FULL_NAME, EMAIL, …);
	// `column_name` is the human-readable label set in the UI and varies per
	// advertiser. Prefer column_id and fall back to column_name for resilience.
	const fields: Record<string, string> = {};
	for (const col of payload.user_column_data ?? []) {
		if (!col.string_value) continue;
		const key = (col.column_id ?? col.column_name ?? "").toUpperCase();
		if (key) fields[key] = col.string_value;
	}

	const fullName = (fields.FULL_NAME ?? "").trim();
	const nameParts = fullName.split(/\s+/).filter(Boolean);
	const firstName =
		fields.FIRST_NAME?.trim() || nameParts[0] || "Unknown";
	const lastName =
		fields.LAST_NAME?.trim() || nameParts.slice(1).join(" ") || undefined;

	const formName = payload.asset_name ?? payload.form_name;
	const source =
		[payload.campaign_name, formName].filter(Boolean).join(" — ") ||
		"Google Ads";

	return {
		externalLeadId: payload.lead_id ?? randomUUID(),
		firstName,
		lastName,
		email: fields.EMAIL || undefined,
		phone: fields.PHONE_NUMBER || undefined,
		company: fields.COMPANY_NAME || undefined,
		jobTitle: fields.JOB_TITLE || undefined,
		source,
		sourceProvider: "GOOGLE_ADS",
		isTest: payload.is_test === true,
		metadataJson: {
			campaignId: payload.campaign_id,
			campaignName: payload.campaign_name,
			adgroupId: payload.adgroup_id,
			adgroupName: payload.adgroup_name,
			formId: payload.form_id ?? payload.asset_id,
			formName,
			creativeId: payload.creative_id,
			gclId: payload.gcl_id,
			rawFields: fields,
		},
	};
}
