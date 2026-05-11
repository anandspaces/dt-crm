import type { Lead } from "../../db/schema";

export type LeadGroup = "urgent" | "today" | "fresh" | null;

export interface ShapedLead extends Lead {
	name: string;
	meta: string;
	group: LeadGroup;
	assignedTo: { id: string; name: string } | null;
}

export interface ReminderState {
	hasOverdue: boolean;
	hasToday: boolean;
}

export type AssigneeMap = Map<string, { id: string; name: string }>;

function joinName(first: string, last?: string | null): string {
	return [first, last].filter(Boolean).join(" ").trim();
}

function buildMeta(lead: Lead): string {
	return [lead.budget, lead.requirement, lead.city]
		.filter((v) => v && v.length > 0)
		.join(" · ");
}

function deriveGroup(
	lead: Lead,
	reminders: ReminderState | undefined,
): LeadGroup {
	if (reminders?.hasOverdue) return "urgent";
	if (reminders?.hasToday) return "today";
	if (!lead.lastContactedAt) return "fresh";
	return null;
}

export function shapeLead(
	lead: Lead,
	options: {
		reminders?: ReminderState;
		assignees?: AssigneeMap;
	} = {},
): ShapedLead {
	const assignedTo = lead.assignedUserId
		? (options.assignees?.get(lead.assignedUserId) ?? {
				id: lead.assignedUserId,
				name: "",
			})
		: null;

	return {
		...lead,
		name: joinName(lead.firstName, lead.lastName ?? null),
		meta: buildMeta(lead),
		group: deriveGroup(lead, options.reminders),
		assignedTo,
	};
}

export function splitName(name: string): {
	firstName: string;
	lastName?: string;
} {
	const trimmed = name.trim();
	const idx = trimmed.indexOf(" ");
	if (idx === -1) return { firstName: trimmed };
	return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) };
}
