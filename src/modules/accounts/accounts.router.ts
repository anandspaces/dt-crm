import { Router } from "express";
import multer from "multer";
import { guard } from "../../shared/middleware/rbac.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, deleted, fail, ok } from "../../shared/utils/response";
import { reqUser, routeParam } from "../../shared/utils/route-param";
import {
	bulkDeleteSchema,
	bulkReassignSchema,
	createAccountSchema,
	listAccountsQuerySchema,
	updateAccountSchema,
} from "./accounts.schema";
import * as accountsService from "./accounts.service";
import * as crossref from "./accounts-crossref.service";
import { importAccountsFromCsv } from "./accounts-import.service";
import accountsNotesRouter from "./accounts-notes.router";

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
		const result = await importAccountsFromCsv(
			file.buffer.toString("utf8"),
			reqUser(req),
		);
		ok(res, result, "Import complete");
	},
);

router.post("/bulk/delete", validate(bulkDeleteSchema), async (req, res) => {
	const result = await accountsService.bulkDelete(req.body, reqUser(req));
	ok(res, result, "Accounts deleted");
});

router.post(
	"/bulk/reassign",
	validate(bulkReassignSchema),
	async (req, res) => {
		const result = await accountsService.bulkReassign(req.body, reqUser(req));
		ok(res, result, "Accounts reassigned");
	},
);

router.use("/:accountId/notes", accountsNotesRouter);

router.get("/:accountId/contacts", async (req, res) => {
	const result = await crossref.listRelatedContacts(
		routeParam(req.params.accountId),
		reqUser(req),
	);
	ok(res, result);
});

router.get("/:accountId/deals", async (req, res) => {
	const result = await crossref.listRelatedDeals(
		routeParam(req.params.accountId),
		reqUser(req),
	);
	ok(res, result);
});

router.post("/", validate(createAccountSchema), async (req, res) => {
	const account = await accountsService.createAccount(req.body, reqUser(req));
	created(res, account, "Account created");
});

router.get(
	"/",
	validate(listAccountsQuerySchema, "query"),
	async (req, res) => {
		const result = await accountsService.listAccounts(
			req.query as never,
			reqUser(req),
		);
		ok(res, result);
	},
);

router.get("/:id", async (req, res) => {
	const account = await accountsService.getAccount(
		routeParam(req.params.id),
		reqUser(req),
	);
	ok(res, account);
});

router.patch("/:id", validate(updateAccountSchema), async (req, res) => {
	const account = await accountsService.updateAccount(
		routeParam(req.params.id),
		req.body,
		reqUser(req),
	);
	ok(res, account, "Account updated");
});

router.delete("/:id", async (req, res) => {
	await accountsService.softDeleteAccount(
		routeParam(req.params.id),
		reqUser(req),
	);
	deleted(res, "Account deleted");
});

export default router;
