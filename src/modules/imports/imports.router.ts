import { Router } from "express";
import multer from "multer";
import { guard } from "../../shared/middleware/rbac.middleware";
import { ok } from "../../shared/utils/response";
import { reqUser } from "../../shared/utils/route-param";
import { importLeadsFromCsv } from "./imports.service";

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
			res.status(400).json({
				status: -1,
				message: "Missing file",
				data: { code: "VALIDATION_ERROR" },
			});
			return;
		}
		const result = await importLeadsFromCsv(
			file.buffer.toString("utf8"),
			reqUser(req),
		);
		ok(res, result, "Import complete");
	},
);

export default router;
