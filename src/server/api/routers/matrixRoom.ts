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
