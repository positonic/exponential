import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { seedCrmOnboardingAutomations } from "~/server/services/crm/automation/seedCrmOnboardingAutomations";
import { CRM_CONTACT_TYPE_TRIGGER } from "~/server/services/crm/automation/triggerResolver";

/**
 * CRM **Automations** — the user-facing surface over the internal Workflow
 * engine (CONTEXT.md → CRM & Automations, ADR-0025). For the PoC the onboarding
 * automations are seeded in code; this router exposes seeding, listing, and run
 * history. A drag-and-drop builder is deferred.
 */
const workspaceInput = z.object({ workspaceId: z.string() });

export const crmAutomationRouter = createTRPCRouter({
  /** Seed the PoC onboarding automations for a workspace (idempotent). */
  seedDefaults: protectedProcedure
    .input(workspaceInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.workspaceUser.findFirst({
        where: { workspaceId: input.workspaceId, userId: ctx.session.user.id },
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this workspace",
        });
      }
      return seedCrmOnboardingAutomations(
        ctx.db,
        input.workspaceId,
        ctx.session.user.id,
      );
    }),

  /** List the workspace's CRM automations with their steps and run counts. */
  list: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
    const membership = await ctx.db.workspaceUser.findFirst({
      where: { workspaceId: input.workspaceId, userId: ctx.session.user.id },
    });
    if (!membership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have access to this workspace",
      });
    }
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

  /** Recent automation runs for the workspace (newest first). */
  listRuns: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const membership = await ctx.db.workspaceUser.findFirst({
        where: { workspaceId: input.workspaceId, userId: ctx.session.user.id },
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this workspace",
        });
      }
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
