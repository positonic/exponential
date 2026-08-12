import type { PrismaClient } from "@prisma/client";
import { recordActivity } from "~/server/services/activity/recordActivity";

/**
 * Auto-accept any pending workspace and team invitations matching this user's
 * email. Covers the case where an invitee signs up (or signs in) via a route
 * other than the invite accept page — e.g. OAuth, direct magic link, or a
 * magic link whose callbackUrl no longer points at /invite/<token>.
 *
 * Extracted from `config.ts` so the join-event behavior is unit-testable
 * without dragging the whole NextAuth config (providers, env) into a test.
 *
 * Returns the workspaceId of the first accepted invite, if any (caller may
 * want to set it as the user's default workspace).
 */
export async function acceptPendingInvitationsForUser(
  db: PrismaClient,
  userId: string,
  email: string,
): Promise<string | null> {
  const now = new Date();
  let firstAcceptedWorkspaceId: string | null = null;

  try {
    const pendingWorkspaceInvites = await db.workspaceInvitation.findMany({
      where: { email, status: "pending", expiresAt: { gt: now } },
      orderBy: { createdAt: "asc" },
    });

    for (const invitation of pendingWorkspaceInvites) {
      try {
        // The upsert below no-ops for existing members, so remember whether
        // this acceptance actually adds them — only real joins get a feed event.
        const wasAlreadyMember =
          (await db.workspaceUser.findUnique({
            where: {
              userId_workspaceId: {
                userId,
                workspaceId: invitation.workspaceId,
              },
            },
            select: { userId: true },
          })) !== null;

        await db.$transaction([
          db.workspaceInvitation.update({
            where: { id: invitation.id },
            data: { status: "accepted", acceptedAt: now },
          }),
          db.workspaceUser.upsert({
            where: {
              userId_workspaceId: {
                userId,
                workspaceId: invitation.workspaceId,
              },
            },
            create: {
              userId,
              workspaceId: invitation.workspaceId,
              role: invitation.role,
            },
            update: {},
          }),
        ]);
        if (!firstAcceptedWorkspaceId) {
          firstAcceptedWorkspaceId = invitation.workspaceId;
        }

        // Mirror workspace.acceptInvitation: a "joined the workspace" event so
        // auto-accepted invitees show up in the team feed too.
        if (!wasAlreadyMember) {
          const member = await db.user.findUnique({
            where: { id: userId },
            select: { name: true },
          });
          await recordActivity(db, {
            workspaceId: invitation.workspaceId,
            userId,
            entityType: "workspace_member",
            entityId: userId,
            action: "created",
            metadata: { name: member?.name ?? email },
          });
        }
      } catch (error) {
        console.error(
          `[Auth] Failed to auto-accept workspace invitation ${invitation.id}:`,
          error
        );
      }
    }

    const pendingTeamInvites = await db.teamInvitation.findMany({
      where: { email, status: "pending", expiresAt: { gt: now } },
    });

    for (const invitation of pendingTeamInvites) {
      try {
        await db.$transaction([
          db.teamInvitation.update({
            where: { id: invitation.id },
            data: { status: "accepted", acceptedAt: now },
          }),
          db.teamUser.upsert({
            where: {
              userId_teamId: { userId, teamId: invitation.teamId },
            },
            create: { userId, teamId: invitation.teamId, role: invitation.role },
            update: {},
          }),
        ]);
      } catch (error) {
        console.error(
          `[Auth] Failed to auto-accept team invitation ${invitation.id}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error("[Auth] Failed to process pending invitations:", error);
  }

  return firstAcceptedWorkspaceId;
}
