import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  countWaitingOnMe,
  listWaitingOnMe,
} from "~/server/services/inbox/waitingOnMe";
import { countDelegated, listDelegated } from "~/server/services/inbox/delegated";

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

  /**
   * The Delegated tab (ADR-0067): actions handed to an Assistant with their
   * latest run — live, waiting on the owner, finished-unreviewed, and the
   * last week's reviewed. Scoped to runs the viewer requested or their own
   * Assistant performed (`services/inbox/delegated`).
   */
  delegated: protectedProcedure.query(({ ctx }) =>
    listDelegated(ctx.db, ctx.session.user.id, new Date()),
  ),

  /** Counts only; `attention` (waiting + unreviewed, never live) feeds the badge. */
  delegatedCounts: protectedProcedure.query(({ ctx }) =>
    countDelegated(ctx.db, ctx.session.user.id),
  ),
});
