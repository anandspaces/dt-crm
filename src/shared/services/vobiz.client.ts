import { env } from "../../config/env";
import { logger } from "../utils/logger";

const VOBIZ_BASE = "https://api.vobiz.ai/api/v1";

function authHeaders(): Record<string, string> {
	if (!env.VOBIZ_AUTH_ID || !env.VOBIZ_AUTH_TOKEN) {
		throw new Error(
			"Vobiz credentials missing — set VOBIZ_AUTH_ID and VOBIZ_AUTH_TOKEN",
		);
	}
	return {
		"X-Auth-ID": env.VOBIZ_AUTH_ID,
		"X-Auth-Token": env.VOBIZ_AUTH_TOKEN,
		"Content-Type": "application/json",
	};
}

function accountPath(suffix: string): string {
	if (!env.VOBIZ_AUTH_ID) throw new Error("VOBIZ_AUTH_ID not set");
	return `${VOBIZ_BASE}/Account/${env.VOBIZ_AUTH_ID}/${suffix}`;
}

export interface InitiateCallParams {
	from: string;
	to: string;
	answerUrl: string;
	hangupUrl: string;
	ringTimeout?: number;
	timeLimit?: number;
}

export interface VobizCallResponse {
	request_uuid?: string;
	message?: string;
	api_id?: string;
}

/** POST /Account/{id}/Call/ — initiate an outbound call. */
export async function initiateVobizCall(
	params: InitiateCallParams,
): Promise<VobizCallResponse> {
	const body = {
		from: params.from,
		to: params.to,
		answer_url: params.answerUrl,
		answer_method: "POST",
		hangup_url: params.hangupUrl,
		hangup_method: "POST",
		ring_timeout: String(params.ringTimeout ?? env.VOBIZ_RING_TIMEOUT),
		time_limit: String(params.timeLimit ?? env.VOBIZ_TIME_LIMIT),
		machine_detection: env.VOBIZ_MACHINE_DETECTION ? "true" : "false",
	};

	const res = await fetch(accountPath("Call/"), {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify(body),
	});

	const text = await res.text();
	let parsed: VobizCallResponse;
	try {
		parsed = JSON.parse(text) as VobizCallResponse;
	} catch {
		parsed = { message: text };
	}

	if (!res.ok) {
		logger.error("[vobiz] initiateCall failed", {
			status: res.status,
			body: parsed,
		});
		throw new Error(
			`Vobiz initiate-call failed (${res.status}): ${parsed.message ?? text}`,
		);
	}

	return parsed;
}

/** POST /Account/{id}/Call/{callUuid}/Record/ — start recording on an active call. */
export async function startVobizRecording(
	callUuid: string,
	callbackUrl: string,
	transcriptionUrl?: string,
): Promise<{ recording_id?: string }> {
	const body: Record<string, unknown> = {
		time_limit: env.VOBIZ_RECORDING_TIME_LIMIT,
		file_format: env.VOBIZ_RECORDING_FORMAT,
		channels: env.VOBIZ_RECORDING_CHANNELS,
		callback_url: callbackUrl,
		callback_method: "POST",
	};
	if (transcriptionUrl) {
		body.transcription_url = transcriptionUrl;
		body.transcription_method = "POST";
	}

	const res = await fetch(accountPath(`Call/${callUuid}/Record/`), {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify(body),
	});

	const text = await res.text();
	if (!res.ok) {
		logger.error("[vobiz] startRecording failed", {
			status: res.status,
			callUuid,
			body: text,
		});
		// Recording failure should not crash the call — log and move on.
		return {};
	}

	try {
		return JSON.parse(text) as { recording_id?: string };
	} catch {
		return {};
	}
}
