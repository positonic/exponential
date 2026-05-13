import { z } from "zod";

import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "~/server/api/trpc";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import { TimeEntryService } from "~/server/services/timeEntry/TimeEntryService";
import {
  canViewAction,
  getActionAccess,
} from "~/server/services/access";

export const timeEntryRouter = createTRPCRouter({
  start: apiKeyMiddleware
    .input(
      z.object({
        actionId: z.string().optional(),
        typedTitle: z.string().optional(),
        projectId: z.string().nullish(),
        workspaceId: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // When attaching to an existing action, enforce access at the router
      // layer (the service is access-agnostic for testability).
      if (input.actionId) {
        const access = await getActionAccess(
          ctx.db,
          ctx.userId,
          input.actionId,
        );
        if (!access) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Action not found",
          });
        }
        if (!canViewAction(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot track time on an action you can't access",
          });
        }
      }

      const service = new TimeEntryService(ctx.db);
      return service.start({
        userId: ctx.userId,
        actionId: input.actionId,
        typedTitle: input.typedTitle,
        projectId: input.projectId ?? null,
        workspaceId: input.workspaceId ?? null,
      });
    }),

  stop: apiKeyMiddleware
    .input(
      z
        .object({
          entryId: z.string().optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const service = new TimeEntryService(ctx.db);
      return service.stop({
        userId: ctx.userId,
        entryId: input?.entryId,
      });
    }),

  update: apiKeyMiddleware
    .input(
      z
        .object({
          entryId: z.string(),
          startedAt: z.date().optional(),
          endedAt: z.date().nullable().optional(),
          actionId: z.string().optional(),
        })
        .refine(
          (v) =>
            v.startedAt !== undefined ||
            v.endedAt !== undefined ||
            v.actionId !== undefined,
          { message: "At least one field must be provided" },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      // If reassigning, enforce access on the target action.
      if (input.actionId) {
        const access = await getActionAccess(
          ctx.db,
          ctx.userId,
          input.actionId,
        );
        if (!access) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Target action not found",
          });
        }
        if (!canViewAction(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot reassign time entry to an inaccessible action",
          });
        }
      }
      const service = new TimeEntryService(ctx.db);
      return service.update({
        userId: ctx.userId,
        entryId: input.entryId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        actionId: input.actionId,
      });
    }),

  delete: apiKeyMiddleware
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const service = new TimeEntryService(ctx.db);
      return service.delete({ userId: ctx.userId, entryId: input.entryId });
    }),

  getActive: apiKeyMiddleware.query(async ({ ctx }) => {
    const service = new TimeEntryService(ctx.db);
    return service.getActive({ userId: ctx.userId });
  }),

  listByDateRange: apiKeyMiddleware
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        workspaceId: z.string().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const service = new TimeEntryService(ctx.db);
      return service.listByDateRange({
        userId: ctx.userId,
        startDate: input.startDate,
        endDate: input.endDate,
        workspaceId: input.workspaceId ?? null,
      });
    }),

  listRecent: apiKeyMiddleware
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const service = new TimeEntryService(ctx.db);
      return service.listRecent({
        userId: ctx.userId,
        limit: input?.limit,
      });
    }),
});
