/**
 * Reading a workspace's registered Matrix servers back out of the database.
 *
 * The access token lives in `IntegrationCredential`, encrypted, and is resolved here
 * and nowhere else — `resolveCredential` is the only supported reader. Nothing in this
 * module returns the token to a caller that could serialize it; `getMatrixClientForServer`
 * hands back a configured client instead, so the secret stays inside the server process.
 */

import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { resolveCredential } from "~/server/utils/credentialHelper";
import { MatrixClient } from "./MatrixClient";
import {
  MATRIX_ACCESS_TOKEN_ALIASES,
  MATRIX_SERVER_PROVIDER,
  type MatrixServerConfig,
} from "./constants";

/** A registered server, in the shape that is safe to send over tRPC. */
export interface MatrixServerSummary {
  id: string;
  name: string;
  homeserverUrl: string;
  botUserId: string;
  status: string;
  createdAt: Date;
}

/** Parse `providerConfig` defensively — it is `Json?` and predates any schema for it. */
export function readServerConfig(providerConfig: unknown): MatrixServerConfig | null {
  if (typeof providerConfig !== "object" || providerConfig === null) return null;
  const { homeserverUrl, botUserId } = providerConfig as Record<string, unknown>;
  if (typeof homeserverUrl !== "string" || typeof botUserId !== "string") return null;
  return { homeserverUrl, botUserId };
}

export async function listMatrixServers(
  db: PrismaClient,
  workspaceId: string,
): Promise<MatrixServerSummary[]> {
  const rows = await db.integration.findMany({
    where: { provider: MATRIX_SERVER_PROVIDER, workspaceId },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      providerConfig: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.flatMap((row) => {
    const config = readServerConfig(row.providerConfig);
    // A row whose config never parsed cannot be used to reach a homeserver, so it is
    // dropped from the list rather than rendered as a server that silently fails.
    if (!config) return [];
    return [
      {
        id: row.id,
        name: row.name,
        homeserverUrl: config.homeserverUrl,
        botUserId: config.botUserId,
        status: row.status,
        createdAt: row.createdAt,
      },
    ];
  });
}

/**
 * Load a registered server and return a client already holding its credentials.
 *
 * Throws `NOT_FOUND` when the server does not belong to `workspaceId` — the workspace
 * check is here rather than at each call site so a server id from one workspace can
 * never be used to reach another's homeserver.
 */
export async function getMatrixClientForServer(
  db: PrismaClient,
  serverIntegrationId: string,
  workspaceId: string,
  fetchImpl?: typeof fetch,
): Promise<{ client: MatrixClient; config: MatrixServerConfig; integrationId: string }> {
  const integration = await db.integration.findFirst({
    where: {
      id: serverIntegrationId,
      provider: MATRIX_SERVER_PROVIDER,
      workspaceId,
    },
    select: { id: true, providerConfig: true },
  });

  if (!integration) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That Matrix server is not registered in this workspace.",
    });
  }

  const config = readServerConfig(integration.providerConfig);
  if (!config) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This Matrix server's configuration is incomplete — re-register it.",
    });
  }

  const accessToken = await resolveCredential(
    integration.id,
    MATRIX_ACCESS_TOKEN_ALIASES,
  );
  if (!accessToken) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This Matrix server's access token could not be read — re-register it with a fresh token.",
    });
  }

  return {
    client: new MatrixClient({
      homeserverUrl: config.homeserverUrl,
      accessToken,
      fetchImpl,
    }),
    config,
    integrationId: integration.id,
  };
}
