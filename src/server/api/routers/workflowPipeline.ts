import { z } from "zod";
import { type Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { WorkflowEngine } from "~/server/services/workflows/WorkflowEngine";
import { createStepRegistry } from "~/server/services/workflows/StepRegistry";
import { seedWorkflowTemplates } from "~/server/services/workflows/seedTemplates";

interface StepDefinition {
  type: string;
  label: string;
  defaultConfig?: Record<string, unknown>;
}

export const workflowPipelineRouter = createTRPCRouter({
  /** List all active workflow templates */
  listTemplates: protectedProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.workflowTemplate.findMany({
        where: {
          isActive: true,
          ...(input?.category ? { category: input.category } : {}),
        },
        orderBy: { name: "asc" },
      });
    }),

  /** Get a single template by slug */
  getTemplate: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.db.workflowTemplate.findUnique({
        where: { slug: input.slug },
      });
      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }
      return template;
    }),

  /** Create a workflow definition from a template */
  createDefinition: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        templateSlug: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        config: z.record(z.unknown()),
        triggerType: z
          .enum(["manual", "scheduled", "webhook"])
          .default("manual"),
        cronSchedule: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.db.workflowTemplate.findUnique({
        where: { slug: input.templateSlug },
      });
      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      const definition = await ctx.db.workflowDefinition.create({
        data: {
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
          templateId: template.id,
          name: input.name,
          description: input.description,
          config: input.config as Prisma.InputJsonValue,
          triggerType: input.triggerType,
          cronSchedule: input.cronSchedule,
        },
      });

      const stepDefs = template.stepDefinitions as unknown as StepDefinition[];
      for (let i = 0; i < stepDefs.length; i++) {
        const stepDef = stepDefs[i]!;
        await ctx.db.workflowStep.create({
          data: {
            definitionId: definition.id,
            order: i,
            type: stepDef.type,
            label: stepDef.label,
            config: (stepDef.defaultConfig ?? {}) as Prisma.InputJsonValue,
          },
        });
      }

      return ctx.db.workflowDefinition.findUniqueOrThrow({
        where: { id: definition.id },
        include: { steps: { orderBy: { order: "asc" } }, template: true },
      });
    }),

  /** List workflow definitions for a workspace */
  listDefinitions: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.workflowDefinition.findMany({
        where: {
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
        },
        include: {
          template: { select: { name: true, slug: true, category: true } },
          _count: { select: { runs: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
    }),

  /** Get a single definition with steps */
  getDefinition: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.workflowDefinition.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          steps: { orderBy: { order: "asc" } },
          template: true,
        },
      });
    }),

  /** Update a workflow definition */
  updateDefinition: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        config: z.record(z.unknown()).optional(),
        triggerType: z.enum(["manual", "scheduled", "webhook"]).optional(),
        cronSchedule: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, config, ...rest } = input;
      return ctx.db.workflowDefinition.update({
        where: { id },
        data: {
          ...rest,
          ...(config !== undefined
            ? { config: config as Prisma.InputJsonValue }
            : {}),
        },
      });
    }),

  /** Delete a workflow definition */
  deleteDefinition: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.workflowDefinition.delete({
        where: { id: input.id },
      });
    }),

  /** Execute a workflow definition */
  execute: protectedProcedure
    .input(
      z.object({
        definitionId: z.string(),
        overrideConfig: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const registry = createStepRegistry(ctx.db);
      const engine = new WorkflowEngine(ctx.db, registry);

      return engine.execute(
        input.definitionId,
        ctx.session.user.id,
        input.overrideConfig,
      );
    }),

  /** List runs for a definition */
  listRuns: protectedProcedure
    .input(
      z.object({
        definitionId: z.string().optional(),
        workspaceId: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const runs = await ctx.db.workflowPipelineRun.findMany({
        where: {
          ...(input.definitionId
            ? { definitionId: input.definitionId }
            : {}),
          ...(input.workspaceId
            ? { definition: { workspaceId: input.workspaceId } }
            : {}),
        },
        include: {
          definition: { select: { name: true } },
          _count: { select: { stepRuns: true, contentDrafts: true } },
        },
        orderBy: { startedAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (runs.length > input.limit) {
        const next = runs.pop();
        nextCursor = next?.id;
      }

      return { runs, nextCursor };
    }),

  /** Get a single run with step detail */
  getRun: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.workflowPipelineRun.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          definition: { select: { name: true } },
          stepRuns: {
            include: { step: { select: { label: true, type: true } } },
            orderBy: { startedAt: "asc" },
          },
          contentDrafts: {
            select: {
              id: true,
              title: true,
              platform: true,
              status: true,
            },
          },
        },
      });
    }),

  /** Seed system templates (admin/setup) */
  seedTemplates: protectedProcedure.mutation(async ({ ctx }) => {
    await seedWorkflowTemplates(ctx.db);
    return { success: true };
  }),
});
