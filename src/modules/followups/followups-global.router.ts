import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { ok } from "../../shared/utils/response";
import { reqUser } from "../../shared/utils/route-param";
import { listFollowupsQuerySchema } from "./followups.schema";
import { listMyFollowups } from "./followups.service";

const router = Router();

router.get(
	"/",
	validate(listFollowupsQuerySchema, "query"),
	async (req, res) => {
		const result = await listMyFollowups(req.query as never, reqUser(req));
		ok(res, { items: result.data, nextCursor: result.nextCursor });
	},
);

export default router;
