import { z } from "zod";

import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter } from "~/server/api/trpc";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import { TimeEntryService } from "~/server/services/timeEntry/TimeEntryService";
import {
  canViewAction,
  getActionAccess,
  getProjectAccess,
  hasProjectAccess,
  getWorkspaceMembership,
} from "~/server/services/access";

/**
 * Who a written entry belongs to (ADR-0061). A human writes their own time,
 * `CONFIRMED` by default. An External agent (`tokenType === "agent-key"`)
 * writes time that belongs to its OWNER, records itself as author, and is
 * forced to `PROPOSED` whatever it asked for. This carve-out exists only for
 * the explicit-bounds procedures below; `start`/`stop` stay principal-owned.
 */
interface TimeEntryPrincipal {
  ownerUserId: string;
  createdByAgentId: string | null;
  isAgent: boolean;
}

async function resolveTimeEntryPrincipal(
  db: PrismaClient,
  callerUserId: string,
  tokenType: string | undefined,
): Promise<TimeEntryPrincipal> {
  if (tokenType !== "agent-key") {
    return { ownerUserId: callerUserId, createdByAgentId: null, isAgent: false };
  }
  const agent = await db.externalAgent.findUnique({
    where: { shadowUserId: callerUserId },
    select: { id: true, ownerId: true },
  });
  if (!agent) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Agent key is not bound to an external agent",
    });
  }
  return { ownerUserId: agent.ownerId, createdByAgentId: agent.id, isAgent: true };
}

/**
 * The OWNER must be able to view the Action — so an agent can only log time
 * on Actions its owner can see, never on ones only its shadow user reaches.
 */
async function assertOwnerCanViewAction(
  db: PrismaClient,
  ownerUserId: string,
  actionId: string,
): Promise<void> {
  const access = await getActionAccess(db, ownerUserId, actionId);
  if (!access || !canViewAction(access)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Action not found" });
  }
}

const explicitEntryInput = z
  .object({
    actionId: z.string(),
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date(),
    source: z.enum(["manual", "claude-desktop", "agent-run"]).default("manual"),
    status: z.enum(["PROPOSED", "CONFIRMED"]).optional(),
    sourceRef: z.string().min(1).max(500).optional(),
    note: z.string().max(1000).optional(),
  })
  .refine((v) => v.endedAt.getTime() > v.startedAt.getTime(), {
    message: "endedAt must be after startedAt",
    path: ["endedAt"],
  });

export const timeEntryRouter = createTRPCRouter({
  /**
   * Create a completed entry with explicit bounds. Never touches the running
   * Timer. Under an agent key the entry belongs to the agent's owner and is
   * `PROPOSED`; a human's entry defaults to `CONFIRMED`.
   */
  create: apiKeyMiddleware
    .input(explicitEntryInput)
    .mutation(async ({ ctx, input }) => {
      const principal = await resolveTimeEntryPrincipal(
        ctx.db,
        ctx.userId,
        ctx.tokenType,
      );
      await assertOwnerCanViewAction(ctx.db, principal.ownerUserId, input.actionId);

      const service = new TimeEntryService(ctx.db);
      return service.create({
        userId: principal.ownerUserId,
        actionId: input.actionId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        source: input.source,
        status: principal.isAgent ? "PROPOSED" : (input.status ?? "CONFIRMED"),
        sourceRef: input.sourceRef,
        note: input.note,
        createdByAgentId: principal.createdByAgentId,
      });
    }),

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
      // Access enforcement at the router layer (the service is access-agnostic
      // for testability). Two cases:
      //   1. Attaching to an existing action  → check viewAction on that id.
      //   2. Creating a new action            → check workspace + project
      //      access on caller-provided IDs so a guessed id can't be used to
      //      mint actions in a workspace/project the user can't reach.
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
      } else {
        if (input.workspaceId) {
          const membership = await getWorkspaceMembership(
            ctx.db,
            ctx.userId,
            input.workspaceId,
          );
          if (!membership) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Cannot track time in this workspace",
            });
          }
        }
        if (input.projectId) {
          const projectAccess = await getProjectAccess(
            ctx.db,
            ctx.userId,
            input.projectId,
          );
          if (!projectAccess || !hasProjectAccess(projectAccess)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Cannot track time on this project",
            });
          }
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
      z
        .object({
          startDate: z.date(),
          endDate: z.date(),
          workspaceId: z.string().nullish(),
        })
        .refine((v) => v.startDate < v.endDate, {
          message: "startDate must be before endDate",
          path: ["endDate"],
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
