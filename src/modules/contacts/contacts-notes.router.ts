import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, deleted, ok } from "../../shared/utils/response";
import { mergedParam, reqUser } from "../../shared/utils/route-param";
import {
	createNote,
	createNoteSchema,
	deleteNote,
	listNotes,
	updateNote,
	updateNoteSchema,
} from "./contacts-notes.service";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
	const result = await listNotes(mergedParam(req, "contactId"), reqUser(req));
	ok(res, result);
});

router.post("/", validate(createNoteSchema), async (req, res) => {
	const note = await createNote(
		mergedParam(req, "contactId"),
		req.body.text,
		reqUser(req),
	);
	created(res, note, "Note added");
});

router.patch("/:noteId", validate(updateNoteSchema), async (req, res) => {
	const note = await updateNote(
		mergedParam(req, "contactId"),
		mergedParam(req, "noteId"),
		req.body.text,
		reqUser(req),
	);
	ok(res, note, "Note updated");
});

router.delete("/:noteId", async (req, res) => {
	await deleteNote(
		mergedParam(req, "contactId"),
		mergedParam(req, "noteId"),
		reqUser(req),
	);
	deleted(res, "Note deleted");
});

export default router;
