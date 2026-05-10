import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, ok } from "../../shared/utils/response";
import { mergedParam, reqUser } from "../../shared/utils/route-param";
import { listCalls, logCall, logCallSchema } from "./calls.service";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
	const calls = await listCalls(mergedParam(req, "leadId"), reqUser(req));
	ok(res, { calls });
});

router.post("/", validate(logCallSchema), async (req, res) => {
	const call = await logCall(
		mergedParam(req, "leadId"),
		req.body,
		reqUser(req),
	);
	created(res, call, "Call logged");
});

export default router;
