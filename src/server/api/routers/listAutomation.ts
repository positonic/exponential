import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { LIST_MEMBER_ADDED_TRIGGER } from "~/server/services/crm/automation/listMemberTrigger";

/**
 * Read-only surface for **List-triggered Automations** (`list_member_added`,
 * [ADR-0031]). The `crmAutomation` router is contact-type-shaped (its builder
 * assumes a "Customer type set" trigger), so List automations live here and are
 * rendered on the List detail page — the home that matches the model: an
 * Automation is a hook on the List it fires for.
 *
 * Creation/editing is still seed-script-only (`scripts/seed-list-automations.ts`);
 * a List-trigger builder is a deliberate follow-up.
 */
export const listAutomationRouter = createTRPCRouter({
  /** The Automations that fire when a contact is added to this List. */
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string(), collectionId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(({ ctx, input }) =>
      ctx.db.workflowDefinition.findMany({
        where: {
          workspaceId: input.workspaceId,
          triggerType: LIST_MEMBER_ADDED_TRIGGER,
          config: { path: ["listId"], equals: input.collectionId },
        },
        include: {
          steps: {
            orderBy: { order: "asc" },
            select: { id: true, label: true, type: true, order: true },
          },
          _count: { select: { runs: true } },
        },
        orderBy: { name: "asc" },
      }),
    ),

  /** Recent runs of this List's Automations (newest first). */
  runs: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        collectionId: z.string(),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .use(requireWorkspaceMembership("view"))
    .query(({ ctx, input }) =>
      ctx.db.workflowPipelineRun.findMany({
        where: {
          definition: {
            workspaceId: input.workspaceId,
            triggerType: LIST_MEMBER_ADDED_TRIGGER,
            config: { path: ["listId"], equals: input.collectionId },
          },
        },
        include: {
          definition: { select: { name: true } },
          stepRuns: {
            orderBy: { startedAt: "asc" },
            select: { id: true, status: true },
          },
        },
        orderBy: { startedAt: "desc" },
        take: input.limit,
      }),
    ),
});
