import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { api, makeToken } from "../helpers";
import { createUser, truncateAll } from "../setup";

describe("POST /api/v1/auth/onboarding", () => {
	let salesToken: string;

	beforeAll(async () => {
		await truncateAll();
		const user = await createUser({
			email: "onboard@test.local",
			password: "password123",
			role: "SALES",
		});
		salesToken = makeToken("SALES", { sub: user.id });
	});

	afterAll(truncateAll);

	it("returns 401 without an auth token", async () => {
		const res = await api.post("/api/v1/auth/onboarding", {
			industry: "REAL_ESTATE",
			teamSize: "SIZE_11_50",
			goals: ["SPEED_UP_QUALIFICATION"],
		});
		expect(res.status).toBe(401);
	});

	it("returns 200 and persists onboarding fields on valid body", async () => {
		const res = await api.post(
			"/api/v1/auth/onboarding",
			{
				industry: "REAL_ESTATE",
				teamSize: "SIZE_11_50",
				goals: ["SPEED_UP_QUALIFICATION", "CENTRALIZE_CALLS"],
			},
			salesToken,
		);
		expect(res.status).toBe(200);
		expect(res.body.data.isOnboarded).toBe(true);
		expect(res.body.data.industry).toBe("REAL_ESTATE");
		expect(res.body.data.teamSize).toBe("SIZE_11_50");
		expect(res.body.data.goals).toEqual([
			"SPEED_UP_QUALIFICATION",
			"CENTRALIZE_CALLS",
		]);
		expect(res.body.data.onboardedAt).toBeDefined();
		expect(res.body.data.passwordHash).toBeUndefined();
	});

	it("returns 400 when goals array is empty", async () => {
		const res = await api.post(
			"/api/v1/auth/onboarding",
			{
				industry: "REAL_ESTATE",
				teamSize: "SIZE_11_50",
				goals: [],
			},
			salesToken,
		);
		expect(res.status).toBe(400);
		expect(res.body.data.code).toBe("VALIDATION_ERROR");
	});

	it("returns 400 on an invalid enum value", async () => {
		const res = await api.post(
			"/api/v1/auth/onboarding",
			{
				industry: "AGRICULTURE",
				teamSize: "SIZE_11_50",
				goals: ["SPEED_UP_QUALIFICATION"],
			},
			salesToken,
		);
		expect(res.status).toBe(400);
	});

	it("is idempotent — second call overwrites with new values", async () => {
		const res = await api.post(
			"/api/v1/auth/onboarding",
			{
				industry: "SAAS",
				teamSize: "SIZE_200_PLUS",
				goals: ["FORECAST_BETTER", "INSIGHTFUL_REPORTS"],
			},
			salesToken,
		);
		expect(res.status).toBe(200);
		expect(res.body.data.industry).toBe("SAAS");
		expect(res.body.data.teamSize).toBe("SIZE_200_PLUS");
		expect(res.body.data.goals).toEqual([
			"FORECAST_BETTER",
			"INSIGHTFUL_REPORTS",
		]);
	});
});
