import { describe, expect, it } from "bun:test";
import type { Lead } from "../../src/db/schema";
import { shapeLead, splitName } from "../../src/modules/leads/leads.shape";

const baseLead: Lead = {
	id: "00000000-0000-0000-0000-000000000001",
	firstName: "Ananya",
	lastName: "Sharma",
	email: "ananya@example.com",
	phone: "+91 99999",
	company: null,
	jobTitle: null,
	website: null,
	source: "MAGICBRICKS",
	sourceProvider: null,
	status: "interested",
	priority: "MEDIUM",
	score: 80,
	hot: false,
	aiEnriched: false,
	city: "Noida",
	budget: "₹45L",
	requirement: "3BHK",
	tags: [],
	assignedUserId: null,
	pipelineId: null,
	stageId: null,
	notes: null,
	metadataJson: null,
	lastContactedAt: null,
	nextFollowupAt: null,
	nextReminderAt: null,
	deletedAt: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe("splitName", () => {
	it("splits a full name on the first space", () => {
		expect(splitName("Ananya Sharma Iyer")).toEqual({
			firstName: "Ananya",
			lastName: "Sharma Iyer",
		});
	});

	it("returns only firstName for a single token", () => {
		expect(splitName("Cher")).toEqual({ firstName: "Cher" });
	});

	it("trims surrounding whitespace", () => {
		expect(splitName("  Anand  ")).toEqual({ firstName: "Anand" });
	});
});

describe("shapeLead", () => {
	it("computes name from firstName + lastName", () => {
		const shaped = shapeLead({ ...baseLead, firstName: "Ananya", lastName: "Sharma" });
		expect(shaped.name).toBe("Ananya Sharma");
	});

	it("falls back to firstName-only when lastName is null", () => {
		const shaped = shapeLead({ ...baseLead, firstName: "Cher", lastName: null });
		expect(shaped.name).toBe("Cher");
	});

	it("builds meta as 'budget · requirement · city'", () => {
		const shaped = shapeLead(baseLead);
		expect(shaped.meta).toBe("₹45L · 3BHK · Noida");
	});

	it("omits empty parts in meta", () => {
		const shaped = shapeLead({ ...baseLead, city: null });
		expect(shaped.meta).toBe("₹45L · 3BHK");
	});

	it("returns an empty meta when nothing is set", () => {
		const shaped = shapeLead({
			...baseLead,
			budget: null,
			requirement: null,
			city: null,
		});
		expect(shaped.meta).toBe("");
	});

	it("derives group=fresh when lastContactedAt is null and no reminders", () => {
		const shaped = shapeLead(baseLead);
		expect(shaped.group).toBe("fresh");
	});

	it("derives group=null when lead has been contacted and no reminders", () => {
		const shaped = shapeLead({
			...baseLead,
			lastContactedAt: new Date("2026-04-20T00:00:00Z"),
		});
		expect(shaped.group).toBeNull();
	});

	it("derives group=urgent when an overdue reminder exists", () => {
		const shaped = shapeLead(baseLead, {
			reminders: { hasOverdue: true, hasToday: false },
		});
		expect(shaped.group).toBe("urgent");
	});

	it("derives group=today when only a same-day reminder exists", () => {
		const shaped = shapeLead(baseLead, {
			reminders: { hasOverdue: false, hasToday: true },
		});
		expect(shaped.group).toBe("today");
	});

	it("attaches assignedTo from the assignees map", () => {
		const userId = "11111111-1111-4111-8111-111111111111";
		const assignees = new Map([[userId, { id: userId, name: "Riya Kapoor" }]]);
		const shaped = shapeLead(
			{ ...baseLead, assignedUserId: userId },
			{ assignees },
		);
		expect(shaped.assignedTo).toEqual({ id: userId, name: "Riya Kapoor" });
	});

	it("returns assignedTo=null when the lead is unassigned", () => {
		const shaped = shapeLead(baseLead);
		expect(shaped.assignedTo).toBeNull();
	});
});
