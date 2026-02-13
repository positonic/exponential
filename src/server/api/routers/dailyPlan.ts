import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { startOfDay } from "date-fns";
import { setTimeInUserTimezone } from "~/lib/dateUtils";
import { ScoringService } from "~/server/services/ScoringService";

export const dailyPlanRouter = createTRPCRouter({
  /**
   * Get or create a daily plan for a specific date (defaults to today)
   */
  getOrCreateToday: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
        date: z.date().optional(), // Optional date, defaults to today
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // Don't apply startOfDay() to input.date - client already sends midnight in their timezone
      const planDate = input.date ?? startOfDay(new Date());

      console.log("[dailyPlan.getOrCreateToday] Input date:", input.date?.toISOString(), "→ planDate:", planDate.toISOString());

      // Try to find existing plan
      let plan = await ctx.db.dailyPlan.findFirst({
        where: {
          userId,
          date: planDate,
          workspaceId: input.workspaceId ?? null,
        },
        include: {
          plannedActions: {
            orderBy: { sortOrder: "asc" },
            include: {
              action: {
                include: {
                  project: true,
                },
              },
            },
          },
        },
      });

      // Create new plan if doesn't exist
      if (!plan) {
        plan = await ctx.db.dailyPlan.create({
          data: {
            userId,
            date: planDate,
            workspaceId: input.workspaceId,
            status: "DRAFT",
          },
          include: {
            plannedActions: {
              orderBy: { sortOrder: "asc" },
              include: {
                action: {
                  include: {
                    project: true,
                  },
                },
              },
            },
          },
        });
      }

      return plan;
    }),

  /**
   * Get a daily plan by date
   */
  getByDate: protectedProcedure
    .input(
      z.object({
        date: z.date(),
        workspaceId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // Don't apply startOfDay() to input.date - client already sends midnight in their timezone
      const planDate = input.date;

      console.log("[dailyPlan.getByDate] Input date:", input.date.toISOString(), "→ planDate:", planDate.toISOString());

      return ctx.db.dailyPlan.findFirst({
        where: {
          userId,
          date: planDate,
          workspaceId: input.workspaceId ?? null,
        },
        include: {
          plannedActions: {
            orderBy: { sortOrder: "asc" },
            include: {
              action: {
                include: {
                  project: true,
                },
              },
            },
          },
        },
      });
    }),

  /**
   * Update plan settings (shutdown time, obstacles, status)
   */
  updatePlan: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        shutdownTime: z.string().optional(),
        obstacles: z.string().optional(),
        status: z.enum(["DRAFT", "COMPLETED"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { id, ...data } = input;

      // Verify ownership
      const plan = await ctx.db.dailyPlan.findFirst({
        where: { id, userId },
      });

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Daily plan not found",
        });
      }

      const updatedPlan = await ctx.db.dailyPlan.update({
        where: { id },
        data,
        include: {
          plannedActions: {
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      // Recalculate score if status or processedOverdue changed
      if (input.status !== undefined || input.obstacles !== undefined) {
        await ScoringService.calculateDailyScore(
          ctx,
          plan.date,
          plan.workspaceId ?? undefined
        ).catch((err) => {
          console.error("[dailyPlan.updatePlan] Failed to recalculate score:", err);
        });
      }

      return updatedPlan;
    }),

  /**
   * Mark that the user has processed their overdue tasks for today.
   * Awards 5-point "Inbox Processing Bonus" via score recalculation.
   */
  markProcessedOverdue: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
        date: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const planDate = input.date ?? startOfDay(new Date());

      const plan = await ctx.db.dailyPlan.findFirst({
        where: {
          userId,
          date: planDate,
          workspaceId: input.workspaceId ?? null,
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No daily plan found for this date",
        });
      }

      const updatedPlan = await ctx.db.dailyPlan.update({
        where: { id: plan.id },
        data: { processedOverdue: true },
      });

      await ScoringService.calculateDailyScore(
        ctx,
        planDate,
        input.workspaceId
      ).catch((err) => {
        console.error("[dailyPlan.markProcessedOverdue] Failed to recalculate score:", err);
      });

      return updatedPlan;
    }),

  /**
   * Add a task to the daily plan
   */
  addTask: protectedProcedure
    .input(
      z.object({
        dailyPlanId: z.string(),
        name: z.string().min(1),
        duration: z.number().default(30),
        source: z.string().default("manual"),
        sourceId: z.string().optional(),
        actionId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify ownership
      const plan = await ctx.db.dailyPlan.findFirst({
        where: { id: input.dailyPlanId, userId },
        include: { plannedActions: true },
      });

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Daily plan not found",
        });
      }

      // Get the next sort order
      const maxOrder = plan.plannedActions.reduce(
        (max: number, action: { sortOrder: number }) => Math.max(max, action.sortOrder),
        -1
      );

      return ctx.db.dailyPlanAction.create({
        data: {
          dailyPlanId: input.dailyPlanId,
          name: input.name,
          duration: input.duration,
          source: input.source,
          sourceId: input.sourceId,
          actionId: input.actionId,
          sortOrder: maxOrder + 1,
        },
        include: {
          action: {
            include: {
              project: true,
            },
          },
        },
      });
    }),

  /**
   * Update a task in the daily plan
   */
  updateTask: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        duration: z.number().optional(),
        scheduledStart: z.date().optional().nullable(),
        scheduledEnd: z.date().optional().nullable(),
        completed: z.boolean().optional(),
        schedulingMethod: z.enum(["manual", "auto-suggested"]).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { id, ...data } = input;

      // Verify ownership through the daily plan
      const task = await ctx.db.dailyPlanAction.findFirst({
        where: { id },
        include: { dailyPlan: true },
      });

      if (!task || task.dailyPlan.userId !== userId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found",
        });
      }

      const actionUpdates: {
        scheduledStart?: Date | null;
        scheduledEnd?: Date | null;
        duration?: number | null;
        isAutoScheduled?: boolean;
      } = {};

      if (input.scheduledStart !== undefined) {
        actionUpdates.scheduledStart = input.scheduledStart;
      }

      if (input.scheduledEnd !== undefined) {
        actionUpdates.scheduledEnd = input.scheduledEnd;
      }

      if (input.duration !== undefined) {
        actionUpdates.duration = input.duration;
      }

      if (input.schedulingMethod) {
        actionUpdates.isAutoScheduled = input.schedulingMethod === "auto-suggested";
      }

      const dailyPlanUpdate = ctx.db.dailyPlanAction.update({
        where: { id },
        data,
        include: {
          action: {
            include: {
              project: true,
            },
          },
        },
      });

      let result;
      if (task.actionId && Object.keys(actionUpdates).length > 0) {
        const [, updatedTask] = await ctx.db.$transaction([
          ctx.db.action.update({
            where: { id: task.actionId },
            data: actionUpdates,
          }),
          dailyPlanUpdate,
        ]);

        result = updatedTask;
      } else {
        result = await dailyPlanUpdate;
      }

      // Recalculate score if completion status changed
      if (input.completed !== undefined) {
        await ScoringService.calculateDailyScore(
          ctx,
          task.dailyPlan.date,
          task.dailyPlan.workspaceId ?? undefined
        ).catch((err) => {
          console.error("[dailyPlan.updateTask] Failed to recalculate score:", err);
        });
      }

      return result;
    }),

  /**
   * Remove a task from the daily plan
   */
  removeTask: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify ownership through the daily plan
      const task = await ctx.db.dailyPlanAction.findFirst({
        where: { id: input.id },
        include: { dailyPlan: true },
      });

      if (!task || task.dailyPlan.userId !== userId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found",
        });
      }

      return ctx.db.dailyPlanAction.delete({
        where: { id: input.id },
      });
    }),

  /**
   * Reorder tasks in the daily plan
   */
  reorderTasks: protectedProcedure
    .input(
      z.object({
        dailyPlanId: z.string(),
        taskIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify ownership
      const plan = await ctx.db.dailyPlan.findFirst({
        where: { id: input.dailyPlanId, userId },
      });

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Daily plan not found",
        });
      }

      // Update sort order for each task
      const updates = input.taskIds.map((id, index) =>
        ctx.db.dailyPlanAction.updateMany({
          where: { id, dailyPlanId: input.dailyPlanId },
          data: { sortOrder: index },
        })
      );

      await ctx.db.$transaction(updates);

      return ctx.db.dailyPlan.findFirst({
        where: { id: input.dailyPlanId },
        include: {
          plannedActions: {
            orderBy: { sortOrder: "asc" },
            include: {
              action: {
                include: {
                  project: true,
                },
              },
            },
          },
        },
      });
    }),

  /**
   * Defer a task to a different date
   * Updates the linked Action's scheduledStart if it exists,
   * or stores the scheduledStart on the DailyPlanAction for later conversion
   */
  deferTask: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        newDate: z.date(),
        timezoneOffset: z.number().optional(), // Minutes from UTC (from getTimezoneOffset())
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify ownership through the daily plan
      const task = await ctx.db.dailyPlanAction.findFirst({
        where: { id: input.taskId },
        include: { dailyPlan: true, action: true },
      });

      if (!task || task.dailyPlan.userId !== userId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found",
        });
      }

      // Set the scheduledStart to 9am on the new date (in user's timezone if offset provided)
      const scheduledStart = input.timezoneOffset !== undefined
        ? setTimeInUserTimezone(input.newDate, 9, 0, input.timezoneOffset)
        : (() => {
            const d = new Date(input.newDate);
            d.setHours(9, 0, 0, 0);
            return d;
          })();

      console.log("[dailyPlan.deferTask] newDate:", input.newDate.toISOString(), "→ scheduledStart:", scheduledStart.toISOString());

      // If there's a linked Action, update its scheduledStart
      if (task.actionId && task.action) {
        await ctx.db.action.update({
          where: { id: task.actionId },
          data: { scheduledStart },
        });
      }

      // Also update the DailyPlanAction's scheduledStart for consistency
      return ctx.db.dailyPlanAction.update({
        where: { id: input.taskId },
        data: { scheduledStart },
        include: {
          action: {
            include: {
              project: true,
            },
          },
        },
      });
    }),

  /**
   * Complete the daily plan and optionally convert tasks to real Actions
   */
  completePlan: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify ownership
      const plan = await ctx.db.dailyPlan.findFirst({
        where: { id: input.id, userId },
        include: { plannedActions: true },
      });

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Daily plan not found",
        });
      }

      // Create real Actions for any planned tasks that don't have an actionId
      const tasksToConvert = plan.plannedActions.filter(
        (task: { actionId: string | null }) => !task.actionId
      );

      for (const task of tasksToConvert) {
        const action = await ctx.db.action.create({
          data: {
            name: task.name,
            createdById: userId,
            dueDate: plan.date,
            scheduledStart: task.scheduledStart,
            scheduledEnd: task.scheduledEnd,
            duration: task.duration,
            source: "daily-plan",
            workspaceId: plan.workspaceId,
          },
        });

        // Link the action to the planned task
        await ctx.db.dailyPlanAction.update({
          where: { id: task.id },
          data: { actionId: action.id },
        });
      }

      // Mark plan as completed
      const updatedPlan = await ctx.db.dailyPlan.update({
        where: { id: input.id },
        data: { status: "COMPLETED" },
        include: {
          plannedActions: {
            orderBy: { sortOrder: "asc" },
            include: {
              action: {
                include: {
                  project: true,
                },
              },
            },
          },
        },
      });

      // Recalculate score to award "plan completed" points
      await ScoringService.calculateDailyScore(
        ctx,
        plan.date,
        plan.workspaceId ?? undefined
      ).catch((err) => {
        console.error("[dailyPlan.completePlan] Failed to recalculate score:", err);
      });

      return updatedPlan;
    }),

  /**
   * Get total planned time for a daily plan
   */
  getTotalPlannedTime: protectedProcedure
    .input(z.object({ dailyPlanId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const plan = await ctx.db.dailyPlan.findFirst({
        where: { id: input.dailyPlanId, userId },
        include: { plannedActions: true },
      });

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Daily plan not found",
        });
      }

      const totalMinutes = plan.plannedActions.reduce(
        (sum: number, task: { duration: number }) => sum + task.duration,
        0
      );

      return { totalMinutes };
    }),

  /**
   * Get user's work hours settings for the timeline
   */
  getUserWorkHours: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      select: {
        workHoursEnabled: true,
        workHoursStart: true,
        workHoursEnd: true,
      },
    });

    return {
      workHoursEnabled: user?.workHoursEnabled ?? true,
      workHoursStart: user?.workHoursStart ?? "09:00",
      workHoursEnd: user?.workHoursEnd ?? "17:00",
    };
  }),
});
