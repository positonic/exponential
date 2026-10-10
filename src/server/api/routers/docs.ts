import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { checkRateLimit, clientIpFrom } from "~/server/utils/rateLimit";

/** A docs page path: `/docs` or `/docs/<segments>`, no query or fragment. */
const docsPath = z
  .string()
  .max(200)
  .regex(/^\/docs(\/[a-z0-9-]+)*$/, "Not a docs page path");

export const docsRouter = createTRPCRouter({
  /**
   * "Was this helpful?" on a docs page. Public: signed-out readers can answer,
   * and are recorded without a user. Rate-limited per IP, since it is an
   * unauthenticated write.
   */
  submitFeedback: publicProcedure
    .input(
      z.object({
        path: docsPath,
        helpful: z.boolean(),
        comment: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id ?? null;
      const limit = await checkRateLimit({
        name: "docs-feedback",
        key: userId ?? clientIpFrom(ctx.headers),
        limit: 20,
        windowSeconds: 60 * 60,
      });
      if (!limit.success) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too much feedback from here; try again later." });
      }

      const created = await ctx.db.docsFeedback.create({
        data: {
          path: input.path,
          helpful: input.helpful,
          comment: input.comment ? input.comment : null,
          userId,
        },
        select: { id: true },
      });
      return created;
    }),

  /** Attach a comment to feedback just given (same visitor, within the page view). */
  addFeedbackComment: publicProcedure
    .input(z.object({ id: z.string().min(1).max(40), comment: z.string().trim().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id ?? null;
      const limit = await checkRateLimit({
        name: "docs-feedback",
        key: userId ?? clientIpFrom(ctx.headers),
        limit: 20,
        windowSeconds: 60 * 60,
      });
      if (!limit.success) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too much feedback from here; try again later." });
      }
      // Only a row that has no comment yet, was written in the last hour, and by
      // the same user (or anonymously, for an anonymous caller) can be amended.
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const { count } = await ctx.db.docsFeedback.updateMany({
        where: { id: input.id, comment: null, userId, createdAt: { gte: since } },
        data: { comment: input.comment },
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "That feedback can no longer be changed." });
      return { ok: true };
    }),
});
