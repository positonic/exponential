/**
 * Who takes part in a ceremony (ADR-0059): the explicit `CeremonyParticipant`
 * rows, plus every member of the ceremony's team when one is set. Both the
 * agenda generator and the async-update flow need the same answer, and a
 * second copy of this union is how the two drift apart.
 */
import type { PrismaClient } from "@prisma/client";

export interface CeremonyParticipantScope {
  id: string;
  teamId: string | null;
  participants?: { userId: string }[];
}

export async function resolveParticipantUserIds(
  db: PrismaClient,
  ceremony: CeremonyParticipantScope,
): Promise<string[]> {
  const explicit =
    ceremony.participants ??
    (await db.ceremonyParticipant.findMany({ where: { ceremonyId: ceremony.id }, select: { userId: true } }));
  const userIds = new Set(explicit.map((p) => p.userId));
  if (ceremony.teamId) {
    const members = await db.teamUser.findMany({ where: { teamId: ceremony.teamId }, select: { userId: true } });
    for (const m of members) userIds.add(m.userId);
  }
  return Array.from(userIds);
}
