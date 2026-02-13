/**
 * Team Access Resolver
 *
 * Resolves team membership and role for a given user.
 * Single source of truth for "does this user belong to this team?"
 */

import type { PrismaClient } from "@prisma/client";
import type { TeamMembership, TeamRole } from "../types";

export async function getTeamMembership(
  db: PrismaClient,
  userId: string,
  teamId: string,
): Promise<TeamMembership | null> {
  const membership = await db.teamUser.findUnique({
    where: {
      userId_teamId: { userId, teamId },
    },
    select: { role: true, teamId: true },
  });

  if (!membership) return null;

  return {
    role: membership.role as TeamRole,
    teamId: membership.teamId,
  };
}

/** Get all teams a user belongs to */
export async function getUserTeams(
  db: PrismaClient,
  userId: string,
): Promise<TeamMembership[]> {
  const memberships = await db.teamUser.findMany({
    where: { userId },
    select: { role: true, teamId: true },
  });

  return memberships.map((m) => ({
    role: m.role as TeamRole,
    teamId: m.teamId,
  }));
}
