import { type PrismaClient, type Prisma } from "@prisma/client";
import { type StepRegistry } from "./StepRegistry";

export class WorkflowEngine {
  constructor(
    private db: PrismaClient,
    private registry: StepRegistry,
  ) {}

  async execute(
    definitionId: string,
    triggeredById?: string,
    initialInput?: Record<string, unknown>,
  ) {
    const definition = await this.db.workflowDefinition.findUniqueOrThrow({
      where: { id: definitionId },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    const run = await this.db.workflowPipelineRun.create({
      data: {
        definitionId: definition.id,
        triggeredById,
        status: "RUNNING",
        input: (initialInput ?? definition.config) as Prisma.InputJsonValue,
      },
    });

    let stepInput: Record<string, unknown> = {
      ...(definition.config as Record<string, unknown>),
      ...initialInput,
    };

    const context = {
      userId: triggeredById ?? definition.createdById,
      workspaceId: definition.workspaceId,
      runId: run.id,
    };

    try {
      for (const step of definition.steps) {
        const startedAt = new Date();
        const stepRun = await this.db.workflowStepRun.create({
          data: {
            runId: run.id,
            stepId: step.id,
            status: "RUNNING",
            input: stepInput as Prisma.InputJsonValue,
            startedAt,
          },
        });

        try {
          const executor = this.registry.get(step.type);
          const output = await executor.execute(
            stepInput,
            step.config as Record<string, unknown>,
            context,
          );

          const completedAt = new Date();
          await this.db.workflowStepRun.update({
            where: { id: stepRun.id },
            data: {
              status: "SUCCESS",
              output: output as Prisma.InputJsonValue,
              completedAt,
              durationMs: completedAt.getTime() - startedAt.getTime(),
            },
          });

          stepInput = { ...stepInput, ...output };
        } catch (stepError) {
          const completedAt = new Date();
          const errorMessage =
            stepError instanceof Error
              ? stepError.message
              : "Unknown step error";

          await this.db.workflowStepRun.update({
            where: { id: stepRun.id },
            data: {
              status: "FAILED",
              errorMessage,
              completedAt,
              durationMs: completedAt.getTime() - startedAt.getTime(),
            },
          });

          throw stepError;
        }
      }

      const completedRun = await this.db.workflowPipelineRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          output: stepInput as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
        include: { stepRuns: true, contentDrafts: true },
      });

      await this.db.workflowDefinition.update({
        where: { id: definitionId },
        data: { lastRunAt: new Date() },
      });

      return completedRun;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown pipeline error";

      await this.db.workflowPipelineRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          errorMessage,
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }
}
