import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createTRPCRouter, humanOnlyProcedure } from "~/server/api/trpc";
import { generateExternalAgentKey } from "~/server/utils/external-agent-keys";

/**
 * External-agent management (ADR-0049).
 *
 * Every procedure is humanOnly: agents cannot manage agents. All access is
 * owner-scoped — you only ever see or mutate agents you own. Workspace grants
 * enforce the delegation invariant at grant time (owner must hold at least
 * `member` in the target workspace); the ongoing half of the invariant lives
 * in the workspace router's membership cascades (externalAgentAccess.ts).
 */

const MAX_KEYS_PER_AGENT = 10;

async function requireOwnedAgent(
  db: PrismaClient | Prisma.TransactionClient,
  agentId: string,
  ownerId: string,
) {
  const agent = await db.externalAgent.findFirst({
    where: { id: agentId, ownerId },
    include: { shadowUser: { select: { id: true } } },
  });
  if (!agent) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
  }
  return agent;
}

export const externalAgentRouter = createTRPCRouter({
  list: humanOnlyProcedure.query(async ({ ctx }) => {
    const agents = await ctx.db.externalAgent.findMany({
      where: { ownerId: ctx.session.user.id },
      orderBy: { createdAt: "asc" },
      include: {
        keys: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            createdAt: true,
            lastUsedAt: true,
            expiresAt: true,
          },
        },
        shadowUser: {
          select: {
            id: true,
            workspaceMemberships: {
              select: {
                role: true,
                workspace: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
      },
    });

    return agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      createdAt: agent.createdAt,
      shadowUserId: agent.shadowUserId,
      keys: agent.keys,
      workspaces: agent.shadowUser.workspaceMemberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
      })),
    }));
  }),

  create: humanOnlyProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const shadowUser = await tx.user.create({
          data: {
            name: input.name,
            isAgent: true,
          },
        });
        return tx.externalAgent.create({
          data: {
            name: input.name,
            description: input.description,
            ownerId: ctx.session.user.id,
            shadowUserId: shadowUser.id,
          },
        });
      });
    }),

  delete: humanOnlyProcedure
    .input(z.object({ agentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await requireOwnedAgent(ctx.db, input.agentId, ctx.session.user.id);

      // Credentials and memberships always die with the agent.
      await ctx.db.$transaction([
        ctx.db.externalAgentKey.deleteMany({ where: { agentId: agent.id } }),
        ctx.db.workspaceUser.deleteMany({ where: { userId: agent.shadowUserId } }),
        ctx.db.externalAgent.delete({ where: { id: agent.id } }),
      ]);

      // The shadow user row is removed only when nothing references it: if the
      // agent authored content (Action.createdById etc.), the restricted FKs
      // block deletion and we keep the row — inert (no keys, no memberships,
      // no login) but preserving historical attribution.
      try {
        await ctx.db.user.delete({ where: { id: agent.shadowUserId } });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2003" || error.code === "P2014")
        ) {
          return { success: true, shadowUserRetained: true };
        }
        throw error;
      }
      return { success: true, shadowUserRetained: false };
    }),

  createKey: humanOnlyProcedure
    .input(
      z.object({
        agentId: z.string(),
        name: z.string().trim().min(1).max(100),
        expiresAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agent = await requireOwnedAgent(ctx.db, input.agentId, ctx.session.user.id);

      const keyCount = await ctx.db.externalAgentKey.count({ where: { agentId: agent.id } });
      if (keyCount >= MAX_KEYS_PER_AGENT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `An agent can hold at most ${MAX_KEYS_PER_AGENT} keys — revoke one first`,
        });
      }

      const generated = generateExternalAgentKey();
      const key = await ctx.db.externalAgentKey.create({
        data: {
          agentId: agent.id,
          name: input.name,
          keyHash: generated.hash,
          keyPrefix: generated.displayPrefix,
          expiresAt: input.expiresAt,
        },
      });

      // The only moment the secret ever leaves the server.
      return { keyId: key.id, secret: generated.secret };
    }),

  revokeKey: humanOnlyProcedure
    .input(z.object({ agentId: z.string(), keyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await requireOwnedAgent(ctx.db, input.agentId, ctx.session.user.id);
      const result = await ctx.db.externalAgentKey.deleteMany({
        where: { id: input.keyId, agentId: agent.id },
      });
      if (result.count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Key not found" });
      }
      return { success: true };
    }),

  grantWorkspaces: humanOnlyProcedure
    .input(z.object({ agentId: z.string(), workspaceIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const agent = await requireOwnedAgent(ctx.db, input.agentId, ctx.session.user.id);
      const workspaceIds = [...new Set(input.workspaceIds)];

      // Delegation invariant, grant-time half: the owner must hold at least
      // `member` in every target workspace themselves. A viewer cannot delegate
      // member-level access (ADR-0049). All-or-nothing — a partial grant would
      // read as a full one in the UI.
      const ownerMemberships = await ctx.db.workspaceUser.findMany({
        where: { userId: ctx.session.user.id, workspaceId: { in: workspaceIds } },
      });
      const delegable = new Set(
        ownerMemberships.filter((m) => m.role !== "viewer").map((m) => m.workspaceId),
      );
      if (delegable.size !== workspaceIds.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You need at least member access in every workspace you add your agent to — nothing was granted",
        });
      }

      await ctx.db.$transaction(
        workspaceIds.map((workspaceId) =>
          ctx.db.workspaceUser.upsert({
            where: {
              userId_workspaceId: { userId: agent.shadowUserId, workspaceId },
            },
            // Agents only ever hold `member` (ADR-0049).
            create: { userId: agent.shadowUserId, workspaceId, role: "member" },
            update: { role: "member" },
          }),
        ),
      );

      return { granted: workspaceIds.length };
    }),

  revokeWorkspace: humanOnlyProcedure
    .input(z.object({ agentId: z.string(), workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await requireOwnedAgent(ctx.db, input.agentId, ctx.session.user.id);
      await ctx.db.workspaceUser.deleteMany({
        where: { userId: agent.shadowUserId, workspaceId: input.workspaceId },
      });
      return { success: true };
    }),
});
