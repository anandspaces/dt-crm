import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, ok } from "../../shared/utils/response";
import { reqUser, routeParam } from "../../shared/utils/route-param";
import {
	listActivities,
	listActivitiesQuerySchema,
	logActivity,
	logActivitySchema,
} from "./activities.service";

// mergeParams: true allows access to :leadId from the parent router
const router = Router({ mergeParams: true });

router.get(
	"/",
	validate(listActivitiesQuerySchema, "query"),
	async (req, res) => {
		const result = await listActivities(
			routeParam(req.params.leadId),
			req.query as never,
			reqUser(req),
		);
		ok(res, { items: result.data, nextCursor: result.nextCursor });
	},
);

router.post("/", validate(logActivitySchema), async (req, res) => {
	const activity = await logActivity(
		routeParam(req.params.leadId),
		req.body,
		reqUser(req),
	);
	created(res, activity);
});

export default router;
