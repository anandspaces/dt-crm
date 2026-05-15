import express, { Router } from "express";
import { logger } from "../../shared/utils/logger";
import { fail, ok } from "../../shared/utils/response";
import {
	appendVobizTranscript,
	handleRecordingComplete,
	handleVobizAnswer,
	handleVobizHangup,
} from "./vobiz.service";

const router = Router();

// Vobiz (Plivo-compatible) ships both JSON and url-encoded bodies depending on
// the call type. Accept both. These routes are mounted publicly — no auth.
router.use(express.json({ limit: "1mb" }));
router.use(express.urlencoded({ extended: true, limit: "1mb" }));

function strParam(value: unknown): string | undefined {
	if (typeof value === "string" && value.length > 0) return value;
	if (Array.isArray(value) && typeof value[0] === "string") return value[0];
	return undefined;
}

function numParam(value: unknown): number | undefined {
	const s = strParam(value);
	if (!s) return undefined;
	const n = Number(s);
	return Number.isFinite(n) ? n : undefined;
}

router.post("/answer", async (req, res) => {
	const batchId = strParam(req.query.batchId);
	const itemId = strParam(req.query.itemId);
	const userId = strParam(req.query.userId);
	const callUuid =
		strParam((req.body as Record<string, unknown>)?.CallUUID) ?? "";
	if (!batchId || !itemId || !userId) {
		fail(res, 400, "Missing batchId/itemId/userId");
		return;
	}

	try {
		const xml = await handleVobizAnswer({ batchId, itemId, userId, callUuid });
		res.set("Content-Type", "text/xml").send(xml);
	} catch (err) {
		logger.error("[vobiz/answer] handler failed", {
			itemId,
			error: err instanceof Error ? err.message : String(err),
		});
		// Even on failure, return a minimal hangup XML so Vobiz drops the call gracefully.
		res
			.set("Content-Type", "text/xml")
			.send(
				`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`,
			);
	}
});

router.post("/hangup", async (req, res) => {
	const batchId = strParam(req.query.batchId);
	const itemId = strParam(req.query.itemId);
	const userId = strParam(req.query.userId);
	if (!batchId || !itemId || !userId) {
		fail(res, 400, "Missing batchId/itemId/userId");
		return;
	}

	const body = (req.body as Record<string, unknown>) ?? {};
	res.status(200).send("OK");

	void handleVobizHangup({
		batchId,
		itemId,
		userId,
		callUuid: strParam(body.CallUUID),
		callStatus: strParam(body.CallStatus),
		durationSeconds: numParam(body.Duration ?? body.Billsec),
		hangupCause: strParam(body.HangupCause),
	}).catch((err) => {
		logger.error("[vobiz/hangup] handler failed", {
			itemId,
			error: err instanceof Error ? err.message : String(err),
		});
	});
});

router.post("/recording-complete", async (req, res) => {
	const batchId = strParam(req.query.batchId);
	const itemId = strParam(req.query.itemId);
	if (!batchId || !itemId) {
		fail(res, 400, "Missing batchId/itemId");
		return;
	}

	const body = (req.body as Record<string, unknown>) ?? {};
	res.status(200).send("OK");

	void handleRecordingComplete({
		batchId,
		itemId,
		recordingId: strParam(body.recording_id ?? body.RecordingID),
		recordUrl: strParam(body.record_url ?? body.RecordUrl ?? body.RecordingUrl),
	}).catch((err) => {
		logger.error("[vobiz/recording-complete] handler failed", {
			itemId,
			error: err instanceof Error ? err.message : String(err),
		});
	});
});

router.post("/recording-transcription", async (req, res) => {
	const itemId = strParam(req.query.itemId);
	if (!itemId) {
		fail(res, 400, "Missing itemId");
		return;
	}
	const body = (req.body as Record<string, unknown>) ?? {};
	const text =
		strParam(body.transcription ?? body.Transcription ?? body.text) ?? "";
	res.status(200).send("OK");
	void appendVobizTranscript(itemId, text);
});

router.post("/stream-status", (req, res) => {
	const itemId = strParam(req.query.itemId);
	logger.info("[vobiz/stream-status]", { itemId, body: req.body });
	ok(res, { received: true });
});

export default router;
