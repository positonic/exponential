import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { listBusyBlocksByUser } from "~/server/services/calendar/freeBusy";
import { loadAttendeeSettings } from "~/server/services/calendar/attendeeSettings";
import { computeAvailabilityGrid } from "~/server/services/calendar/slotEngine";
import {
  planClear,
  planMark,
  type BlockEditPlan,
  type EditableBlock,
  type TimeRange,
} from "~/lib/availability/blockEdits";

/**
 * A member's own Availability blocks: time they mark themselves unavailable
 * by hand. Every procedure reads and writes the caller's rows only — the
 * note is theirs alone. Other members see these blocks solely as busy time,
 * through the free/busy contract (`listBusyBlocksByUser`), never through
 * this router.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** The painter pages a week at a time; matches availabilityGrid's cap. */
const MAX_GRID_RANGE_DAYS = 10;
/** Longest single block: a year of leave. */
const MAX_BLOCK_DAYS = 366;
/** Painted weekday mornings for a year is ~250 blocks; this covers it. */
const UPCOMING_LIMIT = 500;

const rangeSchema = z
  .object({ startsAt: z.date(), endsAt: z.date() })
  .refine((r) => r.endsAt > r.startsAt, { message: "End must be after start" })
  .refine((r) => r.endsAt.getTime() - r.startsAt.getTime() <= MAX_BLOCK_DAYS * DAY_MS, {
    message: `A block can span at most ${MAX_BLOCK_DAYS} days`,
  });

const editInput = z.object({ ranges: z.array(rangeSchema).min(1).max(200) });

const blockSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  isAllDay: true,
  note: true,
} as const;

/**
 * Plan and apply one edit against the stored rows in a single transaction.
 * A per-user advisory lock serialises edits: under READ COMMITTED two quick
 * paints (or two devices) would otherwise both read the same rows and both
 * write their merged blocks, leaving duplicates. Different users never wait
 * on each other.
 */
async function applyEdit(
  db: PrismaClient,
  userId: string,
  ranges: TimeRange[],
  planner: (existing: EditableBlock[], ranges: TimeRange[]) => BlockEditPlan,
) {
  const from = new Date(Math.min(...ranges.map((r) => r.startsAt.getTime())));
  const to = new Date(Math.max(...ranges.map((r) => r.endsAt.getTime())));
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`availability:${userId}`}))`;
    // Touching blocks (lte/gte) are loaded too: a mark merges with them.
    const existing = await tx.availabilityBlock.findMany({
      where: { userId, startsAt: { lte: to }, endsAt: { gte: from } },
      select: blockSelect,
    });
    const plan = planner(existing, ranges);
    if (plan.deleteIds.length > 0) {
      await tx.availabilityBlock.deleteMany({ where: { userId, id: { in: plan.deleteIds } } });
    }
    if (plan.create.length > 0) {
      await tx.availabilityBlock.createMany({
        data: plan.create.map((block) => ({ ...block, userId })),
      });
    }
    return { deleted: plan.deleteIds.length, created: plan.create.length };
  });
}

export const availabilityRouter = createTRPCRouter({
  /**
   * The painter's week: cell statuses from the caller's work hours and
   * synced calendars ("outside" / "busy" / "free" — marked blocks excluded,
   * the client overlays those), plus the caller's own blocks in range.
   */
  myGrid: protectedProcedure
    .input(z.object({ rangeStart: z.date(), rangeEnd: z.date() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as PrismaClient;
      const userId = ctx.session.user.id;
      if (input.rangeEnd <= input.rangeStart) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Range end must be after start" });
      }
      if (input.rangeEnd.getTime() - input.rangeStart.getTime() > MAX_GRID_RANGE_DAYS * DAY_MS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Range must be at most ${MAX_GRID_RANGE_DAYS} days`,
        });
      }
      const range = { from: input.rangeStart, to: input.rangeEnd };

      const [busy, settings, blocks] = await Promise.all([
        listBusyBlocksByUser(db, [userId], range),
        loadAttendeeSettings(db, [userId], userId),
        db.availabilityBlock.findMany({
          where: { userId, startsAt: { lt: range.to }, endsAt: { gt: range.from } },
          select: blockSelect,
          orderBy: { startsAt: "asc" },
        }),
      ]);
      const calendarOnly = (busy.get(userId) ?? []).filter((b) => b.sourceType !== "manual");

      const grid = computeAvailabilityGrid({
        busyBlocksByUser: new Map([[userId, calendarOnly]]),
        attendeeSettings: settings.attendeeSettings,
        organizerTimezone: settings.organizerTimezone,
        range,
      });

      return {
        cellStartsAt: grid.cellStartsAt,
        cellMinutes: grid.cellMinutes,
        statuses: grid.attendees[0]?.statuses ?? [],
        blocks,
      };
    }),

  /**
   * The caller's blocks that haven't ended yet, soonest first, up to
   * UPCOMING_LIMIT. `hasMore` says the list was cut, so the page can say so
   * rather than letting later blocks silently vanish.
   */
  listUpcoming: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.availabilityBlock.findMany({
      where: { userId: ctx.session.user.id, endsAt: { gt: new Date() } },
      select: blockSelect,
      orderBy: { startsAt: "asc" },
      take: UPCOMING_LIMIT + 1,
    });
    return { blocks: rows.slice(0, UPCOMING_LIMIT), hasMore: rows.length > UPCOMING_LIMIT };
  }),

  /** Mark ranges unavailable, merging with plain blocks they touch. */
  mark: protectedProcedure.input(editInput).mutation(async ({ ctx, input }) => {
    return applyEdit(ctx.db as PrismaClient, ctx.session.user.id, input.ranges, planMark);
  }),

  /** Make ranges available again, cutting whatever blocks they overlap. */
  clear: protectedProcedure.input(editInput).mutation(async ({ ctx, input }) => {
    return applyEdit(ctx.db as PrismaClient, ctx.session.user.id, input.ranges, planClear);
  }),

  /** One labelled block — time off, an appointment. Never merged. */
  add: protectedProcedure
    .input(
      z.object({
        range: rangeSchema,
        isAllDay: z.boolean().default(false),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.availabilityBlock.create({
        data: {
          userId: ctx.session.user.id,
          startsAt: input.range.startsAt,
          endsAt: input.range.endsAt,
          isAllDay: input.isAllDay,
          note: input.note ? input.note : null,
        },
        select: blockSelect,
      });
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.availabilityBlock.deleteMany({
        where: { id: input.id, userId: ctx.session.user.id },
      });
      if (count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
      }
      return { id: input.id };
    }),
});
