import { Router } from "express";
import multer from "multer";
import { guard } from "../../shared/middleware/rbac.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, deleted, fail, ok } from "../../shared/utils/response";
import { reqUser, routeParam } from "../../shared/utils/route-param";
import {
	bulkAddTagSchema,
	bulkDeleteSchema,
	bulkReassignSchema,
	createContactSchema,
	listContactsQuerySchema,
	updateContactSchema,
} from "./contacts.schema";
import * as contactsService from "./contacts.service";
import * as crossref from "./contacts-crossref.service";
import { importContactsFromCsv } from "./contacts-import.service";
import contactsNotesRouter from "./contacts-notes.router";

const router = Router();

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── Import + Bulk routes (BEFORE :id router to avoid /:id matching "bulk") ──

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
		const result = await importContactsFromCsv(
			file.buffer.toString("utf8"),
			reqUser(req),
		);
		ok(res, result, "Import complete");
	},
);

router.post("/bulk/delete", validate(bulkDeleteSchema), async (req, res) => {
	const result = await contactsService.bulkDelete(req.body, reqUser(req));
	ok(res, result, "Contacts deleted");
});

router.post(
	"/bulk/reassign",
	validate(bulkReassignSchema),
	async (req, res) => {
		const result = await contactsService.bulkReassign(req.body, reqUser(req));
		ok(res, result, "Contacts reassigned");
	},
);

router.post("/bulk/add-tag", validate(bulkAddTagSchema), async (req, res) => {
	const result = await contactsService.bulkAddTag(req.body, reqUser(req));
	ok(res, result, "Tag added");
});

// ─── Nested per-contact sub-routers ──────────────────────────────────────────

router.use("/:contactId/notes", contactsNotesRouter);

router.get("/:contactId/deals", async (req, res) => {
	const result = await crossref.listRelatedDeals(
		routeParam(req.params.contactId),
		reqUser(req),
	);
	ok(res, result);
});

router.get("/:contactId/activities", async (req, res) => {
	const result = await crossref.listRelatedActivities(
		routeParam(req.params.contactId),
		reqUser(req),
	);
	ok(res, result);
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

router.post("/", validate(createContactSchema), async (req, res) => {
	const contact = await contactsService.createContact(req.body, reqUser(req));
	created(res, contact, "Contact created");
});

router.get(
	"/",
	validate(listContactsQuerySchema, "query"),
	async (req, res) => {
		const result = await contactsService.listContacts(
			req.query as never,
			reqUser(req),
		);
		ok(res, result);
	},
);

router.get("/:id", async (req, res) => {
	const contact = await contactsService.getContact(
		routeParam(req.params.id),
		reqUser(req),
	);
	ok(res, contact);
});

router.patch("/:id", validate(updateContactSchema), async (req, res) => {
	const contact = await contactsService.updateContact(
		routeParam(req.params.id),
		req.body,
		reqUser(req),
	);
	ok(res, contact, "Contact updated");
});

router.delete("/:id", async (req, res) => {
	await contactsService.softDeleteContact(
		routeParam(req.params.id),
		reqUser(req),
	);
	deleted(res, "Contact deleted");
});

export default router;
