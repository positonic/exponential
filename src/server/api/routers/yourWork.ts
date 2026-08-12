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
});
