import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const taskScheduleRouter = createTRPCRouter({
  // List all schedules for a workspace
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const schedules = await ctx.db.taskSchedule.findMany({
        where: {
          workspaceId: input.workspaceId,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { actions: true, recurringTasks: true },
          },
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      });

      return schedules;
    }),

  // Get a single schedule by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const schedule = await ctx.db.taskSchedule.findUnique({
        where: { id: input.id },
        include: {
          workspace: { select: { id: true, name: true, slug: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { actions: true, recurringTasks: true } },
        },
      });

      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        });
      }

      return schedule;
    }),

  // Create a new schedule
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be in HH:MM format"),
        endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be in HH:MM format"),
        daysOfWeek: z
          .array(z.number().min(0).max(6))
          .min(1, "Must select at least one day"),
        workspaceId: z.string(),
        isDefault: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Validate time range
      const [startHour, startMin] = input.startTime.split(":").map(Number);
      const [endHour, endMin] = input.endTime.split(":").map(Number);
      const startMins = (startHour ?? 0) * 60 + (startMin ?? 0);
      const endMins = (endHour ?? 0) * 60 + (endMin ?? 0);

      if (startMins >= endMins) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End time must be after start time",
        });
      }

      // If setting as default, unset other defaults
      if (input.isDefault) {
        await ctx.db.taskSchedule.updateMany({
          where: {
            workspaceId: input.workspaceId,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      const schedule = await ctx.db.taskSchedule.create({
        data: {
          name: input.name,
          startTime: input.startTime,
          endTime: input.endTime,
          daysOfWeek: input.daysOfWeek,
          workspaceId: input.workspaceId,
          createdById: userId,
          isDefault: input.isDefault,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      return schedule;
    }),

  // Update a schedule
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        startTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/, "Must be in HH:MM format")
          .optional(),
        endTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/, "Must be in HH:MM format")
          .optional(),
        daysOfWeek: z
          .array(z.number().min(0).max(6))
          .min(1, "Must select at least one day")
          .optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.db.taskSchedule.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        });
      }

      // Validate time range if both provided
      const startTime = updateData.startTime ?? existing.startTime;
      const endTime = updateData.endTime ?? existing.endTime;
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const startMins = (startHour ?? 0) * 60 + (startMin ?? 0);
      const endMins = (endHour ?? 0) * 60 + (endMin ?? 0);

      if (startMins >= endMins) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End time must be after start time",
        });
      }

      // If setting as default, unset other defaults
      if (updateData.isDefault) {
        await ctx.db.taskSchedule.updateMany({
          where: {
            workspaceId: existing.workspaceId,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }

      const schedule = await ctx.db.taskSchedule.update({
        where: { id },
        data: updateData,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { actions: true, recurringTasks: true } },
        },
      });

      return schedule;
    }),

  // Delete a schedule
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.db.taskSchedule.findUnique({
        where: { id: input.id },
        include: {
          _count: { select: { actions: true, recurringTasks: true } },
        },
      });

      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        });
      }

      // Check if schedule is in use
      const totalUsage =
        schedule._count.actions + schedule._count.recurringTasks;
      if (totalUsage > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete schedule - it is used by ${totalUsage} task(s)`,
        });
      }

      await ctx.db.taskSchedule.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Set a schedule as default for workspace
  setDefault: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        workspaceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Unset other defaults
      await ctx.db.taskSchedule.updateMany({
        where: {
          workspaceId: input.workspaceId,
          isDefault: true,
        },
        data: { isDefault: false },
      });

      // Set new default
      const schedule = await ctx.db.taskSchedule.update({
        where: { id: input.id },
        data: { isDefault: true },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      return schedule;
    }),

  // Get the default schedule for a workspace
  getDefault: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const schedule = await ctx.db.taskSchedule.findFirst({
        where: {
          workspaceId: input.workspaceId,
          isDefault: true,
        },
      });

      return schedule;
    }),
});
