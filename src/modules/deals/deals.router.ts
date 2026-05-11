import { Router } from "express";
import multer from "multer";
import { guard } from "../../shared/middleware/rbac.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, deleted, fail, ok } from "../../shared/utils/response";
import { reqUser, routeParam } from "../../shared/utils/route-param";
import {
	bulkChangeStageSchema,
	bulkDeleteSchema,
	bulkReassignSchema,
	changeStageSchema,
	createDealSchema,
	listDealsQuerySchema,
	updateDealSchema,
} from "./deals.schema";
import * as dealsService from "./deals.service";
import { importDealsFromCsv } from "./deals-import.service";
import dealsNotesRouter from "./deals-notes.router";

const router = Router();

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 },
});

router.post(
	"/import",
	guard("ADMIN", "MANAGER"),
	upload.single("file"),
	async (req, res) => {
		const file = req.file;
		if (!file) {
			fail(res, 400, "Missing file", { code: "VALIDATION_ERROR" });
			return;
		}
		const result = await importDealsFromCsv(
			file.buffer.toString("utf8"),
			reqUser(req),
		);
		ok(res, result, "Import complete");
	},
);

router.post("/bulk/delete", validate(bulkDeleteSchema), async (req, res) => {
	const result = await dealsService.bulkDelete(req.body, reqUser(req));
	ok(res, result, "Deals deleted");
});

router.post(
	"/bulk/reassign",
	validate(bulkReassignSchema),
	async (req, res) => {
		const result = await dealsService.bulkReassign(req.body, reqUser(req));
		ok(res, result, "Deals reassigned");
	},
);

router.post(
	"/bulk/change-stage",
	validate(bulkChangeStageSchema),
	async (req, res) => {
		const result = await dealsService.bulkChangeStage(req.body, reqUser(req));
		ok(res, result, "Stage updated");
	},
);

router.use("/:dealId/notes", dealsNotesRouter);

router.get("/:dealId/stage-history", async (req, res) => {
	const result = await dealsService.listStageHistory(
		routeParam(req.params.dealId),
		reqUser(req),
	);
	ok(res, result);
});

router.get("/:dealId/activities", async (req, res) => {
	const result = await dealsService.listActivities(
		routeParam(req.params.dealId),
		reqUser(req),
	);
	ok(res, result);
});

router.post(
	"/:id/change-stage",
	validate(changeStageSchema),
	async (req, res) => {
		const deal = await dealsService.changeStage(
			routeParam(req.params.id),
			req.body,
			reqUser(req),
		);
		ok(res, deal, "Stage changed");
	},
);

router.post("/", validate(createDealSchema), async (req, res) => {
	const deal = await dealsService.createDeal(req.body, reqUser(req));
	created(res, deal, "Deal created");
});

router.get("/", validate(listDealsQuerySchema, "query"), async (req, res) => {
	const result = await dealsService.listDeals(req.query as never, reqUser(req));
	ok(res, result);
});

router.get("/:id", async (req, res) => {
	const deal = await dealsService.getDeal(
		routeParam(req.params.id),
		reqUser(req),
	);
	ok(res, deal);
});

router.patch("/:id", validate(updateDealSchema), async (req, res) => {
	const deal = await dealsService.updateDeal(
		routeParam(req.params.id),
		req.body,
		reqUser(req),
	);
	ok(res, deal, "Deal updated");
});

router.delete("/:id", async (req, res) => {
	await dealsService.softDeleteDeal(routeParam(req.params.id), reqUser(req));
	deleted(res, "Deal deleted");
});

export default router;
