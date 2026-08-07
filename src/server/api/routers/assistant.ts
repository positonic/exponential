import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";

/**
 * Assistants are **per user, per workspace** — each member of a workspace gets
 * their own agent with their own name and persona. Two consequences:
 *
 *  - Every id-addressed procedure loads the row scoped by `createdById`, so a
 *    CUID belonging to someone else simply doesn't resolve. NOT_FOUND rather
 *    than FORBIDDEN, so the API doesn't confirm that an id exists.
 *  - Workspace-scoped queries (`list`, `getDefault`, `create`) additionally
 *    filter by `createdById`, so co-members never see or clobber each other's
 *    assistant. This matches how the Telegram and Matrix gateways resolve the
 *    default assistant (`{ createdById, isDefault }`).
 *
 * `personality`, `instructions`, and `userContext` are free-text private
 * content injected verbatim into the system prompt by /api/chat/stream, so
 * read access is as sensitive as write access — `getById` and `list` are
 * guarded on the same terms as the mutations.
 */
async function getOwnedAssistantOrThrow(
  db: PrismaClient,
  id: string,
  userId: string,
) {
  const assistant = await db.assistant.findFirst({
    where: { id, createdById: userId },
  });
  if (!assistant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Assistant not found" });
  }
  return assistant;
}

export const assistantRouter = createTRPCRouter({
  /** Create a new assistant owned by the calling user */
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(50),
        emoji: z.string().max(10).optional(),
        personality: z.string().min(1).max(10000),
        instructions: z.string().max(10000).optional(),
        userContext: z.string().max(5000).optional(),
        isDefault: z.boolean().optional().default(false),
      })
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ input, ctx }) => {
      const { workspaceId, isDefault, ...data } = input;
      const userId = ctx.session.user.id;

      // Unset only *this user's* existing default — never a co-member's.
      if (isDefault) {
        await ctx.db.assistant.updateMany({
          where: { workspaceId, createdById: userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return ctx.db.assistant.create({
        data: {
          ...data,
          workspaceId,
          createdById: userId,
          isDefault,
        },
      });
    }),

  /** Update an assistant owned by the calling user */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        emoji: z.string().max(10).optional().nullable(),
        personality: z.string().min(1).max(10000).optional(),
        instructions: z.string().max(10000).optional().nullable(),
        userContext: z.string().max(5000).optional().nullable(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, isDefault, ...data } = input;
      const userId = ctx.session.user.id;

      const existing = await getOwnedAssistantOrThrow(ctx.db, id, userId);

      if (isDefault) {
        await ctx.db.assistant.updateMany({
          where: {
            workspaceId: existing.workspaceId,
            createdById: userId,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }

      return ctx.db.assistant.update({
        where: { id },
        data: {
          ...data,
          ...(isDefault !== undefined && { isDefault }),
        },
      });
    }),

  /** Get a single assistant owned by the calling user */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      return getOwnedAssistantOrThrow(ctx.db, input.id, ctx.session.user.id);
    }),

  /** List the calling user's assistants in a workspace */
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ input, ctx }) => {
      return ctx.db.assistant.findMany({
        where: {
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
    }),

  /** Get the calling user's default assistant for a workspace (or null) */
  getDefault: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ input, ctx }) => {
      return ctx.db.assistant.findFirst({
        where: {
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
          isDefault: true,
        },
      });
    }),

  /** Delete an assistant owned by the calling user */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await getOwnedAssistantOrThrow(ctx.db, input.id, ctx.session.user.id);
      return ctx.db.assistant.delete({ where: { id: input.id } });
    }),

  /** Set one of the calling user's assistants as their workspace default */
  setDefault: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const assistant = await getOwnedAssistantOrThrow(ctx.db, input.id, userId);

      await ctx.db.assistant.updateMany({
        where: {
          workspaceId: assistant.workspaceId,
          createdById: userId,
          isDefault: true,
        },
        data: { isDefault: false },
      });

      return ctx.db.assistant.update({
        where: { id: input.id },
        data: { isDefault: true },
      });
    }),
});
