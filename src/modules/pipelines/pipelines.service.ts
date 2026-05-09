import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../config/db";
import { leads, pipelineStages, pipelines } from "../../db/schema";
import { NotFoundError, UnprocessableError } from "../../shared/utils/errors";
import type {
	AddStageInput,
	CreatePipelineInput,
	UpdatePipelineInput,
	UpdateStageInput,
} from "./pipelines.schema";

export async function listPipelines() {
	return db.query.pipelines.findMany({
		with: {
			stages: { orderBy: (s, { asc }) => [asc(s.position)] },
		},
		orderBy: (p, { asc }) => [asc(p.name)],
	});
}

export async function createPipeline(input: CreatePipelineInput) {
	return db.transaction(async (tx) => {
		const [pipeline] = await tx
			.insert(pipelines)
			.values({ name: input.name, description: input.description })
			.returning();

		if (!pipeline) throw new Error("Failed to create pipeline");

		if (input.stages.length > 0) {
			await tx.insert(pipelineStages).values(
				input.stages.map((s) => ({
					pipelineId: pipeline.id,
					name: s.name,
					position: s.position,
					color: s.color,
					isClosed: s.isClosed,
					isWon: s.isWon,
				})),
			);
		}

		return tx.query.pipelines.findFirst({
			where: eq(pipelines.id, pipeline.id),
			with: { stages: { orderBy: (s, { asc }) => [asc(s.position)] } },
		});
	});
}

export async function updatePipeline(id: string, input: UpdatePipelineInput) {
	const [existing] = await db
		.select()
		.from(pipelines)
		.where(eq(pipelines.id, id))
		.limit(1);
	if (!existing) throw new NotFoundError("Pipeline not found");

	const [updated] = await db
		.update(pipelines)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(pipelines.id, id))
		.returning();

	return updated;
}

export async function addStage(pipelineId: string, input: AddStageInput) {
	const [pipeline] = await db
		.select()
		.from(pipelines)
		.where(eq(pipelines.id, pipelineId))
		.limit(1);
	if (!pipeline) throw new NotFoundError("Pipeline not found");

	const [stage] = await db
		.insert(pipelineStages)
		.values({ pipelineId, ...input })
		.returning();

	return stage;
}

export async function updateStage(stageId: string, input: UpdateStageInput) {
	const [existing] = await db
		.select()
		.from(pipelineStages)
		.where(eq(pipelineStages.id, stageId))
		.limit(1);
	if (!existing) throw new NotFoundError("Stage not found");

	const [updated] = await db
		.update(pipelineStages)
		.set(input)
		.where(eq(pipelineStages.id, stageId))
		.returning();

	return updated;
}

export async function deleteStage(stageId: string) {
	const [stage] = await db
		.select()
		.from(pipelineStages)
		.where(eq(pipelineStages.id, stageId))
		.limit(1);
	if (!stage) throw new NotFoundError("Stage not found");

	const [leadsInStage] = await db
		.select({ id: leads.id })
		.from(leads)
		.where(and(eq(leads.stageId, stageId), isNull(leads.deletedAt)))
		.limit(1);

	if (leadsInStage) {
		throw new UnprocessableError(
			"Cannot delete stage with active leads. Move leads first.",
		);
	}

	await db.delete(pipelineStages).where(eq(pipelineStages.id, stageId));
}
