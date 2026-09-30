import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  countWaitingOnMe,
  listWaitingOnMe,
} from "~/server/services/inbox/waitingOnMe";

/**
 * The `/inbox` page's "Waiting on me" tab (see `services/inbox/waitingOnMe`).
 * Personal and cross-workspace, like the rest of the inbox: every read is
 * scoped to the caller, and each kind applies its own access rule.
 *
 * `startOfToday` is the viewer's local midnight so "overdue" uses their day
 * boundary, not the server's.
 */
const todayInput = z.object({ startOfToday: z.date() });

export const inboxRouter = createTRPCRouter({
  /** Rows (capped per kind) and full counts for the tab. */
  waitingOnMe: protectedProcedure
    .input(todayInput)
    .query(({ ctx, input }) =>
      listWaitingOnMe(ctx.db, ctx.session.user.id, input.startOfToday),
    ),

  /** Counts only — for the sidebar badge, which renders on every page. */
  waitingOnMeCounts: protectedProcedure
    .input(todayInput)
    .query(({ ctx, input }) =>
      countWaitingOnMe(ctx.db, ctx.session.user.id, input.startOfToday),
    ),
});
