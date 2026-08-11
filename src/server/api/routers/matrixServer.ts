/**
 * Workspace-registered Matrix homeservers.
 *
 * Distinct from `matrixGateway`, which manages the *shared* Zoe bot on our own
 * homeserver and exists to receive DMs. A server registered here belongs to the
 * workspace, runs on its own infrastructure, and is poster-only: Exponential talks to
 * its Client-Server API directly and never syncs, so it cannot be DM'd or replied to.
 *
 * The bot access token never crosses this boundary in either direction after
 * registration — no procedure returns it, and `credentialExposure.test.ts` fails the
 * build if one starts to.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, humanOnlyProcedure, protectedProcedure } from "~/server/api/trpc";
import { assertWorkspaceRole } from "~/server/services/access";
import { encryptCredential } from "~/server/utils/credentialHelper";
import {
  MatrixApiError,
  MatrixClient,
  normalizeHomeserverUrl,
  type MatrixRoomSummary,
} from "~/server/services/matrix/MatrixClient";
import {
  MATRIX_ACCESS_TOKEN_KEY_TYPE,
  MATRIX_SERVER_PROVIDER,
} from "~/server/services/matrix/constants";
import {
  getMatrixClientForServer,
  listMatrixServers,
} from "~/server/services/matrix/matrixServer";
import { reportHandledError } from "~/lib/reportHandledError";

/** Only owners and admins may register or remove a workspace's messaging credentials. */
const MANAGE_ROLES = ["owner", "admin"] as const;

/**
 * Turn a homeserver failure into something the user can act on. A bare
 * "request failed" here is useless: the four causes need four different fixes.
 */
function describeMatrixFailure(error: unknown, homeserverUrl: string): TRPCError {
  if (error instanceof MatrixApiError) {
    if (error.status === 0) {
      return new TRPCError({
        code: "BAD_REQUEST",
        message: `Could not reach ${homeserverUrl}. Check the homeserver URL is correct and publicly resolvable.`,
      });
    }
    if (error.isUnauthorized) {
      return new TRPCError({
        code: "BAD_REQUEST",
        message:
          "The homeserver rejected that access token. Check it was copied in full and belongs to this homeserver.",
      });
    }
    return new TRPCError({
      code: "BAD_REQUEST",
      message: `The homeserver refused the request: ${error.message}`,
    });
  }
  return new TRPCError({
    code: "BAD_REQUEST",
    message: "Could not verify the Matrix server.",
  });
}

export const matrixServerRouter = createTRPCRouter({
  /**
   * Register a homeserver after proving the token works.
   *
   * `/whoami` is the gate: it both validates the credential and tells us which bot the
   * token belongs to, so the user never has to type the MXID and can never mistype it.
   * Nothing is persisted unless it passes.
   */
  register: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        homeserverUrl: z.string().url(),
        accessToken: z.string().min(1),
        name: z.string().trim().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceRole(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
        MANAGE_ROLES,
      );

      const homeserverUrl = normalizeHomeserverUrl(input.homeserverUrl);

      const client = new MatrixClient({
        homeserverUrl,
        accessToken: input.accessToken,
      });

      let botUserId: string;
      try {
        ({ userId: botUserId } = await client.whoami());
      } catch (error) {
        throw describeMatrixFailure(error, homeserverUrl);
      }

      // Re-registering the same bot on the same homeserver would leave two rows the
      // picker cannot tell apart, and two tokens where one is stale. Compared in JS
      // rather than as a JSON `equals` filter, which is sensitive to how the stored
      // object was shaped.
      const registered = await listMatrixServers(ctx.db, input.workspaceId);
      const duplicate = registered.some(
        (server) =>
          server.homeserverUrl === homeserverUrl && server.botUserId === botUserId,
      );
      if (duplicate) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${botUserId} is already registered on ${homeserverUrl}. Remove it first to replace its token.`,
        });
      }

      const integration = await ctx.db.integration.create({
        data: {
          name: input.name ?? `Matrix (${botUserId})`,
          type: "MESSAGING",
          provider: MATRIX_SERVER_PROVIDER,
          description: `Workspace Matrix homeserver at ${homeserverUrl}`,
          // Workspace-owned, not user-owned: Integration.user cascades on delete, so
          // attaching a creator would take the workspace's server down with them.
          workspaceId: input.workspaceId,
          status: "ACTIVE",
          providerConfig: { homeserverUrl, botUserId },
        },
        select: { id: true, name: true, status: true, createdAt: true },
      });

      const encrypted = encryptCredential(input.accessToken);
      await ctx.db.integrationCredential.create({
        data: {
          key: encrypted.key,
          keyType: MATRIX_ACCESS_TOKEN_KEY_TYPE,
          isEncrypted: encrypted.isEncrypted,
          integrationId: integration.id,
        },
      });

      return {
        id: integration.id,
        name: integration.name,
        homeserverUrl,
        botUserId,
        status: integration.status,
        createdAt: integration.createdAt,
      };
    }),

  /** Every server this workspace has registered. Readable by any member. */
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertWorkspaceRole(ctx.db, ctx.session.user.id, input.workspaceId, [
        "owner",
        "admin",
        "member",
        "viewer",
      ]);
      return listMatrixServers(ctx.db, input.workspaceId);
    }),

  /**
   * Forget a registered server.
   *
   * Deleting the Integration cascades to its `IntegrationCredential`, so the stored
   * access token goes with it — which is the point: this is how a workspace revokes a
   * bot credential from Exponential's side. Owner/admin only, and scoped to the
   * workspace so one workspace cannot delete another's server by id.
   */
  remove: humanOnlyProcedure
    .input(z.object({ workspaceId: z.string(), serverId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceRole(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
        MANAGE_ROLES,
      );

      const { count } = await ctx.db.integration.deleteMany({
        where: {
          id: input.serverId,
          provider: MATRIX_SERVER_PROVIDER,
          workspaceId: input.workspaceId,
        },
      });

      if (count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That Matrix server is not registered in this workspace.",
        });
      }

      return { removed: count };
    }),

  /**
   * Rooms the bot can reach on a registered server.
   *
   * Only joined rooms: the bot posts where it has been invited and has joined, and there
   * is deliberately no directory search or auto-join. Each room carries its encryption
   * status so the caller can refuse to offer one the bot cannot post to.
   */
  rooms: protectedProcedure
    .input(z.object({ workspaceId: z.string(), serverId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertWorkspaceRole(ctx.db, ctx.session.user.id, input.workspaceId, [
        "owner",
        "admin",
        "member",
      ]);

      const { client, config } = await getMatrixClientForServer(
        ctx.db,
        input.serverId,
        input.workspaceId,
      );

      try {
        const [joinedIds, invites] = await Promise.all([
          client.joinedRooms(),
          client.pendingInvites(),
        ]);
        const joined = await client.roomSummaries(joinedIds);

        return {
          joined: joined.map(toRoomChoice).sort(byName),
          invited: invites.map(toRoomChoice).sort(byName),
        };
      } catch (error) {
        reportHandledError(error, {
          area: "matrix-room-list",
          context: { homeserverUrl: config.homeserverUrl, serverId: input.serverId },
        });
        throw describeMatrixFailure(error, config.homeserverUrl);
      }
    }),

  /**
   * Join a room the bot has been invited to, so it becomes postable.
   *
   * Deliberately only reachable for a room the bot already has an invite to — this is
   * "accept what someone offered", never "join anything you can name".
   */
  acceptInvite: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        serverId: z.string(),
        roomId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceRole(ctx.db, ctx.session.user.id, input.workspaceId, [
        "owner",
        "admin",
        "member",
      ]);

      const { client, config } = await getMatrixClientForServer(
        ctx.db,
        input.serverId,
        input.workspaceId,
      );

      try {
        const invites = await client.pendingInvites();
        const invite = invites.find((room) => room.roomId === input.roomId);
        if (!invite) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "That room is no longer inviting this bot — the invite may have been withdrawn.",
          });
        }

        await client.join(input.roomId);

        // Re-read state as a member: the invite's stripped state is a subset, so a room
        // can look unencrypted from outside and turn out not to be.
        const [summary] = await client.roomSummaries([input.roomId]);
        return toRoomChoice(summary ?? invite);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        reportHandledError(error, {
          area: "matrix-accept-invite",
          context: {
            homeserverUrl: config.homeserverUrl,
            serverId: input.serverId,
            roomId: input.roomId,
          },
        });
        throw describeMatrixFailure(error, config.homeserverUrl);
      }
    }),
});

/** An unnamed room still needs something to show, so fall back to its id. */
function toRoomChoice(room: MatrixRoomSummary) {
  return {
    roomId: room.roomId,
    name: room.name ?? room.roomId,
    isEncrypted: room.isEncrypted,
  };
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}
