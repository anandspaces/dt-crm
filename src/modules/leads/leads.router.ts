import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, deleted, ok } from "../../shared/utils/response";
import { reqUser, routeParam } from "../../shared/utils/route-param";
import activitiesRouter from "../activities/activities.router";
import notesRouter from "../activities/notes.router";
import aiRouter from "../ai/ai.router";
import callsRouter from "../calls/calls.router";
import documentsRouter from "../documents/documents.router";
import financeRouter from "../finance/finance.router";
import followupsRouter from "../followups/followups.router";
import messagesRouter from "../messages/messages.router";
import remindersRouter from "../reminders/reminders.router";
import timelineRouter from "../timeline/timeline.router";
import {
	bulkAiNurtureSchema,
	bulkCampaignSchema,
	bulkStatusSchema,
	bulkTransferSchema,
	bulkWhatsappSchema,
	createLeadSchema,
	listLeadsQuerySchema,
	updateLeadSchema,
} from "./leads.schema";
import * as leadsService from "./leads.service";

const router = Router();

// ─── Stats + Bulk routes ─────────────────────────────────────────────────────
// MUST be registered BEFORE the nested `/:leadId/*` routers — otherwise
// requests like POST /bulk/whatsapp get matched as :leadId="bulk" and forwarded
// to the messages router (which then 400s on the missing `text` field).

router.get(
	"/stats",
	validate(listLeadsQuerySchema, "query"),
	async (req, res) => {
		const stats = await leadsService.leadStats(req.query as never, reqUser(req));
		ok(res, stats);
	},
);

router.post(
	"/bulk/transfer",
	validate(bulkTransferSchema),
	async (req, res) => {
		const result = await leadsService.bulkTransfer(req.body, reqUser(req));
		ok(res, result, "Leads transferred");
	},
);

router.post("/bulk/status", validate(bulkStatusSchema), async (req, res) => {
	const result = await leadsService.bulkStatus(req.body, reqUser(req));
	ok(res, result, "Status updated");
});

router.post(
	"/bulk/whatsapp",
	validate(bulkWhatsappSchema),
	async (req, res) => {
		const result = await leadsService.bulkWhatsapp(req.body, reqUser(req));
		ok(res, result, "Bulk WhatsApp sent");
	},
);

router.post(
	"/bulk/campaign",
	validate(bulkCampaignSchema),
	async (req, res) => {
		const result = await leadsService.bulkCampaign(req.body, reqUser(req));
		ok(res, result, "Added to campaign");
	},
);

router.post(
	"/bulk/ai-nurture",
	validate(bulkAiNurtureSchema),
	async (req, res) => {
		const result = await leadsService.bulkAiNurture(req.body, reqUser(req));
		ok(res, result, `AI nurture queued for ${result.queued} leads`);
	},
);

// ─── Nested per-lead routers — child routers must use mergeParams: true ─────
router.use("/:leadId/activities", activitiesRouter);
router.use("/:leadId/notes", notesRouter);
router.use("/:leadId/followups", followupsRouter);
router.use("/:leadId/timeline", timelineRouter);
router.use("/:leadId/whatsapp", messagesRouter);
router.use("/:leadId/calls", callsRouter);
router.use("/:leadId/documents", documentsRouter);
router.use("/:leadId/finance", financeRouter);
router.use("/:leadId/reminders", remindersRouter);
router.use("/:leadId", aiRouter);

// ─── CRUD ────────────────────────────────────────────────────────────────────
router.post("/", validate(createLeadSchema), async (req, res) => {
	const lead = await leadsService.createLead(req.body, reqUser(req));
	created(res, lead, "Lead created");
});

router.get("/", validate(listLeadsQuerySchema, "query"), async (req, res) => {
	const result = await leadsService.listLeads(req.query as never, reqUser(req));
	ok(res, result);
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
	ok(res, lead, "Lead updated");
});

router.delete("/:id", async (req, res) => {
	await leadsService.softDeleteLead(routeParam(req.params.id), reqUser(req));
	deleted(res, "Lead deleted");
});

router.post("/:id/restore", async (req, res) => {
	await leadsService.restoreLead(routeParam(req.params.id), reqUser(req));
	ok(res, { message: "Lead restored" });
});

export default router;
