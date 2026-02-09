import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  getMyHabits,
  getHabitsByGoal,
  createHabit,
  updateHabit,
  deleteHabit,
  toggleCompletion,
  getCompletions,
  getHabitStreak,
  getTodayStatus,
} from "~/server/services/habitService";
import { ScoringService } from "~/server/services/ScoringService";
import { startOfDay } from "date-fns";

export const habitRouter = createTRPCRouter({
  // Get all user's habits
  getMyHabits: protectedProcedure.query(getMyHabits),

  // Get habits linked to a specific goal
  getHabitsByGoal: protectedProcedure
    .input(z.object({ goalId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getHabitsByGoal({ ctx, goalId: input.goalId });
    }),

  // Create a new habit
  createHabit: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        frequency: z.enum([
          "daily",
          "3x_week",
          "weekly",
          "bi_weekly",
          "monthly",
          "custom",
        ]),
        daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
        timeOfDay: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        goalId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return createHabit({ ctx, input });
    }),

  // Update a habit
  updateHabit: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        frequency: z
          .enum([
            "daily",
            "3x_week",
            "weekly",
            "bi_weekly",
            "monthly",
            "custom",
          ])
          .optional(),
        daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
        timeOfDay: z.string().optional(),
        endDate: z.date().optional().nullable(),
        isActive: z.boolean().optional(),
        goalId: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return updateHabit({ ctx, input });
    }),

  // Delete a habit
  deleteHabit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return deleteHabit({ ctx, input });
    }),

  // Toggle completion for a specific date
  toggleCompletion: protectedProcedure
    .input(
      z.object({
        habitId: z.string(),
        date: z.date(),
        notes: z.string().optional(),
        duration: z.number().optional(),
        rating: z.number().min(1).max(5).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await toggleCompletion({ ctx, input });

      // Recalculate score for the day when habit is toggled
      await ScoringService.calculateDailyScore(
        ctx,
        startOfDay(input.date),
        undefined // Habits don't have workspace context
      ).catch((err) => {
        console.error("[habit.toggleCompletion] Failed to recalculate score:", err);
      });

      return result;
    }),

  // Get completions for date range
  getCompletions: protectedProcedure
    .input(
      z.object({
        habitId: z.string().optional(),
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getCompletions({ ctx, input });
    }),

  // Get streak data for a habit
  getStreak: protectedProcedure
    .input(z.object({ habitId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getHabitStreak({ ctx, habitId: input.habitId });
    }),

  // Get today's habits with completion status
  getTodayStatus: protectedProcedure.query(getTodayStatus),
});
