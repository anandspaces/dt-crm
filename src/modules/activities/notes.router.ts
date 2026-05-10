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
} from "./notes.service";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
	const notes = await listNotes(mergedParam(req, "leadId"), reqUser(req));
	ok(res, notes);
});

router.post("/", validate(createNoteSchema), async (req, res) => {
	const note = await createNote(
		mergedParam(req, "leadId"),
		req.body.content,
		reqUser(req),
	);
	created(res, note);
});

router.patch("/:noteId", validate(updateNoteSchema), async (req, res) => {
	const note = await updateNote(
		mergedParam(req, "leadId"),
		mergedParam(req, "noteId"),
		req.body.content,
		reqUser(req),
	);
	ok(res, note);
});

router.delete("/:noteId", async (req, res) => {
	await deleteNote(
		mergedParam(req, "leadId"),
		mergedParam(req, "noteId"),
		reqUser(req),
	);
	deleted(res);
});

export default router;
