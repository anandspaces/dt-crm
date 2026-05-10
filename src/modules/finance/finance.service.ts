import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../config/db";
import { leadActivities, leadPayments, leads } from "../../db/schema";
import type { JWTPayload } from "../../shared/types/auth";
import { assertLeadAccess } from "../leads/leads.service";

export const addPaymentSchema = z.object({
	type: z.string().min(1).max(100),
	amount: z.number().int().min(0),
	method: z.enum(["UPI", "CARD", "BANK_TRANSFER", "CASH", "CHEQUE", "OTHER"]),
	currency: z.string().min(3).max(8).default("INR"),
	paidAt: z.union([z.iso.date(), z.iso.datetime()]),
	autoReminderEnabled: z.boolean().default(false),
});

export type AddPaymentInput = z.infer<typeof addPaymentSchema>;

export function inrFormat(amount: number, currency: string): string {
	if (currency === "INR") {
		return `₹${new Intl.NumberFormat("en-IN").format(amount)}`;
	}
	return `${currency} ${amount.toLocaleString()}`;
}

function shapePayment(row: typeof leadPayments.$inferSelect) {
	return {
		id: row.id,
		type: row.type,
		amount: row.amount,
		amountDisplay: inrFormat(row.amount, row.currency),
		method: row.method,
		currency: row.currency,
		paidAt: row.paidAt,
		autoReminderEnabled: row.autoReminderEnabled,
		nextReminderAt: row.nextReminderAt ?? null,
	};
}

export function parseDealValue(budget: string | null | undefined): number {
	if (!budget) return 0;
	const m = budget.match(/[\d.]+/);
	if (!m) return 0;
	const n = Number.parseFloat(m[0]);
	if (!Number.isFinite(n)) return 0;
	if (/cr/i.test(budget)) return Math.round(n * 1_00_00_000);
	if (/l/i.test(budget)) return Math.round(n * 1_00_000);
	if (/k/i.test(budget)) return Math.round(n * 1_000);
	return Math.round(n);
}

export async function getFinance(leadId: string, actor: JWTPayload) {
	const lead = await assertLeadAccess(leadId, actor);

	const [recvRow] = await db
		.select({ received: sql<number>`COALESCE(SUM(${leadPayments.amount}), 0)::int` })
		.from(leadPayments)
		.where(eq(leadPayments.leadId, leadId));
	const received = recvRow?.received ?? 0;

	const payments = await db
		.select()
		.from(leadPayments)
		.where(eq(leadPayments.leadId, leadId))
		.orderBy(desc(leadPayments.paidAt));

	const dealValueRaw = parseDealValue(lead.budget);
	const currency = payments[0]?.currency ?? "INR";

	return {
		dealValueRaw,
		dealValueDisplay: inrFormat(dealValueRaw, currency),
		received,
		pending: Math.max(0, dealValueRaw - received),
		currency,
		payments: payments.map(shapePayment),
	};
}

export async function addPayment(
	leadId: string,
	input: AddPaymentInput,
	actor: JWTPayload,
) {
	await assertLeadAccess(leadId, actor);

	const paidAt = new Date(input.paidAt);
	const nextReminderAt = input.autoReminderEnabled
		? new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000)
		: null;

	const [row] = await db
		.insert(leadPayments)
		.values({
			leadId,
			type: input.type,
			amount: input.amount,
			currency: input.currency,
			method: input.method,
			paidAt,
			autoReminderEnabled: input.autoReminderEnabled,
			nextReminderAt,
		})
		.returning();
	if (!row) throw new Error("Failed to add payment");

	await db.insert(leadActivities).values({
		leadId,
		userId: actor.sub,
		type: "SYSTEM",
		title: `Payment received: ${input.type}`,
		description: `${inrFormat(input.amount, input.currency)} via ${input.method}`,
	});

	if (input.autoReminderEnabled && nextReminderAt) {
		await db
			.update(leads)
			.set({ nextReminderAt })
			.where(eq(leads.id, leadId));
	}

	return shapePayment(row);
}
