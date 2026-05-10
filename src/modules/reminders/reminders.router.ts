import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, deleted, ok } from "../../shared/utils/response";
import { mergedParam, reqUser } from "../../shared/utils/route-param";
import {
	createReminder,
	createReminderSchema,
	deleteReminder,
	listReminders,
	updateReminder,
	updateReminderSchema,
} from "./reminders.service";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
	const reminders = await listReminders(
		mergedParam(req, "leadId"),
		reqUser(req),
	);
	ok(res, { reminders });
});

router.post("/", validate(createReminderSchema), async (req, res) => {
	const reminder = await createReminder(
		mergedParam(req, "leadId"),
		req.body,
		reqUser(req),
	);
	created(res, reminder, "Reminder created");
});

router.patch("/:id", validate(updateReminderSchema), async (req, res) => {
	const reminder = await updateReminder(
		mergedParam(req, "leadId"),
		mergedParam(req, "id"),
		req.body,
		reqUser(req),
	);
	ok(res, reminder, "Reminder updated");
});

router.delete("/:id", async (req, res) => {
	await deleteReminder(
		mergedParam(req, "leadId"),
		mergedParam(req, "id"),
		reqUser(req),
	);
	deleted(res, "Reminder deleted");
});

export default router;
