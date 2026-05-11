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
} from "./accounts-notes.service";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
	const result = await listNotes(mergedParam(req, "accountId"), reqUser(req));
	ok(res, result);
});

router.post("/", validate(createNoteSchema), async (req, res) => {
	const note = await createNote(
		mergedParam(req, "accountId"),
		req.body.text,
		reqUser(req),
	);
	created(res, note, "Note added");
});

router.patch("/:noteId", validate(updateNoteSchema), async (req, res) => {
	const note = await updateNote(
		mergedParam(req, "accountId"),
		mergedParam(req, "noteId"),
		req.body.text,
		reqUser(req),
	);
	ok(res, note, "Note updated");
});

router.delete("/:noteId", async (req, res) => {
	await deleteNote(
		mergedParam(req, "accountId"),
		mergedParam(req, "noteId"),
		reqUser(req),
	);
	deleted(res, "Note deleted");
});

export default router;
