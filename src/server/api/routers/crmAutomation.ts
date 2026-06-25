import { z } from "zod";
import { type PrismaClient, type Prisma } from "@prisma/client";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { seedCrmOnboardingAutomations } from "~/server/services/crm/automation/seedCrmOnboardingAutomations";
import { CRM_CONTACT_TYPE_TRIGGER } from "~/server/services/crm/automation/triggerResolver";
import {
  CRM_AUTOMATION_STEP_CATALOG,
  stepLabelForType,
} from "~/lib/crm/automationCatalog";

/**
 * CRM **Automations** — user-facing surface over the internal Workflow engine
 * (CONTEXT.md → CRM & Automations / Automation builder, ADR-0025/0028). Lists
 * and runs feed the overview; get/create/saveDefinition/setActive/remove back
 * the visual builder. Starter automations are seeded-if-absent and
 * deactivate-only (`isDefault`).
 */

const VALID_STEP_TYPES = new Set(
  CRM_AUTOMATION_STEP_CATALOG.map((s) => s.type),
);

function configObject(config: Prisma.JsonValue | null): Record<string, unknown> {
  return config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

function isDefaultConfig(config: Prisma.JsonValue | null): boolean {
  return configObject(config).isDefault === true;
}

function targetCustomerTypeOf(config: Prisma.JsonValue | null): string | null {
  const value = configObject(config).targetCustomerType;
  return typeof value === "string" ? value : null;
}

async function assertMember(
  db: PrismaClient,
  workspaceId: string,
  userId: string,
) {
  const membership = await db.workspaceUser.findFirst({
    where: { workspaceId, userId },
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this workspace",
    });
  }
}

async function loadDefinitionForUser(
  db: PrismaClient,
  id: string,
  userId: string,
) {
  const definition = await db.workflowDefinition.findFirst({
    where: { id, triggerType: CRM_CONTACT_TYPE_TRIGGER },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!definition) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Automation not found" });
  }
  await assertMember(db, definition.workspaceId, userId);
  return definition;
}

const workspaceInput = z.object({ workspaceId: z.string() });

const stepInput = z.object({
  type: z.string(),
  label: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

export const crmAutomationRouter = createTRPCRouter({
  /** Seed the starter automations for a workspace if absent (never clobbers). */
  ensureDefaults: protectedProcedure
    .input(workspaceInput)
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, input.workspaceId, ctx.session.user.id);
      return seedCrmOnboardingAutomations(
        ctx.db,
        input.workspaceId,
        ctx.session.user.id,
      );
    }),

  /** List the workspace's CRM automations with their steps and run counts. */
  list: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
    await assertMember(ctx.db, input.workspaceId, ctx.session.user.id);
    return ctx.db.workflowDefinition.findMany({
      where: {
        workspaceId: input.workspaceId,
        triggerType: CRM_CONTACT_TYPE_TRIGGER,
      },
      include: {
        steps: { orderBy: { order: "asc" } },
        _count: { select: { runs: true } },
      },
      orderBy: { name: "asc" },
    });
  }),

  /** A single automation with its steps (for the builder). */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const definition = await loadDefinitionForUser(
        ctx.db,
        input.id,
        ctx.session.user.id,
      );
      return {
        ...definition,
        isDefault: isDefaultConfig(definition.config),
        targetCustomerType: targetCustomerTypeOf(definition.config),
      };
    }),

  /** Create a new, inactive (draft) automation; returns its id. */
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(200),
        targetCustomerType: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, input.workspaceId, ctx.session.user.id);
      const definition = await ctx.db.workflowDefinition.create({
        data: {
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
          templateId: null,
          name: input.name,
          config: {
            targetCustomerType: input.targetCustomerType,
            isDefault: false,
          } as Prisma.InputJsonValue,
          triggerType: CRM_CONTACT_TYPE_TRIGGER,
          isActive: false,
        },
      });
      return { id: definition.id };
    }),

  /** Save name, trigger target, and the ordered step list (replaces steps). */
  saveDefinition: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200),
        targetCustomerType: z.string().min(1),
        steps: z.array(stepInput),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const definition = await loadDefinitionForUser(
        ctx.db,
        input.id,
        ctx.session.user.id,
      );

      for (const step of input.steps) {
        if (!VALID_STEP_TYPES.has(step.type)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unknown step type: ${step.type}`,
          });
        }
      }

      const nextConfig = {
        ...configObject(definition.config),
        targetCustomerType: input.targetCustomerType,
      };

      await ctx.db.$transaction([
        ctx.db.workflowDefinition.update({
          where: { id: definition.id },
          data: {
            name: input.name,
            config: nextConfig as Prisma.InputJsonValue,
          },
        }),
        ctx.db.workflowStep.deleteMany({
          where: { definitionId: definition.id },
        }),
        ...input.steps.map((step, i) =>
          ctx.db.workflowStep.create({
            data: {
              definitionId: definition.id,
              order: i,
              type: step.type,
              label: step.label ?? stepLabelForType(step.type),
              config: (step.config ?? {}) as Prisma.InputJsonValue,
            },
          }),
        ),
      ]);

      return { id: definition.id };
    }),

  /** Activate / deactivate an automation. Activating requires a valid config. */
  setActive: protectedProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const definition = await loadDefinitionForUser(
        ctx.db,
        input.id,
        ctx.session.user.id,
      );

      if (input.isActive) {
        if (!targetCustomerTypeOf(definition.config)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Set a trigger Customer type before activating.",
          });
        }
        if (definition.steps.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Add at least one step before activating.",
          });
        }
      }

      await ctx.db.workflowDefinition.update({
        where: { id: definition.id },
        data: { isActive: input.isActive },
      });
      return { id: definition.id, isActive: input.isActive };
    }),

  /** Delete an automation (including starter `isDefault` ones). */
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const definition = await loadDefinitionForUser(
        ctx.db,
        input.id,
        ctx.session.user.id,
      );
      await ctx.db.workflowDefinition.delete({ where: { id: definition.id } });
      return { id: definition.id };
    }),

  /** Recent automation runs for the workspace (newest first). */
  listRuns: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertMember(ctx.db, input.workspaceId, ctx.session.user.id);
      return ctx.db.workflowPipelineRun.findMany({
        where: {
          definition: {
            workspaceId: input.workspaceId,
            triggerType: CRM_CONTACT_TYPE_TRIGGER,
          },
        },
        include: {
          definition: { select: { name: true } },
          stepRuns: { orderBy: { startedAt: "asc" } },
        },
        orderBy: { startedAt: "desc" },
        take: input.limit,
      });
    }),
});
