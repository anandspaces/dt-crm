import { Router } from "express";
import multer from "multer";
import { created, deleted, fail, ok } from "../../shared/utils/response";
import { mergedParam, reqUser } from "../../shared/utils/route-param";
import {
	createDocumentFromUrl,
	createDocumentSchema,
	deleteDocument,
	listDocuments,
	uploadDocument,
} from "./documents.service";

const router = Router({ mergeParams: true });

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

router.get("/", async (req, res) => {
	const documents = await listDocuments(
		mergedParam(req, "leadId"),
		reqUser(req),
	);
	ok(res, { documents });
});

// POST /api/v1/leads/:leadId/documents
// Accepts multipart/form-data (file + optional name) for direct uploads,
// or application/json with { name, mimeType, sizeBytes, url } when the
// caller has already uploaded to external storage.
router.post("/", upload.single("file"), async (req, res) => {
	const leadId = mergedParam(req, "leadId");
	const actor = reqUser(req);

	if (req.file) {
		const nameOverride =
			typeof req.body.name === "string" && req.body.name.length > 0
				? req.body.name
				: undefined;
		const doc = await uploadDocument(leadId, req.file, nameOverride, actor);
		created(res, doc, "Document uploaded");
		return;
	}

	const parsed = createDocumentSchema.safeParse(req.body);
	if (!parsed.success) {
		fail(res, 400, "Missing file or document metadata", {
			code: "VALIDATION_ERROR",
			errors: parsed.error.issues,
		});
		return;
	}
	const doc = await createDocumentFromUrl(leadId, parsed.data, actor);
	created(res, doc, "Document saved");
});

// Backwards-compat alias for clients that already POST to /upload
router.post("/upload", upload.single("file"), async (req, res) => {
	const file = req.file;
	if (!file) {
		fail(res, 400, "Missing file", { code: "VALIDATION_ERROR" });
		return;
	}
	const leadId = mergedParam(req, "leadId");
	const nameOverride =
		typeof req.body.name === "string" && req.body.name.length > 0
			? req.body.name
			: undefined;
	const doc = await uploadDocument(leadId, file, nameOverride, reqUser(req));
	created(res, doc, "Document uploaded");
});

router.delete("/:docId", async (req, res) => {
	await deleteDocument(
		mergedParam(req, "leadId"),
		mergedParam(req, "docId"),
		reqUser(req),
	);
	deleted(res, "Document deleted");
});

export default router;
