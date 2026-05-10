import { Router } from "express";
import multer from "multer";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, deleted, ok } from "../../shared/utils/response";
import { mergedParam, reqUser } from "../../shared/utils/route-param";
import {
	createDocument,
	createDocumentSchema,
	deleteDocument,
	listDocuments,
} from "./documents.service";

const router = Router({ mergeParams: true });

// In-memory storage — swap for S3/multer-s3 in production
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

// JSON metadata endpoint (already-uploaded URL): POST { name, mimeType, sizeBytes, url }
router.post("/", validate(createDocumentSchema), async (req, res) => {
	const doc = await createDocument(
		mergedParam(req, "leadId"),
		req.body,
		reqUser(req),
	);
	created(res, doc, "Document saved");
});

// Multipart upload — stub: returns a placeholder URL until storage is wired up
router.post("/upload", upload.single("file"), async (req, res) => {
	const file = req.file;
	if (!file) {
		res.status(400).json({
			status: -1,
			message: "Missing file",
			data: { code: "VALIDATION_ERROR" },
		});
		return;
	}

	const leadId = mergedParam(req, "leadId");
	const name =
		typeof req.body.name === "string" && req.body.name.length > 0
			? req.body.name
			: file.originalname;

	const doc = await createDocument(
		leadId,
		{
			name,
			mimeType: file.mimetype,
			sizeBytes: file.size,
			// TODO: wire to S3 / object storage; placeholder for now
			url: `https://files.example.com/leads/${leadId}/${file.originalname}`,
		},
		reqUser(req),
	);
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
