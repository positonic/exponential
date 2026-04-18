import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { assertWorkspaceMember } from "./product";
import type { PrismaClient } from "@prisma/client";

/**
 * Cycles are thin wrappers around the existing `List` model with
 * `listType = SPRINT`. This router exposes only the fields the Product
 * plugin cares about (dates, goal, achievements, ticket count).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadCycleWithAccess(
  db: PrismaClient,
  userId: string,
  cycleId: string,
) {
  const cycle = await db.list.findUnique({
    where: { id: cycleId },
    select: { id: true, workspaceId: true, listType: true },
  });
  if (!cycle) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found" });
  }
  if (cycle.listType !== "SPRINT") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "List is not a cycle (listType must be SPRINT)",
    });
  }
  await assertWorkspaceMember(db, userId, cycle.workspaceId);
  return cycle;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// Auto-generation logic
// ---------------------------------------------------------------------------

interface CycleConfig {
  /** Whether auto-creation is enabled */
  enabled: boolean;
  /** Cadence in weeks (1, 2, 3, 4, 6) */
  cadenceWeeks: number;
  /** Day of week cycles start on (0=Sun, 1=Mon, ..., 6=Sat) */
  startDay: number;
  /** How many cycles ahead to pre-generate (default 2) */
  lookahead: number;
}

const DEFAULT_CONFIG: CycleConfig = {
  enabled: true,
  cadenceWeeks: 2,
  startDay: 1, // Monday
  lookahead: 2,
};

/**
 * Find the next occurrence of `dayOfWeek` on or after `from`.
 */
function nextDayOfWeek(from: Date, dayOfWeek: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const diff = (dayOfWeek - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 0 : diff));
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Determine the highest cycle number from existing cycle names.
 * Matches "Cycle N" pattern. Returns 0 if no matches.
 */
function maxCycleNumber(names: string[]): number {
  let max = 0;
  for (const name of names) {
    const match = /^Cycle\s+(\d+)$/i.exec(name);
    if (match) {
      const n = parseInt(match[1]!, 10);
      if (n > max) max = n;
    }
  }
  return max;
}

/**
 * Reconcile cycle statuses based on current date.
 *
 * - PLANNED cycles whose startDate <= now < endDate -> ACTIVE
 * - PLANNED or ACTIVE cycles whose endDate <= now -> COMPLETED
 *
 * Called lazily from the list query alongside ensureUpcomingCycles.
 */
async function reconcileCycleStatuses(
  db: PrismaClient,
  workspaceId: string,
): Promise<void> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Complete any cycles whose end date has passed
  await db.list.updateMany({
    where: {
      workspaceId,
      listType: "SPRINT",
      status: { in: ["PLANNED", "ACTIVE"] },
      endDate: { lte: now },
    },
    data: { status: "COMPLETED" },
  });

  // Activate any planned cycles whose start date has arrived but end date hasn't
  await db.list.updateMany({
    where: {
      workspaceId,
      listType: "SPRINT",
      status: "PLANNED",
      startDate: { lte: now },
      endDate: { gt: now },
    },
    data: { status: "ACTIVE" },
  });
}

/**
 * Lazily ensures enough upcoming cycles exist for a workspace.
 *
 * Called from the `list` query so cycles are generated on-demand
 * when the user views the Cycles tab or Backlog.
 *
 * Rules:
 * - Looks at the latest cycle (by endDate) to determine where
 *   the next one should start.
 * - New cycle start >= previous cycle end.
 * - If a user-created cycle already covers a window, skip it.
 * - Names are auto-assigned as "Cycle N" (incrementing).
 * - Generates up to `config.lookahead` cycles into the future
 *   from today.
 */
async function ensureUpcomingCycles(
  db: PrismaClient,
  workspaceId: string,
  userId: string,
  config: CycleConfig = DEFAULT_CONFIG,
): Promise<void> {
  if (!config.enabled) return;

  // Fetch all existing cycles ordered by end date
  const existing = await db.list.findMany({
    where: { workspaceId, listType: "SPRINT" },
    orderBy: { endDate: "asc" },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  });

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Calculate how far ahead we need coverage
  const horizonDays = config.cadenceWeeks * 7 * config.lookahead;
  const horizon = addDays(now, horizonDays);

  // Find the latest end date among all cycles
  let latestEnd: Date | null = null;
  for (const c of existing) {
    if (c.endDate && (!latestEnd || c.endDate > latestEnd)) {
      latestEnd = c.endDate;
    }
  }

  // Determine where the next cycle should start
  let nextStart: Date;
  if (latestEnd) {
    // After latest cycle end
    nextStart = new Date(latestEnd);
    // Align to start day
    nextStart = nextDayOfWeek(nextStart, config.startDay);
  } else {
    // No cycles exist - start from next occurrence of start day
    nextStart = nextDayOfWeek(now, config.startDay);
    // If that's today and it's already past, still use it
  }

  // Extract existing names for numbering
  const existingNames = existing.map((c) => c.name);
  let nextNumber = maxCycleNumber(existingNames) + 1;

  // Generate cycles until we have coverage up to horizon
  const toCreate: { name: string; slug: string; startDate: Date; endDate: Date }[] = [];

  let cursor = nextStart;
  while (cursor < horizon) {
    const cycleEnd = addDays(cursor, config.cadenceWeeks * 7);

    // Check if any existing cycle overlaps this window
    const overlaps = existing.some((c) => {
      if (!c.startDate || !c.endDate) return false;
      // Overlap: existing start < new end AND existing end > new start
      return c.startDate < cycleEnd && c.endDate > cursor;
    });

    if (!overlaps) {
      const name = `Cycle ${nextNumber}`;
      // Ensure name doesn't collide with a user-created cycle
      if (!existingNames.includes(name)) {
        toCreate.push({
          name,
          slug: slugify(name),
          startDate: new Date(cursor),
          endDate: new Date(cycleEnd),
        });
        existingNames.push(name);
      }
      nextNumber++;
    } else {
      // An existing cycle covers this window - just bump the number
      nextNumber++;
    }

    // Move cursor to after this cycle
    cursor = nextDayOfWeek(cycleEnd, config.startDay);
  }

  // Batch create
  for (const c of toCreate) {
    // Ensure slug uniqueness
    let slug = c.slug;
    let counter = 1;
    while (
      await db.list.findUnique({
        where: { workspaceId_slug: { workspaceId, slug } },
        select: { id: true },
      })
    ) {
      counter++;
      slug = `${c.slug}-${counter}`;
    }

    await db.list.create({
      data: {
        workspaceId,
        createdById: userId,
        name: c.name,
        slug,
        listType: "SPRINT",
        status: "PLANNED",
        startDate: c.startDate,
        endDate: c.endDate,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const cycleRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        status: z.enum(["PLANNED", "ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
        /** Pass false to skip auto-generation (e.g. when paused) */
        autoCreate: z.boolean().optional().default(true),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );

      // Reconcile statuses based on current date (always runs)
      await reconcileCycleStatuses(ctx.db, input.workspaceId);

      // Lazy-generate upcoming cycles if auto-create is on
      if (input.autoCreate) {
        await ensureUpcomingCycles(
          ctx.db,
          input.workspaceId,
          ctx.session.user.id,
          DEFAULT_CONFIG,
        );
      }

      return ctx.db.list.findMany({
        where: {
          workspaceId: input.workspaceId,
          listType: "SPRINT",
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        include: {
          _count: { select: { tickets: true, retrospectives: true } },
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const cycle = await ctx.db.list.findUnique({
        where: { id: input.id },
        include: {
          tickets: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              title: true,
              status: true,
              type: true,
              points: true,
              assignee: { select: { id: true, name: true, image: true } },
            },
          },
          retrospectives: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              conductedAt: true,
              createdAt: true,
            },
          },
          metrics: true,
        },
      });
      if (!cycle || cycle.listType !== "SPRINT") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found" });
      }
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        cycle.workspaceId,
      );
      return cycle;
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(120).optional(),
        slug: z.string().max(60).optional(),
        description: z.string().max(2000).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        cycleGoal: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );

      // Auto-name if not provided
      let name = input.name?.trim();
      if (!name) {
        const existing = await ctx.db.list.findMany({
          where: { workspaceId: input.workspaceId, listType: "SPRINT" },
          select: { name: true },
        });
        const nextNum = maxCycleNumber(existing.map((c) => c.name)) + 1;
        name = `Cycle ${nextNum}`;
      }

      const baseSlug = input.slug ?? slugify(name);
      let slug = baseSlug;
      let counter = 1;
      while (
        await ctx.db.list.findUnique({
          where: {
            workspaceId_slug: { workspaceId: input.workspaceId, slug },
          },
          select: { id: true },
        })
      ) {
        counter += 1;
        slug = `${baseSlug}-${counter}`;
      }

      // Validate: start date must be >= previous cycle end date
      if (input.startDate) {
        const overlapping = await ctx.db.list.findFirst({
          where: {
            workspaceId: input.workspaceId,
            listType: "SPRINT",
            endDate: { gt: input.startDate },
            startDate: { lt: input.endDate ?? input.startDate },
          },
          select: { id: true, name: true },
        });
        if (overlapping) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cycle dates overlap with "${overlapping.name}". Adjust the dates to avoid conflicts.`,
          });
        }
      }

      return ctx.db.list.create({
        data: {
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
          name,
          slug,
          description: input.description,
          listType: "SPRINT",
          status: "PLANNED",
          startDate: input.startDate,
          endDate: input.endDate,
          cycleGoal: input.cycleGoal,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).nullable().optional(),
        startDate: z.date().nullable().optional(),
        endDate: z.date().nullable().optional(),
        status: z
          .enum(["PLANNED", "ACTIVE", "COMPLETED", "ARCHIVED"])
          .optional(),
        cycleGoal: z.string().max(2000).nullable().optional(),
        achievements: z.string().max(5000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cycle = await loadCycleWithAccess(ctx.db, ctx.session.user.id, input.id);

      // If dates are changing, validate no overlap
      if (input.startDate !== undefined || input.endDate !== undefined) {
        const current = await ctx.db.list.findUnique({
          where: { id: input.id },
          select: { startDate: true, endDate: true, workspaceId: true },
        });
        const newStart = input.startDate === undefined ? current?.startDate : input.startDate;
        const newEnd = input.endDate === undefined ? current?.endDate : input.endDate;

        if (newStart && newEnd) {
          const overlapping = await ctx.db.list.findFirst({
            where: {
              workspaceId: cycle.workspaceId,
              listType: "SPRINT",
              id: { not: input.id },
              endDate: { gt: newStart },
              startDate: { lt: newEnd },
            },
            select: { id: true, name: true },
          });
          if (overlapping) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Updated dates overlap with "${overlapping.name}". Adjust the dates to avoid conflicts.`,
            });
          }
        }
      }

      const { id, ...data } = input;
      return ctx.db.list.update({
        where: { id },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadCycleWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.list.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
