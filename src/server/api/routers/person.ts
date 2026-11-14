import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  FEED_PAGE_SIZE,
  getAggregatedActivityFeed,
} from "~/server/services/activity/feed";
import {
  getPersonSummary,
  resolvePersonScope,
} from "~/server/services/person/personPage";

/**
 * Person page (`/people/<userId>`): one page per person, human or agent,
 * showing what they did across the workspaces the viewer belongs to. Read-only.
 * The visibility and not-found rules live in `services/person/personPage.ts`.
 */
export const personRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      getPersonSummary(ctx.db, ctx.session.user.id, input.userId),
    ),

  /**
   * The subject's activity events from every workspace the viewer belongs to.
   * This is the Aggregated activity feed with the actor fixed to the subject:
   * it deliberately does not filter by the subject's current membership, so a
   * departed teammate's history stays visible to those still in the workspace.
   */
  getFeed: protectedProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
        source: z.string().optional(),
        /** Narrow to one workspace (the header's workspace chips). */
        workspaceId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolvePersonScope(
        ctx.db,
        ctx.session.user.id,
        input.userId,
      );

      const visibleIds = scope.visibleWorkspaces.map(
        (workspace) => workspace.id,
      );
      // A workspace the viewer is not in yields an empty page, never an error:
      // an error would confirm the workspace exists.
      const workspaceIds =
        input.workspaceId === undefined
          ? visibleIds
          : visibleIds.filter((id) => id === input.workspaceId);

      return getAggregatedActivityFeed(ctx.db, {
        workspaceIds,
        // Page rows are shown only if the viewer (never the subject) can open
        // the page — the same read-time check as every other feed.
        viewerId: ctx.session.user.id,
        cursor: input.cursor,
        limit: input.limit ?? FEED_PAGE_SIZE,
        source: input.source,
        actorUserId: input.userId,
      });
    }),
});
