import { Router } from "express";
import { ok } from "../../shared/utils/response";
import { mergedParam, reqUser } from "../../shared/utils/route-param";
import { getInsight, triggerEnrichment } from "./ai.service";

// Mounted at /api/v1/leads/:leadId  (mergeParams)
const router = Router({ mergeParams: true });

router.get("/ai-insight", async (req, res) => {
	const insight = await getInsight(mergedParam(req, "leadId"), reqUser(req));
	ok(res, insight);
});

router.post("/enrich", async (req, res) => {
	const job = await triggerEnrichment(
		mergedParam(req, "leadId"),
		reqUser(req),
	);
	ok(res, job, "Enrichment started");
});

export default router;
