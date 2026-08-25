/**
 * Binding a Matrix room to a project (or to a workspace as its default).
 *
 * Bindings are outbound `ChannelLink` rows — the same record ADR-0023 defines as the
 * routing authority — rather than a Matrix-specific table, because an inbound room agent
 * will later need to answer "which workspace and project is this room?", which is the
 * same question read the other way.
 *
 * The tri-state a project sees is Inherit / Room / Off:
 *   - Inherit → no project row at all; resolution falls through to the workspace.
 *   - Room    → an active project row naming the room.
 *   - Off     → an *inactive* project row, so "explicitly off" stays distinguishable
 *               from "never configured". Off hard-blocks and does not fall through.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, humanOnlyProcedure, protectedProcedure } from "~/server/api/trpc";
import {
  assertWorkspaceRole,
  canEditProject,
  getProjectAccess,
  getWorkspaceMembership,
} from "~/server/services/access";
import { OUTBOUND } from "~/server/services/channelLinkService";
import { MATRIX_CHANNEL_PROVIDER } from "~/server/services/matrix/constants";
import { resolveMatrixDestination } from "~/server/services/matrix/resolveMatrixDestination";
import { getMatrixClientForServer } from "~/server/services/matrix/matrixServer";
import { SHARED_MATRIX_INTEGRATION_WHERE } from "~/server/utils/matrixGatewayIntegration";
import { reportHandledError } from "~/lib/reportHandledError";

/** A project lead configures their own project's room; only admins set the default. */
async function assertCanBind(
  db: Parameters<typeof getProjectAccess>[0],
  userId: string,
  workspaceId: string,
  projectId: string | null,
): Promise<void> {
  if (!projectId) {
    await assertWorkspaceRole(db, userId, workspaceId, ["owner", "admin"]);
    return;
  }

  // The project must actually live in the workspace the caller named. Without this,
  // edit rights on a project in workspace A would let someone write or delete outbound
  // ChannelLink rows scoped to workspace B — the rows are keyed on
  // (workspaceId, projectId), so a mismatched pair is a cross-tenant write.
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  if (!project || project.workspaceId !== workspaceId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That project is not in this workspace.",
    });
  }

  // Project edit access, deliberately not workspace membership: a project lead
  // configures their own project's room, and a lead may reach the project as a
  // project-only member without being a workspace member.
  const access = await getProjectAccess(db, userId, projectId);
  if (!canEditProject(access)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have edit access to this project.",
    });
  }
}

export const matrixRoomRouter = createTRPCRouter({
  /**
   * What this project (or workspace) is bound to, and what would actually be used.
   *
   * `effective` is what the post button will do; `mode` is what the control shows. They
   * differ under Inherit, which is the whole point of showing both.
   */
  getBinding: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string().nullable().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const membership = await getWorkspaceMembership(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace.",
        });
      }

      const projectId = input.projectId ?? null;

      const own = await ctx.db.channelLink.findFirst({
        where: {
          provider: MATRIX_CHANNEL_PROVIDER,
          direction: OUTBOUND,
          workspaceId: input.workspaceId,
          projectId,
        },
      });

      const effective = await resolveMatrixDestination(ctx.db, {
        projectId,
        workspaceId: input.workspaceId,
      });

      const mode = !own ? "inherit" : own.isActive ? "room" : "off";

      return {
        mode,
        room: own?.isActive
          ? {
              roomId: own.externalId,
              name: own.displayName ?? own.externalId,
              serverId: own.serverIntegrationId,
            }
          : null,
        effective:
          effective.kind === "room"
            ? {
                kind: "room" as const,
                roomId: effective.link.externalId,
                name: effective.link.displayName ?? effective.link.externalId,
                inherited: effective.link.projectId !== projectId,
              }
            : { kind: effective.kind },
      };
    }),

  /** Bind a room. Project-level for a lead, workspace-level for an admin. */
  bind: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string().nullable().optional(),
        serverId: z.string(),
        roomId: z.string().min(1),
        roomName: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const projectId = input.projectId ?? null;
      await assertCanBind(ctx.db, ctx.session.user.id, input.workspaceId, projectId);

      // The server must belong to this workspace, or a binding could point at another
      // workspace's homeserver credentials.
      const server = await ctx.db.integration.findFirst({
        where: { id: input.serverId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!server) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That Matrix server is not registered in this workspace.",
        });
      }

      const existing = await ctx.db.channelLink.findFirst({
        where: {
          provider: MATRIX_CHANNEL_PROVIDER,
          direction: OUTBOUND,
          workspaceId: input.workspaceId,
          projectId,
        },
        select: { id: true },
      });

      const data = {
        displayName: input.roomName ?? null,
        externalId: input.roomId,
        isActive: true,
        serverIntegrationId: input.serverId,
      };

      try {
        const link = existing
          ? await ctx.db.channelLink.update({ where: { id: existing.id }, data })
          : await ctx.db.channelLink.create({
              data: {
                ...data,
                provider: MATRIX_CHANNEL_PROVIDER,
                direction: OUTBOUND,
                workspaceId: input.workspaceId,
                projectId,
                createdById: ctx.session.user.id,
              },
            });
        return { id: link.id, roomId: link.externalId };
      } catch (error) {
        // `@@unique([provider, externalId])` means one room maps to exactly one
        // destination. Correct for inbound routing, and a real constraint here: a
        // workspace default and a project override cannot name the same room. Kept
        // deliberately for V1 (a recorded open decision), so say so plainly rather
        // than failing with a raw constraint error.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "That room is already bound elsewhere. A room can only be bound to one project or workspace at a time.",
          });
        }
        throw error;
      }
    }),

  /**
   * Switch a project's posting off. Project-level only: the confidential-project escape
   * hatch is about one project opting out of a default, so there is nothing at workspace
   * level for it to mean.
   */
  setOff: humanOnlyProcedure
    .input(z.object({ workspaceId: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanBind(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
        input.projectId,
      );

      const existing = await ctx.db.channelLink.findFirst({
        where: {
          provider: MATRIX_CHANNEL_PROVIDER,
          direction: OUTBOUND,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        },
        select: { id: true },
      });

      if (existing) {
        await ctx.db.channelLink.update({
          where: { id: existing.id },
          data: {
            isActive: false,
            // Release the room's binding slot. `@@unique([provider, externalId])` means
            // one room maps to one destination, so leaving the real room id on a
            // switched-off row would make that room unbindable anywhere else — the
            // project turns Off and quietly takes the room out of circulation.
            externalId: `off:${input.projectId}`,
            displayName: null,
            serverIntegrationId: null,
          },
        });
        return { off: true };
      }

      // An "off" row still needs an externalId (the column is required and unique), so
      // it is namespaced per project rather than naming a real room — there is no room
      // to name, and a real room id here would consume that room's one binding slot.
      await ctx.db.channelLink.create({
        data: {
          provider: MATRIX_CHANNEL_PROVIDER,
          direction: OUTBOUND,
          externalId: `off:${input.projectId}`,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          isActive: false,
          createdById: ctx.session.user.id,
        },
      });
      return { off: true };
    }),

  /**
   * Workspace members whose Matrix ID we know, so they can be invited to a new room.
   *
   * The only source of MXIDs is `IntegrationUserMapping` under the *shared gateway*
   * integration — that mapping is created when someone pairs their Matrix account for
   * DMs. So this lists people who have paired, which is a smaller set than "workspace
   * members" and is worth saying plainly in the UI rather than silently omitting people.
   */
  invitableMembers: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await getWorkspaceMembership(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace.",
        });
      }

      const gateway = await ctx.db.integration.findFirst({
        where: SHARED_MATRIX_INTEGRATION_WHERE,
        select: { id: true },
      });
      if (!gateway) return [];

      const members = await ctx.db.workspaceUser.findMany({
        where: { workspaceId: input.workspaceId },
        select: { userId: true, user: { select: { name: true, email: true } } },
      });

      const mappings = await ctx.db.integrationUserMapping.findMany({
        where: {
          integrationId: gateway.id,
          userId: { in: members.map((m) => m.userId) },
        },
        select: { userId: true, externalUserId: true },
      });

      const byUser = new Map(mappings.map((m) => [m.userId, m.externalUserId]));

      return members.flatMap((member) => {
        const mxid = byUser.get(member.userId);
        if (!mxid) return [];
        return [
          {
            userId: member.userId,
            mxid,
            name: member.user.name ?? member.user.email ?? mxid,
          },
        ];
      });
    }),

  /**
   * Create an unencrypted room, invite people, and bind it — in that order.
   *
   * The order matters for failure: nothing is bound until the room demonstrably exists,
   * so a homeserver that refuses cannot leave a project pointing at a room that was
   * never created. Invites are best-effort *after* creation, because a single bad MXID
   * should not throw away a room that already exists and is already usable.
   */
  createRoom: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string().nullable().optional(),
        serverId: z.string(),
        name: z.string().trim().min(1).max(100),
        inviteMxids: z.array(z.string()).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const projectId = input.projectId ?? null;
      await assertCanBind(ctx.db, ctx.session.user.id, input.workspaceId, projectId);

      const { client, config } = await getMatrixClientForServer(
        ctx.db,
        input.serverId,
        input.workspaceId,
      );

      let roomId: string;
      try {
        ({ roomId } = await client.createRoom({
          name: input.name,
          invite: input.inviteMxids ?? [],
        }));
      } catch (error) {
        reportHandledError(error, {
          area: "matrix-create-room",
          context: { homeserverUrl: config.homeserverUrl, serverId: input.serverId },
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? `The homeserver could not create the room: ${error.message}`
              : "The homeserver could not create the room.",
        });
      }

      // Only now is there something worth binding.
      const link = await ctx.db.channelLink.create({
        data: {
          provider: MATRIX_CHANNEL_PROVIDER,
          direction: OUTBOUND,
          externalId: roomId,
          displayName: input.name,
          workspaceId: input.workspaceId,
          projectId,
          isActive: true,
          serverIntegrationId: input.serverId,
          createdById: ctx.session.user.id,
        },
      });

      return { roomId, name: input.name, channelLinkId: link.id };
    }),

  /** Back to Inherit: remove the row entirely so resolution falls through again. */
  unbind: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const projectId = input.projectId ?? null;
      await assertCanBind(ctx.db, ctx.session.user.id, input.workspaceId, projectId);

      const { count } = await ctx.db.channelLink.deleteMany({
        where: {
          provider: MATRIX_CHANNEL_PROVIDER,
          direction: OUTBOUND,
          workspaceId: input.workspaceId,
          projectId,
        },
      });
      return { removed: count };
    }),
});
