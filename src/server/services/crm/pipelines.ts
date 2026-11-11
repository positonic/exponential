import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { slugify } from "~/utils/slugify";

/**
 * Stages every new pipeline starts with (ADR-0033: pipelines stay generic;
 * users re-stage them with the stage editor).
 */
export const DEFAULT_PIPELINE_STAGES = [
  { name: "Lead", color: "gray", order: 0, type: "active" },
  { name: "Qualified", color: "blue", order: 1, type: "active" },
  { name: "Proposal", color: "violet", order: 2, type: "active" },
  { name: "Negotiation", color: "orange", order: 3, type: "active" },
  { name: "Won", color: "green", order: 4, type: "won" },
  { name: "Lost", color: "red", order: 5, type: "lost" },
] as const;

/**
 * Create a new, distinct pipeline in a workspace, seeded with
 * DEFAULT_PIPELINE_STAGES. Shared by the web router (`pipeline.create`) and
 * the API-key router (`crmApi.pipelineCreate`). Callers check workspace
 * membership first.
 */
export async function createPipelineProject(
  db: PrismaClient,
  args: { workspaceId: string; name: string; createdById: string },
) {
  // Names need not be unique; slugs must be, so suffix until free.
  const baseSlug = slugify(args.name) || "pipeline";
  let slug = baseSlug;
  let counter = 1;
  while (await db.project.findFirst({ where: { slug } })) {
    slug = `${baseSlug}_${counter}`;
    counter++;
  }

  return db.project.create({
    data: {
      name: args.name,
      slug,
      type: "pipeline",
      status: "ACTIVE",
      priority: "NONE",
      createdById: args.createdById,
      workspaceId: args.workspaceId,
      pipelineStages: {
        create: DEFAULT_PIPELINE_STAGES.map((stage) => ({
          name: stage.name,
          color: stage.color,
          order: stage.order,
          type: stage.type,
        })),
      },
    },
    include: {
      pipelineStages: {
        orderBy: { order: "asc" },
      },
    },
  });
}

/**
 * Load a stage and require it to belong to `pipelineId`. A deal's stage must
 * always sit on the deal's own pipeline (`Deal.projectId`); without this check
 * a stage id from another board leaves the deal listed under one pipeline but
 * placed in another's column.
 */
export async function requireStageOnPipeline(
  db: PrismaClient,
  stageId: string,
  pipelineId: string,
) {
  const stage = await db.pipelineStage.findUnique({ where: { id: stageId } });
  if (!stage) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Stage not found" });
  }
  if (stage.projectId !== pipelineId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Stage does not belong to the target pipeline. To move a deal to another pipeline, pass that pipeline's id and one of its stages.",
    });
  }
  return stage;
}
