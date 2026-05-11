import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, ok } from "../../shared/utils/response";
import { mergedParam, reqUser } from "../../shared/utils/route-param";
import {
	listMessages,
	listMessagesQuerySchema,
	sendMessage,
	sendMessageSchema,
} from "./messages.service";

const router = Router({ mergeParams: true });

router.get(
	"/",
	validate(listMessagesQuerySchema, "query"),
	async (req, res) => {
		const result = await listMessages(
			mergedParam(req, "leadId"),
			req.query as never,
			reqUser(req),
		);
		ok(res, result);
	},
);

router.post("/", validate(sendMessageSchema), async (req, res) => {
	const message = await sendMessage(
		mergedParam(req, "leadId"),
		req.body,
		reqUser(req),
	);
	created(res, message, "Message sent");
});

export default router;
