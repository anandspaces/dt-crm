import { Router } from "express";
import { guard } from "../../shared/middleware/rbac.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import { created, deleted, ok } from "../../shared/utils/response";
import { routeParam } from "../../shared/utils/route-param";
import {
	addStageSchema,
	createPipelineSchema,
	updatePipelineSchema,
	updateStageSchema,
} from "./pipelines.schema";
import * as pipelinesService from "./pipelines.service";

const router = Router();

router.get("/", async (_req, res) => {
	const pipelines = await pipelinesService.listPipelines();
	ok(res, pipelines);
});

router.post(
	"/",
	guard("ADMIN", "MANAGER"),
	validate(createPipelineSchema),
	async (req, res) => {
		const pipeline = await pipelinesService.createPipeline(req.body);
		created(res, pipeline);
	},
);

router.patch(
	"/:id",
	guard("ADMIN", "MANAGER"),
	validate(updatePipelineSchema),
	async (req, res) => {
		const pipeline = await pipelinesService.updatePipeline(
			routeParam(req.params.id),
			req.body,
		);
		ok(res, pipeline);
	},
);

router.post(
	"/:id/stages",
	guard("ADMIN", "MANAGER"),
	validate(addStageSchema),
	async (req, res) => {
		const stage = await pipelinesService.addStage(
			routeParam(req.params.id),
			req.body,
		);
		created(res, stage);
	},
);

router.patch(
	"/:id/stages/:stageId",
	guard("ADMIN", "MANAGER"),
	validate(updateStageSchema),
	async (req, res) => {
		const stage = await pipelinesService.updateStage(
			routeParam(req.params.stageId),
			req.body,
		);
		ok(res, stage);
	},
);

router.delete(
	"/:id/stages/:stageId",
	guard("ADMIN", "MANAGER"),
	async (req, res) => {
		await pipelinesService.deleteStage(routeParam(req.params.stageId));
		deleted(res);
	},
);

export default router;
