import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, ok } from "../../shared/utils/response";
import { reqUser, routeParam } from "../../shared/utils/route-param";
import {
	createFollowupSchema,
	listFollowupsQuerySchema,
	updateFollowupSchema,
} from "./followups.schema";
import {
	createFollowup,
	listFollowups,
	updateFollowup,
} from "./followups.service";

const router = Router({ mergeParams: true });

router.post("/", validate(createFollowupSchema), async (req, res) => {
	const followup = await createFollowup(
		routeParam(req.params.leadId),
		req.body,
		reqUser(req),
	);
	created(res, followup);
});

router.get(
	"/",
	validate(listFollowupsQuerySchema, "query"),
	async (req, res) => {
		const result = await listFollowups(
			routeParam(req.params.leadId),
			req.query as never,
			reqUser(req),
		);
		ok(res, { items: result.data, nextCursor: result.nextCursor });
	},
);

router.patch(
	"/:followupId",
	validate(updateFollowupSchema),
	async (req, res) => {
		const followup = await updateFollowup(
			routeParam(req.params.leadId),
			routeParam(req.params.followupId),
			req.body,
			reqUser(req),
		);
		ok(res, followup);
	},
);

export default router;
