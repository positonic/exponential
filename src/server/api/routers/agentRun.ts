import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getActionAccess, canViewAction } from "~/server/services/access";

/**
 * Agent runs as seen by humans (ADR-0067, Agent PRD D10). Everyone who can
 * view the action sees status, duration, tool count and the finish summary;
 * the event transcript is owner-only and is selected server-side, never
 * filtered on the client.
 */
export const agentRunRouter = createTRPCRouter({
  /** Runs on one action, newest first. */
  listForAction: protectedProcedure
    .input(z.object({ actionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const access = await getActionAccess(ctx.db, ctx.session.user.id, input.actionId);
      if (!access || !canViewAction(access)) {
        // Same NOT_FOUND-not-FORBIDDEN rule as action.getById: never confirm an id.
        throw new TRPCError({ code: "NOT_FOUND", message: "Action not found or access denied" });
      }
      const runs = await ctx.db.agentRun.findMany({
        where: { actionId: input.actionId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          executor: true,
          startedAt: true,
          finishedAt: true,
          lastEventAt: true,
          createdAt: true,
          toolCallCount: true,
          summary: true,
          readyToClose: true,
          error: true,
          requestedById: true,
          agent: {
            select: {
              id: true,
              name: true,
              ownerId: true,
              shadowUser: { select: { id: true, name: true, image: true } },
              assistant: { select: { emoji: true } },
            },
          },
        },
      });
      return runs.map((run) => ({
        ...run,
        isOwner: run.agent.ownerId === ctx.session.user.id,
      }));
    }),
});
