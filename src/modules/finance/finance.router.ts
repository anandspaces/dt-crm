import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, ok } from "../../shared/utils/response";
import { mergedParam, reqUser } from "../../shared/utils/route-param";
import { addPayment, addPaymentSchema, getFinance } from "./finance.service";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
	const finance = await getFinance(mergedParam(req, "leadId"), reqUser(req));
	ok(res, finance);
});

router.post("/payments", validate(addPaymentSchema), async (req, res) => {
	const payment = await addPayment(
		mergedParam(req, "leadId"),
		req.body,
		reqUser(req),
	);
	created(res, payment, "Payment added");
});

export default router;
