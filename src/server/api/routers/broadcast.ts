import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { type PrismaClient } from "@prisma/client";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { SCHEDULED_TRIGGER } from "~/server/services/workflows/TriggerRegistry";
import {
  createBroadcast,
  runBroadcastTestSend,
  updateBroadcast,
} from "~/server/services/crm/broadcast/broadcastService";

const cadenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily"), hour: z.number().int().min(0).max(23) }),
  z.object({
    kind: z.literal("weekly"),
    hour: z.number().int().min(0).max(23),
    weekday: z.number().int().min(0).max(6),
  }),
]);

async function assertInWorkspace(
  db: PrismaClient,
  id: string,
  workspaceId: string,
) {
  const def = await db.workflowDefinition.findUnique({
    where: { id },
    select: { workspaceId: true, triggerType: true, config: true },
  });
  if (!def || def.workspaceId !== workspaceId || def.triggerType !== SCHEDULED_TRIGGER) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Broadcast not found" });
  }
  return def;
}

/**
 * Guard against cross-workspace targeting: the chosen List must live in the same
 * workspace as the Broadcast. Without this, an edit-member of one workspace could
 * wire a Broadcast at another workspace's List and email its contacts.
 */
async function assertCollectionInWorkspace(
  db: PrismaClient,
  collectionId: string,
  workspaceId: string,
) {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { workspaceId: true },
  });
  if (!collection || collection.workspaceId !== workspaceId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
  }
}

/**
 * `broadcast` router — scheduled Automations that send to a List (CONTEXT.md →
 * Broadcast). Broadcasts are `WorkflowDefinition`s with triggerType=scheduled.
 */
export const broadcastRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(({ ctx, input }) =>
      ctx.db.workflowDefinition.findMany({
        where: {
          workspaceId: input.workspaceId,
          triggerType: SCHEDULED_TRIGGER,
        },
        orderBy: { createdAt: "desc" },
      }),
    ),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(255),
        collectionId: z.string(),
        cadence: cadenceSchema,
        subject: z.string().max(255).optional(),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      await assertCollectionInWorkspace(
        ctx.db,
        input.collectionId,
        input.workspaceId,
      );
      return createBroadcast(ctx.db, {
        workspaceId: input.workspaceId,
        name: input.name,
        collectionId: input.collectionId,
        cadence: input.cadence,
        subject: input.subject,
        createdById: ctx.session.user.id,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
        name: z.string().min(1).max(255),
        collectionId: z.string(),
        cadence: cadenceSchema,
        subject: z.string().max(255).optional(),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      await assertInWorkspace(ctx.db, input.id, input.workspaceId);
      await assertCollectionInWorkspace(
        ctx.db,
        input.collectionId,
        input.workspaceId,
      );
      return updateBroadcast(ctx.db, {
        id: input.id,
        name: input.name,
        collectionId: input.collectionId,
        cadence: input.cadence,
        subject: input.subject,
      });
    }),

  remove: protectedProcedure
    .input(z.object({ workspaceId: z.string(), id: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      await assertInWorkspace(ctx.db, input.id, input.workspaceId);
      // steps + runs cascade-delete (schema onDelete: Cascade).
      await ctx.db.workflowDefinition.delete({ where: { id: input.id } });
      return { success: true };
    }),

  setActive: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
        isActive: z.boolean(),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const def = await assertInWorkspace(ctx.db, input.id, input.workspaceId);
      // Guard: can't activate a Broadcast with no target List (footgun).
      if (input.isActive) {
        const cfg = (def.config ?? {}) as Record<string, unknown>;
        if (typeof cfg.collectionId !== "string" || !cfg.collectionId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot activate a Broadcast without a target List",
          });
        }
      }
      return ctx.db.workflowDefinition.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
    }),

  testSend: protectedProcedure
    .input(z.object({ workspaceId: z.string(), subject: z.string().optional() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const email = ctx.session.user.email;
      if (!email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Your account has no email address for a test send",
        });
      }
      return runBroadcastTestSend(ctx.db, {
        workspaceId: input.workspaceId,
        userId: ctx.session.user.id,
        toEmail: email,
        subject: input.subject,
      });
    }),
});
