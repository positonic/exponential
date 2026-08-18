import type { PrismaClient } from "@prisma/client";
import { MATRIX_SERVER_PROVIDER } from "~/server/services/matrix/constants";
import type { FirstLoginWelcomeInvited } from "~/server/services/EmailService";

export interface WelcomeEmailContext {
  invited?: FirstLoginWelcomeInvited;
  chatTools?: { slack: boolean; matrix: boolean };
}

/**
 * Resolve the invited-workspace frame and chat-tool slot for the Welcome
 * email sent from `events.createUser`.
 *
 * Extracted from `config.ts` for the same reason as
 * `acceptPendingInvitationsForUser`: unit-testable without dragging the whole
 * NextAuth config (providers, env) into a test. Must stay Edge-bundle-safe —
 * no Sentry, `console.error` only (see the retirement comment in
 * `sendVerificationRequest`).
 *
 * Never throws: context is flavor, the email is not. Any failure here
 * degrades to `{}` and the caller sends the generic Welcome email.
 */
export async function resolveWelcomeEmailContext(
  db: PrismaClient,
  workspaceId: string,
  email: string,
): Promise<WelcomeEmailContext> {
  try {
    const [workspace, invitation, slackIntegration, matrixServer] =
      await Promise.all([
        db.workspace.findUnique({
          where: { id: workspaceId },
          select: { name: true },
        }),
        // Unique on (workspaceId, email), so this findFirst is deterministic.
        db.workspaceInvitation.findFirst({
          where: { workspaceId, email, status: "accepted" },
          select: { createdBy: { select: { name: true, email: true } } },
        }),
        // Slack integrations are user-owned — the OAuth callback sets only
        // `userId` — so "the workspace uses Slack" means a member has one.
        // The `workspaceId` arm is future-proofing for workspace-scoped rows.
        db.integration.findFirst({
          where: {
            provider: "slack",
            status: "ACTIVE",
            OR: [
              { workspaceId },
              { user: { workspaceMemberships: { some: { workspaceId } } } },
            ],
          },
          select: { id: true },
        }),
        // Workspace-registered Matrix homeservers ARE workspace-scoped rows,
        // deliberately under a distinct provider string (see matrix/constants).
        db.integration.findFirst({
          where: {
            provider: MATRIX_SERVER_PROVIDER,
            status: "ACTIVE",
            workspaceId,
          },
          select: { id: true },
        }),
      ]);

    if (!workspace) return {};

    // `??` alone would let a whitespace-only stored name through — treat
    // blank as missing (same guard as `resolveInvitedContext`).
    const inviterName =
      invitation?.createdBy.name?.trim() ||
      invitation?.createdBy.email?.trim() ||
      null;

    return {
      invited: { workspaceName: workspace.name, inviterName },
      chatTools: {
        slack: slackIntegration !== null,
        matrix: matrixServer !== null,
      },
    };
  } catch (error) {
    console.error("[Auth] Failed to resolve welcome email context:", error);
    return {};
  }
}
