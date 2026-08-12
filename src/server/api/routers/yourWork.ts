import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";

/**
 * Per-user "Your work" aggregation backing the workspace-home panel
 * (feature: Personal home). Every procedure reads existing per-entity
 * fields — no schema changes; the weekly work digest gatherer
 * (`weeklyWorkDigest/gather.ts`) is the reference for the query shapes.
 */
export const yourWorkRouter = createTRPCRouter({
  /**
   * Open tickets assigned to the current user in this workspace. Same query
   * arm as the digest gatherer (Ticket.assigneeId is indexed).
   */
  assignedTickets: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      return ctx.db.ticket.findMany({
        where: {
          assigneeId: ctx.session.user.id,
          status: { notIn: ["DONE", "DEPLOYED", "ARCHIVED"] },
          product: { workspaceId: input.workspaceId },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          shortId: true,
          number: true,
          title: true,
          status: true,
          product: { select: { slug: true } },
        },
      });
    }),

  /**
   * Objectives, key results, and projects where the current user is the DRI.
   * These fields (Goal.driUserId, KeyResult.driUserId, Project.driId) are
   * written by the OKR/project editors but had no read path until this panel.
   */
  driItems: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [goals, keyResults, projects] = await Promise.all([
        ctx.db.goal.findMany({
          where: {
            driUserId: userId,
            workspaceId: input.workspaceId,
            status: { in: ["planned", "active"] },
          },
          orderBy: { id: "desc" },
          take: 6,
          select: { id: true, title: true, health: true },
        }),
        ctx.db.keyResult.findMany({
          where: {
            driUserId: userId,
            workspaceId: input.workspaceId,
            status: { not: "achieved" },
          },
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: {
            id: true,
            title: true,
            goalId: true,
            status: true,
            statusOverride: true,
          },
        }),
        ctx.db.project.findMany({
          where: {
            driId: userId,
            workspaceId: input.workspaceId,
            status: "ACTIVE",
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { id: true, name: true, slug: true, progress: true },
        }),
      ]);
      return { goals, keyResults, projects };
    }),
});
