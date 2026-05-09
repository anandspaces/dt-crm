import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../../../config/db";
import {
	leadActivities,
	leadImports,
	leads,
	webhookEvents,
} from "../../../db/schema";
import { mapGoogleAdsLead } from "./google-ads.mapper";

export async function processGoogleWebhook(
	webhookEventId: string,
	payload: Record<string, unknown>,
) {
	const leadInput = mapGoogleAdsLead(payload);

	// Skip test submissions — mark processed but don't create leads
	if (leadInput.isTest) {
		await db
			.update(webhookEvents)
			.set({
				processed: true,
				processedAt: new Date(),
				errorMessage: "test_submission_skipped",
			})
			.where(eq(webhookEvents.id, webhookEventId));
		return;
	}

	await db.transaction(async (tx) => {
		// 1. Idempotency: check if this external lead was already imported
		const [existing] = await tx
			.select({ id: leadImports.id })
			.from(leadImports)
			.where(
				and(
					eq(leadImports.provider, "GOOGLE_ADS"),
					eq(leadImports.externalLeadId, leadInput.externalLeadId),
				),
			)
			.limit(1);

		if (existing) {
			// Already processed — mark webhook as processed and exit
			await tx
				.update(webhookEvents)
				.set({ processed: true, processedAt: new Date() })
				.where(eq(webhookEvents.id, webhookEventId));
			return;
		}

		// 2. Email/phone dedup on existing leads
		const deupConditions = [];
		if (leadInput.email) deupConditions.push(eq(leads.email, leadInput.email));
		if (leadInput.phone) deupConditions.push(eq(leads.phone, leadInput.phone));

		let leadId: string;

		if (deupConditions.length > 0) {
			const deupClause = or(...deupConditions) as ReturnType<typeof or>;
			const [existingLead] = await tx
				.select({ id: leads.id })
				.from(leads)
				.where(and(isNull(leads.deletedAt), deupClause))
				.limit(1);

			if (existingLead) {
				// Link to existing lead
				leadId = existingLead.id;
				// Update source info if missing
				await tx
					.update(leads)
					.set({
						source: leadInput.source,
						sourceProvider: leadInput.sourceProvider,
						updatedAt: new Date(),
					})
					.where(and(eq(leads.id, leadId), isNull(leads.source)));
			} else {
				// 3. Create new lead
				const [newLead] = await tx
					.insert(leads)
					.values({
						firstName: leadInput.firstName,
						lastName: leadInput.lastName,
						email: leadInput.email,
						phone: leadInput.phone,
						company: leadInput.company,
						jobTitle: leadInput.jobTitle,
						source: leadInput.source,
						sourceProvider: leadInput.sourceProvider,
						metadataJson: leadInput.metadataJson,
						status: "NEW",
						priority: "MEDIUM",
					})
					.returning({ id: leads.id });

				if (!newLead) throw new Error("Failed to insert lead from Google Ads");
				leadId = newLead.id;
			}
		} else {
			// No dedup fields — always create new lead
			const [newLead] = await tx
				.insert(leads)
				.values({
					firstName: leadInput.firstName,
					lastName: leadInput.lastName,
					source: leadInput.source,
					sourceProvider: leadInput.sourceProvider,
					metadataJson: leadInput.metadataJson,
					status: "NEW",
					priority: "MEDIUM",
				})
				.returning({ id: leads.id });

			if (!newLead) throw new Error("Failed to insert lead from Google Ads");
			leadId = newLead.id;
		}

		// 4. Record the import
		await tx.insert(leadImports).values({
			provider: "GOOGLE_ADS",
			externalLeadId: leadInput.externalLeadId,
			leadId,
			rawPayloadJson: payload,
			processedAt: new Date(),
		});

		// 5. Log activity
		await tx.insert(leadActivities).values({
			leadId,
			type: "SYSTEM",
			title: "Lead received from Google Ads",
			description: `Campaign: ${(leadInput.metadataJson.campaignName as string) ?? "Unknown"}`,
			metadataJson: leadInput.metadataJson,
		});

		// 6. Mark webhook event as processed
		await tx
			.update(webhookEvents)
			.set({ processed: true, processedAt: new Date() })
			.where(eq(webhookEvents.id, webhookEventId));
	});
}
