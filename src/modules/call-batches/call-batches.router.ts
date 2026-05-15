import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, ok } from "../../shared/utils/response";
import { reqUser, routeParam } from "../../shared/utils/route-param";
import { startBatchSchema } from "./call-batches.schema";
import * as batchesService from "./call-batches.service";

const router = Router();

router.post("/start", validate(startBatchSchema), async (req, res) => {
	const result = await batchesService.startBatch(req.body, reqUser(req));
	created(res, result, "Bulk AI call batch started");
});

router.get("/", async (req, res) => {
	const batches = await batchesService.listBatches(reqUser(req));
	ok(res, { batches });
});

router.get("/:batchId", async (req, res) => {
	const batch = await batchesService.getBatch(
		routeParam(req.params.batchId),
		reqUser(req),
	);
	ok(res, batch);
});

export default router;
