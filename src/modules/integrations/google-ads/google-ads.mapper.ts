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
	column_name: string;
	string_value?: string;
}

interface GoogleAdsPayload {
	lead_id?: string;
	user_column_data?: ColumnData[];
	campaign_name?: string;
	ad_group_name?: string;
	form_name?: string;
	gcl_id?: string;
	is_test?: boolean;
}

export function mapGoogleAdsLead(raw: Record<string, unknown>): LeadInput {
	const payload = raw as GoogleAdsPayload;

	const fields: Record<string, string> = {};
	for (const col of payload.user_column_data ?? []) {
		if (col.string_value) {
			fields[col.column_name] = col.string_value;
		}
	}

	const fullName = (fields.FULL_NAME ?? "").trim();
	const nameParts = fullName.split(/\s+/);
	const firstName = nameParts[0] ?? "Unknown";
	const lastName = nameParts.slice(1).join(" ") || undefined;

	const source =
		[payload.campaign_name, payload.form_name].filter(Boolean).join(" — ") ||
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
			campaignName: payload.campaign_name,
			adGroupName: payload.ad_group_name,
			formName: payload.form_name,
			gclId: payload.gcl_id,
			rawFields: fields,
		},
	};
}
