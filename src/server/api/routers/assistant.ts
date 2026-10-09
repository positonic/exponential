import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { findGatewayAssistant } from "~/server/services/assistant/gatewayAssistant";
import {
  createAssistantPrincipal,
  deleteExternalAgentPrincipal,
  renameAssistantPrincipal,
} from "~/server/services/assistant/principal";
import { deleteFromBlob } from "~/lib/blob";

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
/** What the settings page needs from the principal: which engine runs its Agent runs. */
const ASSISTANT_PRINCIPAL_INCLUDE = {
  externalAgent: { select: { id: true, executor: true, shadowUserId: true } },
} as const;

async function getOwnedAssistantOrThrow(
  db: PrismaClient,
  id: string,
  userId: string,
) {
  const assistant = await db.assistant.findFirst({
    where: { id, createdById: userId },
    include: ASSISTANT_PRINCIPAL_INCLUDE,
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

      // An Assistant is a principal (ADR-0067): shadow user → External agent →
      // workspace membership → Assistant, in one transaction so a half-made
      // Assistant can never exist. `requireWorkspaceMembership("edit")` above
      // already guarantees the owner is a non-viewer member, which is the
      // delegation-invariant precondition for the membership row.
      return ctx.db.$transaction(async (tx) => {
        const { externalAgentId } = await createAssistantPrincipal(tx, {
          name: data.name,
          ownerId: userId,
          workspaceId,
        });
        return tx.assistant.create({
          data: {
            ...data,
            workspaceId,
            createdById: userId,
            isDefault,
            externalAgentId,
          },
        });
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

      const renamed = data.name !== undefined && data.name !== existing.name;
      return ctx.db.$transaction(async (tx) => {
        // The principal answers to the Assistant's name (ADR-0067).
        if (renamed) {
          await renameAssistantPrincipal(tx, existing.externalAgentId, data.name!);
        }
        return tx.assistant.update({
          where: { id },
          data: {
            ...data,
            ...(isDefault !== undefined && { isDefault }),
          },
          include: ASSISTANT_PRINCIPAL_INCLUDE,
        });
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
        include: ASSISTANT_PRINCIPAL_INCLUDE,
      });
    }),

  /**
   * The assistant the Telegram and Matrix gateways pair to (identity fields
   * only), so /settings/assistant can open on it instead of guessing a workspace.
   */
  getGatewayDefault: protectedProcedure.query(async ({ ctx }) => {
    return findGatewayAssistant(ctx.db, ctx.session.user.id);
  }),

  /**
   * Delete an assistant owned by the calling user — and its principal. The
   * Assistant row itself goes with the External agent (FK cascade); the shadow
   * user is kept when it authored content, so attribution survives (ADR-0067).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const assistant = await getOwnedAssistantOrThrow(ctx.db, input.id, ctx.session.user.id);
      const agent = await ctx.db.externalAgent.findUnique({
        where: { id: assistant.externalAgentId },
        select: { id: true, shadowUserId: true, shadowUser: { select: { image: true } } },
      });
      if (!agent) {
        return ctx.db.assistant.delete({ where: { id: input.id } });
      }
      const result = await deleteExternalAgentPrincipal(ctx.db, agent);
      if (result.orphanedImage) {
        await deleteFromBlob(result.orphanedImage).catch(() => undefined);
      }
      return assistant;
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
