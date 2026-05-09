import { Router } from "express";
import { guard } from "../../shared/middleware/rbac.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import { noContent, ok } from "../../shared/utils/response";
import { reqUser, routeParam } from "../../shared/utils/route-param";
import { listUsersQuerySchema, updateUserSchema } from "./users.schema";
import * as usersService from "./users.service";

const router = Router();

router.get(
	"/",
	guard("ADMIN", "MANAGER"),
	validate(listUsersQuerySchema, "query"),
	async (req, res) => {
		const result = await usersService.listUsers(
			req.query as never,
			reqUser(req),
		);
		ok(res, { items: result.data, meta: result.meta });
	},
);

router.get("/me", async (req, res) => {
	const actor = reqUser(req);
	const user = await usersService.getUserById(actor.sub, actor);
	ok(res, user);
});

router.get("/:id", async (req, res) => {
	const user = await usersService.getUserById(
		routeParam(req.params.id),
		reqUser(req),
	);
	ok(res, user);
});

router.patch("/:id", validate(updateUserSchema), async (req, res) => {
	const user = await usersService.updateUser(
		routeParam(req.params.id),
		req.body,
		reqUser(req),
	);
	ok(res, user);
});

router.delete("/:id", guard("ADMIN"), async (req, res) => {
	await usersService.deactivateUser(routeParam(req.params.id), reqUser(req));
	noContent(res);
});

export default router;
