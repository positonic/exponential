/**
 * The Matrix poster: one `RoomPoster` for `ChannelLink.provider === "matrix"`.
 *
 * Wraps the shipped stateless `MatrixClient` and the registered-server credentials
 * (`getMatrixClientForServer`), so the token never leaves the server. Encrypted rooms
 * are refused by the client itself (`MatrixEncryptedRoomError`), which the deliverer
 * treats as terminal.
 */

import type { PrismaClient } from "@prisma/client";
import { getMatrixClientForServer } from "~/server/services/matrix/matrixServer";
import { lookupMemberMxids } from "~/server/services/matrix/memberMxids";
import { MATRIX_CHANNEL_PROVIDER } from "~/server/services/matrix/constants";
import type { RoomPoster } from "../types";

/** The slice of `MatrixClient` the poster needs; the injection point for tests. */
export interface MatrixSender {
  send(
    roomId: string,
    message: { html: string; text: string; txnId: string; mentions?: readonly string[] },
  ): Promise<{ eventId: string }>;
}

export interface MatrixRoomPosterDeps {
  /** Override the client lookup (tests). */
  clientFor?: (serverIntegrationId: string, workspaceId: string) => Promise<MatrixSender>;
}

export function createMatrixRoomPoster(
  db: PrismaClient,
  deps: MatrixRoomPosterDeps = {},
): RoomPoster {
  const clientFor =
    deps.clientFor ??
    (async (serverIntegrationId: string, workspaceId: string) =>
      (await getMatrixClientForServer(db, serverIntegrationId, workspaceId)).client);

  return {
    provider: MATRIX_CHANNEL_PROVIDER,

    async send({ link, workspaceId }, message, { txnId }) {
      if (!link.serverIntegrationId) {
        // A binding without a server cannot be sent through; re-binding fixes it, so
        // the deliverer retries rather than giving up.
        throw new Error("That room's binding has no Matrix server attached — re-bind the room.");
      }
      const client = await clientFor(link.serverIntegrationId, workspaceId);
      return client.send(link.externalId, {
        html: message.html,
        text: message.text,
        txnId,
        mentions: message.mentions,
      });
    },

    lookupMentions: (database, userIds) => lookupMemberMxids(database, userIds),
  };
}
