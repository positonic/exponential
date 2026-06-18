import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { loadFeatureWithAccess } from "./feature";

const authorSelect = {
  id: true,
  name: true,
  image: true,
} as const;

/**
 * Comments on a PRD body (ADR-0024). Anchored comments carry a `threadId` that
 * matches a `comment` mark in `Feature.descriptionDoc`; doc-level comments leave
 * `threadId` null. Bodies are Markdown (ADR-0017). Every procedure reuses the
 * same `loadFeatureWithAccess` workspace-member gate that `feature.update` uses —
 * editing the body and commenting share one access path.
 *
 * This slice ships `list` + `create`; threaded `reply`, `resolve`, and
 * `unresolve` arrive in the polish slice.
 */
export const featureCommentRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ featureId: z.string() }))
    .query(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.featureId);

      return ctx.db.featureComment.findMany({
        where: { featureId: input.featureId },
        include: { createdBy: { select: authorSelect } },
        orderBy: { createdAt: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        featureId: z.string(),
        threadId: z.string().min(1).optional(),
        body: boundedText("Comment", TEXT_LIMITS.LARGE, { min: 1 }),
        quotedText: boundedText("Quoted text", TEXT_LIMITS.LARGE).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.featureId);

      return ctx.db.featureComment.create({
        data: {
          featureId: input.featureId,
          threadId: input.threadId,
          body: input.body,
          quotedText: input.quotedText,
          createdById: ctx.session.user.id,
        },
        include: { createdBy: { select: authorSelect } },
      });
    }),
});
