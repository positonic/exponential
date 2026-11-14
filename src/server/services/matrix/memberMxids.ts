/**
 * Which Matrix ID belongs to which user.
 *
 * The only source is `IntegrationUserMapping` under the *shared gateway* integration
 * (ADR-0043): a row exists for a person once they have paired their Matrix account for
 * DMs. An MXID is global, so a pairing made against our homeserver is just as good for
 * a mention in a room on a workspace's own server. Someone who never paired is simply
 * absent from the map, and callers render their name instead.
 */

import type { PrismaClient } from "@prisma/client";
import { SHARED_MATRIX_INTEGRATION_WHERE } from "~/server/utils/matrixGatewayIntegration";

export async function lookupMemberMxids(
  db: PrismaClient,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();

  const gateway = await db.integration.findFirst({
    where: SHARED_MATRIX_INTEGRATION_WHERE,
    select: { id: true },
  });
  if (!gateway) return new Map();

  const mappings = await db.integrationUserMapping.findMany({
    where: { integrationId: gateway.id, userId: { in: [...userIds] } },
    select: { userId: true, externalUserId: true },
  });

  return new Map(mappings.map((m) => [m.userId, m.externalUserId]));
}
