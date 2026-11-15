import { z } from "zod";
import { createTRPCRouter, humanOnlyProcedure, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { TRPCError } from "@trpc/server";
import { blankToNull } from "~/server/utils/blankToNull";
import type { PrismaClient } from "@prisma/client";
import { ensureAssistantForUser } from "~/server/services/assistant/ensureAssistant";
import {
  activeAssistantQuery,
  assistantWorksInWorkspaceWhere,
  resolveAssistantForUser,
} from "~/server/services/assistant/resolveAssistant";
import { canDelegateFromRole } from "~/lib/agentDelegation";
import { renameAssistantPrincipal } from "~/server/services/assistant/principal";
import { retireAssistant } from "~/server/services/assistant/retire";
import { generateExternalAgentKey } from "~/server/utils/external-agent-keys";
import {
  memberGrant,
  requireDelegableWorkspaces,
  revokeAgentWorkspace,
} from "~/server/services/externalAgentAccess";

/** Same ceiling as `externalAgent.createKey`: an Assistant's principal is an External agent. */
const MAX_RUNNER_KEYS = 10;

/**
 * An Assistant is **one per person**, the same in every workspace it works in
 * (ADR-0072). It belongs to no workspace: where it works is its principal's
 * memberships. Two consequences:
 *
 *  - Every id-addressed procedure loads the row scoped by `createdById`, so a
 *    CUID belonging to someone else simply doesn't resolve. NOT_FOUND rather
 *    than FORBIDDEN, so the API doesn't confirm that an id exists.
 *  - `getMine` resolves the caller's Assistant with no workspace, through the
 *    same resolver as chat, the gateways and Agent runs.
 *
 * Mutations are `humanOnlyProcedure`: an Assistant owns an External agent
 * principal (ADR-0067), so creating, renaming or deleting one is agent
 * management, which ADR-0049 keeps out of reach of agent principals.
 *
 * `personality`, `instructions`, and `userContext` are free-text private
 * content injected verbatim into the system prompt by /api/chat/stream, so
 * read access is as sensitive as write access — `getById` and `list` are
 * guarded on the same terms as the mutations.
 */
/**
 * What the settings page needs from the principal: which engine runs its
 * Agent runs and the runner keys minted for it (prefixes only — the secret is
 * never stored).
 */
const ASSISTANT_PRINCIPAL_INCLUDE = {
  externalAgent: {
    select: {
      id: true,
      executor: true,
      shadowUserId: true,
      /** The Assistant's fallback Remit when it holds no Position (ADR-0068 §3). */
      description: true,
      keys: {
        orderBy: { createdAt: "desc" as const },
        select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true, expiresAt: true },
      },
    },
  },
} as const;

async function getOwnedAssistantOrThrow(
  db: PrismaClient,
  id: string,
  userId: string,
) {
  // A retired Assistant (ADR-0072) is gone as far as its person's API goes:
  // it cannot be edited or given a runner key again.
  const assistant = await db.assistant.findFirst({
    where: { id, createdById: userId, retiredAt: null },
    include: ASSISTANT_PRINCIPAL_INCLUDE,
  });
  if (!assistant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Assistant not found" });
  }
  return assistant;
}

export const assistantRouter = createTRPCRouter({
  /**
   * Personalise the calling user's Assistant for the first time — the
   * "persona save" first need (ADR-0072). A person has at most one Assistant,
   * so this refuses when they already have one: edit it with `update`.
   *
   * No workspace: the Assistant is the person's, not a workspace's. Its row
   * and its first membership go in their Personal workspace, where an
   * Assistant is always a member; any other workspace it joins only when they
   * add it.
   */
  create: humanOnlyProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        emoji: z.string().max(10).optional(),
        personality: z.string().min(1).max(10000),
        instructions: z.string().max(10000).optional(),
        userContext: z.string().max(5000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const existing = await resolveAssistantForUser(ctx.db, userId);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have an Assistant, ${existing.name}. One Assistant works across all your workspaces.`,
        });
      }

      const { assistant } = await ensureAssistantForUser(ctx.db, userId, input);
      return assistant;
    }),

  /**
   * Add the calling user's Assistant to a workspace (ADR-0072, Agent PRD D6):
   * the Members page's "Add my Assistant" and Settings → Assistant's
   * workspace list. Same delegation check as an External agent's grant — the
   * person must hold at least `member` there — and the Assistant only ever
   * holds `member`. Adding is a first need, so a person with no Assistant yet
   * gets one ("Zoe"). Re-adding is a no-op.
   */
  addToWorkspace: humanOnlyProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      // Checked before anything is written: a refusal must not even leave a
      // lazily created Assistant behind.
      await requireDelegableWorkspaces(ctx.db, userId, [input.workspaceId]);

      const { assistant } = await ensureAssistantForUser(ctx.db, userId);
      const principal = await ctx.db.externalAgent.findUniqueOrThrow({
        where: { id: assistant.externalAgentId },
        select: { shadowUserId: true },
      });
      await memberGrant(ctx.db, principal.shadowUserId, input.workspaceId);
      return { assistantId: assistant.id, workspaceId: input.workspaceId };
    }),

  /**
   * Take the calling user's Assistant out of a workspace: its membership and
   * any project grants it held there. The person decides where their
   * Assistant works; a workspace owner or admin can also remove it, from
   * Members (`workspace.removeMember`). Removing it from a workspace it is
   * not in is a no-op.
   */
  removeFromWorkspace: humanOnlyProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const assistant = await ctx.db.assistant.findFirst({
        ...activeAssistantQuery(ctx.session.user.id),
        select: { id: true, externalAgent: { select: { shadowUserId: true } } },
      });
      if (!assistant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "You don't have an Assistant yet" });
      }
      const removed = await revokeAgentWorkspace(
        ctx.db,
        assistant.externalAgent.shadowUserId,
        input.workspaceId,
      );
      return { removed };
    }),

  /** Update an assistant owned by the calling user */
  update: humanOnlyProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        emoji: z.string().max(10).optional().nullable(),
        personality: z.string().min(1).max(10000).optional(),
        instructions: z.string().max(10000).optional().nullable(),
        userContext: z.string().max(5000).optional().nullable(),
        /** Which engine runs Agent runs assigned to this Assistant (ADR-0067 §4, Agent PRD V2). */
        executor: z.enum(["MASTRA", "LOCAL_CLI"]).optional(),
        /**
         * What work should be assigned to this Assistant — its fallback Remit
         * when it holds no Position (ADR-0068 §3). Lives on the principal
         * (`ExternalAgent.description`), like `executor`.
         */
        description: z.string().trim().max(5000).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, executor, description, ...data } = input;
      const userId = ctx.session.user.id;

      const existing = await getOwnedAssistantOrThrow(ctx.db, id, userId);

      const renamed = data.name !== undefined && data.name !== existing.name;
      return ctx.db.$transaction(async (tx) => {
        // The principal answers to the Assistant's name (ADR-0067).
        if (renamed) {
          await renameAssistantPrincipal(tx, existing.externalAgentId, data.name!);
        }
        // The executor and the description live on the principal (the
        // relation is required: `Assistant.externalAgentId` NOT NULL,
        // ADR-0067). A QUEUED run already copied the old executor, so a
        // switch applies to the next assignment.
        const principalData = {
          ...(executor !== undefined && executor !== existing.externalAgent.executor && { executor }),
          ...(description !== undefined && { description: blankToNull(description) }),
        };
        if (Object.keys(principalData).length > 0) {
          await tx.externalAgent.update({
            where: { id: existing.externalAgentId },
            data: principalData,
          });
        }
        return tx.assistant.update({
          where: { id },
          data,
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

  /**
   * The calling user's Assistant, as a list, when it works in this workspace
   * (its principal is a member there) — empty otherwise. What a workspace
   * setting may pick from (the Workspace Updates voice).
   */
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ input, ctx }) => {
      return ctx.db.assistant.findMany({
        where: {
          createdById: ctx.session.user.id,
          ...assistantWorksInWorkspaceWhere(input.workspaceId),
        },
      });
    }),

  /**
   * The calling user's Assistant, wherever they are (ADR-0072), or null when
   * they have none yet — chat is then "Zoe" acting as them. No workspace: one
   * Assistant per person, through the shared resolver's query.
   */
  getMine: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.assistant.findFirst({
      ...activeAssistantQuery(ctx.session.user.id),
      include: ASSISTANT_PRINCIPAL_INCLUDE,
    });
  }),

  /**
   * Every workspace the calling user belongs to directly, with whether their
   * Assistant works there and whether they may add it (a delegating role,
   * ADR-0049) — Settings → Assistant's "Where it works" list. With no
   * Assistant yet, it works nowhere.
   */
  myWorkspaces: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [assistant, memberships] = await Promise.all([
      ctx.db.assistant.findFirst({
        ...activeAssistantQuery(userId),
        select: { externalAgent: { select: { shadowUserId: true } } },
      }),
      ctx.db.workspaceUser.findMany({
        where: { userId },
        orderBy: { joinedAt: "asc" },
        select: { role: true, workspace: { select: { id: true, name: true, slug: true, type: true } } },
      }),
    ]);
    const worksIn = new Set(
      assistant
        ? (
            await ctx.db.workspaceUser.findMany({
              where: { userId: assistant.externalAgent.shadowUserId },
              select: { workspaceId: true },
            })
          ).map((m) => m.workspaceId)
        : [],
    );
    return memberships.map((m) => ({
      ...m.workspace,
      canAdd: canDelegateFromRole(m.role),
      assistantIsMember: worksIn.has(m.workspace.id),
    }));
  }),

  /**
   * "Delete" the calling user's Assistant: it is **retired**, never deleted
   * (ADR-0072). Deleting its External agent would cascade-delete every Agent
   * run it performed (`AgentRun.agentId` is `onDelete: Cascade`); retiring it
   * keeps the principal, so its history stays attributed, while revoking its
   * keys and memberships, unassigning it from open Actions and stopping its
   * runs. The person may then create a new Assistant.
   */
  delete: humanOnlyProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const assistant = await getOwnedAssistantOrThrow(ctx.db, input.id, ctx.session.user.id);
      await retireAssistant(ctx.db, { assistantId: assistant.id });
      return assistant;
    }),

  /**
   * Mint a runner key for the Assistant's principal (Agent PRD V2): the
   * `exp_agent_` credential the local runner presents to `agentRun.claim`.
   * Same key model and ceiling as `externalAgent.createKey`; the secret is
   * returned exactly once and only its hash is stored.
   */
  createRunnerKey: humanOnlyProcedure
    .input(z.object({ id: z.string(), name: z.string().trim().min(1).max(100).default("runner") }))
    .mutation(async ({ input, ctx }) => {
      const assistant = await getOwnedAssistantOrThrow(ctx.db, input.id, ctx.session.user.id);
      const agentId = assistant.externalAgentId;

      const keyCount = await ctx.db.externalAgentKey.count({ where: { agentId } });
      if (keyCount >= MAX_RUNNER_KEYS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `An assistant can hold at most ${MAX_RUNNER_KEYS} runner keys — revoke one first`,
        });
      }

      const generated = generateExternalAgentKey();
      const key = await ctx.db.externalAgentKey.create({
        data: {
          agentId,
          name: input.name,
          keyHash: generated.hash,
          keyPrefix: generated.displayPrefix,
        },
      });
      // The only moment the secret ever leaves the server.
      return { keyId: key.id, keyPrefix: key.keyPrefix, secret: generated.secret };
    }),

  /** Revoke a runner key: row delete, effective on the runner's next request. */
  revokeRunnerKey: humanOnlyProcedure
    .input(z.object({ id: z.string(), keyId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const assistant = await getOwnedAssistantOrThrow(ctx.db, input.id, ctx.session.user.id);
      const result = await ctx.db.externalAgentKey.deleteMany({
        where: { id: input.keyId, agentId: assistant.externalAgentId },
      });
      if (result.count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Key not found" });
      }
      return { revoked: true as const };
    }),
});
