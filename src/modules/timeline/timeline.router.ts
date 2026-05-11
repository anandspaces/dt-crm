import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, ok } from "../../shared/utils/response";
import { mergedParam, reqUser } from "../../shared/utils/route-param";
import {
	addNoteSchema,
	addTimelineNote,
	getTimeline,
} from "./timeline.service";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
	const items = await getTimeline(mergedParam(req, "leadId"), reqUser(req));
	ok(res, { items });
});

router.post("/", validate(addNoteSchema), async (req, res) => {
	const item = await addTimelineNote(
		mergedParam(req, "leadId"),
		req.body,
		reqUser(req),
	);
	created(res, item, "Note added");
});

export default router;
