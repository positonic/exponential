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
      // The transcript is owner-only, selected server-side: a non-owner's
      // response never carries events, so there is nothing to filter on the client.
      const ownedRunIds = runs.filter((r) => r.agent.ownerId === ctx.session.user.id).map((r) => r.id);
      const events = ownedRunIds.length
        ? await ctx.db.agentRunEvent.findMany({
            where: { runId: { in: ownedRunIds } },
            orderBy: { seq: "asc" },
            select: { id: true, runId: true, seq: true, kind: true, payload: true, createdAt: true },
          })
        : [];
      return runs.map((run) => {
        const isOwner = run.agent.ownerId === ctx.session.user.id;
        return {
          ...run,
          isOwner,
          events: isOwner ? events.filter((e) => e.runId === run.id) : undefined,
        };
      });
    }),

  /** One run's events after `afterSeq` — owner only — for an incremental transcript poll. */
  get: protectedProcedure
    .input(z.object({ runId: z.string(), afterSeq: z.number().int().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.agentRun.findFirst({
        where: { id: input.runId, agent: { ownerId: ctx.session.user.id } },
        select: { id: true, status: true, toolCallCount: true, summary: true, finishedAt: true },
      });
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      }
      const events = await ctx.db.agentRunEvent.findMany({
        where: { runId: run.id, seq: { gt: input.afterSeq } },
        orderBy: { seq: "asc" },
        select: { id: true, seq: true, kind: true, payload: true, createdAt: true },
      });
      return { ...run, events };
    }),
});
