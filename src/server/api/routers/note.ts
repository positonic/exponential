import { z } from "zod";
import { endOfISOWeek, startOfISOWeek } from "date-fns";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { createNote, getNotesByDay, getNotesByDate } from "~/server/services/noteService";
import { findOrCreateWeek } from "~/server/services/dayService";

const WEEKLY_REFLECTION_TYPE = "weekly_reflection";

export const noteRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({
      content: z.string(),
      type: z.string(),
      title: z.string().optional(),
      dayId: z.number(),
    }))
    .mutation(createNote),

  getByDay: protectedProcedure
    .input(z.object({
      dayId: z.number(),
      type: z.string().optional(),
    }))
    .query(getNotesByDay),

  getByDate: protectedProcedure
    .input(z.object({
      date: z.date(),
      type: z.string().optional(),
    }))
    .query(getNotesByDate),

  // Find the weekly reflection note for the ISO week containing `weekStart`.
  // Returns the most recent note of type "weekly_reflection" the user has
  // attached to any day inside that week, or null.
  getWeeklyReflection: protectedProcedure
    .input(z.object({ weekStart: z.date() }))
    .query(async ({ ctx, input }) => {
      const start = startOfISOWeek(input.weekStart);
      const end = endOfISOWeek(input.weekStart);
      return ctx.db.note.findFirst({
        where: {
          userId: ctx.session.user.id,
          type: WEEKLY_REFLECTION_TYPE,
          day: { date: { gte: start, lte: end } },
        },
        orderBy: { updatedAt: "desc" },
        include: { day: { select: { id: true, date: true } } },
      });
    }),

  // Create-or-update the weekly reflection note for the ISO week of
  // `weekStart`. Attaches the note to (or creates) the Monday-day of that
  // week so per-week lookups stay deterministic.
  upsertWeeklyReflection: protectedProcedure
    .input(
      z.object({
        weekStart: z.date(),
        content: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const monday = startOfISOWeek(input.weekStart);
      const week = await findOrCreateWeek({ ctx, date: monday });

      // Reuse a Day for the Monday if one exists; otherwise create it.
      const existingDay = await ctx.db.day.findFirst({
        where: { date: monday, weekId: week.id },
      });
      const day =
        existingDay ??
        (await ctx.db.day.create({
          data: { date: monday, weekId: week.id },
        }));

      const existingNote = await ctx.db.note.findFirst({
        where: {
          userId: ctx.session.user.id,
          type: WEEKLY_REFLECTION_TYPE,
          dayId: day.id,
        },
      });

      if (existingNote) {
        return ctx.db.note.update({
          where: { id: existingNote.id },
          data: { content: input.content },
        });
      }

      return ctx.db.note.create({
        data: {
          content: input.content,
          type: WEEKLY_REFLECTION_TYPE,
          dayId: day.id,
          userId: ctx.session.user.id,
        },
      });
    }),

  // Most recent weekly reflection notes for the current user. Used by the
  // Coaching home to show the past few weeks collapsed under the active one.
  listRecentWeeklyReflections: protectedProcedure
    .input(z.object({ count: z.number().int().min(1).max(20).default(4) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.note.findMany({
        where: {
          userId: ctx.session.user.id,
          type: WEEKLY_REFLECTION_TYPE,
        },
        orderBy: { day: { date: "desc" } },
        take: input.count,
        include: { day: { select: { id: true, date: true } } },
      });
    }),
});
