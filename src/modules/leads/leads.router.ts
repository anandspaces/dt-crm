import { Router } from "express";
import { guard } from "../../shared/middleware/rbac.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, noContent, ok } from "../../shared/utils/response";
import { reqUser, routeParam } from "../../shared/utils/route-param";
import activitiesRouter from "../activities/activities.router";
import notesRouter from "../activities/notes.router";
import followupsRouter from "../followups/followups.router";
import {
	bulkLeadSchema,
	createLeadSchema,
	listLeadsQuerySchema,
	updateLeadSchema,
} from "./leads.schema";
import * as leadsService from "./leads.service";

const router = Router();

// Nested routers — must use mergeParams on the child routers
router.use("/:leadId/activities", activitiesRouter);
router.use("/:leadId/notes", notesRouter);
router.use("/:leadId/followups", followupsRouter);

// Bulk — defined before /:id to avoid route conflict
router.post(
	"/bulk",
	guard("ADMIN", "MANAGER"),
	validate(bulkLeadSchema),
	async (req, res) => {
		const result = await leadsService.bulkLead(req.body, reqUser(req));
		ok(res, result);
	},
);

router.post("/", validate(createLeadSchema), async (req, res) => {
	const lead = await leadsService.createLead(req.body, reqUser(req));
	created(res, lead);
});

router.get("/", validate(listLeadsQuerySchema, "query"), async (req, res) => {
	const result = await leadsService.listLeads(req.query as never, reqUser(req));
	ok(res, { items: result.data, meta: result.meta });
});

router.get("/:id", async (req, res) => {
	const lead = await leadsService.getLead(
		routeParam(req.params.id),
		reqUser(req),
	);
	ok(res, lead);
});

router.patch("/:id", validate(updateLeadSchema), async (req, res) => {
	const lead = await leadsService.updateLead(
		routeParam(req.params.id),
		req.body,
		reqUser(req),
	);
	ok(res, lead);
});

router.delete("/:id", async (req, res) => {
	await leadsService.softDeleteLead(routeParam(req.params.id), reqUser(req));
	noContent(res);
});

router.post("/:id/restore", guard("ADMIN"), async (req, res) => {
	await leadsService.restoreLead(routeParam(req.params.id), reqUser(req));
	ok(res, { message: "Lead restored" });
});

export default router;
