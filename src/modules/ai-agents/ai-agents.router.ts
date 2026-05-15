import { Router } from "express";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, deleted, ok } from "../../shared/utils/response";
import { reqUser, routeParam } from "../../shared/utils/route-param";
import {
	createAiAgentSchema,
	updateAiAgentSchema,
	uploadRagSchema,
} from "./ai-agents.schema";
import * as agentsService from "./ai-agents.service";

const router = Router();

router.get("/", async (req, res) => {
	const agents = await agentsService.listAgents(reqUser(req));
	ok(res, { agents });
});

router.get("/:id", async (req, res) => {
	const agent = await agentsService.getAgent(
		routeParam(req.params.id),
		reqUser(req),
	);
	ok(res, agent);
});

router.post("/", validate(createAiAgentSchema), async (req, res) => {
	const agent = await agentsService.createAgent(req.body, reqUser(req));
	created(res, agent, "Agent created");
});

router.patch("/:id", validate(updateAiAgentSchema), async (req, res) => {
	const agent = await agentsService.updateAgent(
		routeParam(req.params.id),
		req.body,
		reqUser(req),
	);
	ok(res, agent, "Agent updated");
});

router.delete("/:id", async (req, res) => {
	await agentsService.deleteAgent(routeParam(req.params.id), reqUser(req));
	deleted(res, "Agent deleted");
});

router.post("/:id/rag", validate(uploadRagSchema), async (req, res) => {
	const result = await agentsService.uploadKnowledge(
		routeParam(req.params.id),
		req.body,
		reqUser(req),
	);
	created(res, result, `Inserted ${result.inserted} knowledge chunks`);
});

router.delete("/:id/rag", async (req, res) => {
	await agentsService.clearKnowledge(routeParam(req.params.id), reqUser(req));
	deleted(res, "Knowledge base cleared");
});

export default router;
