import type { PrismaClient } from "@prisma/client";
import { getSignUpMode } from "~/server/services/instance/instanceSettings";

/**
 * Whether a sign-in that would **create** an account may go ahead, under the
 * install's **Sign-up mode** (ADR-0081). Callers ask only for addresses with no
 * account: existing users are never refused here.
 *
 * - `open` (the default, and exponential.im): yes.
 * - `invite-only`: only with a pending, unexpired workspace or team invitation
 *   for that address — accepting it is what `onUserCreated` then does.
 */
export async function mayCreateAccount(
  db: PrismaClient,
  email: string | null | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  if ((await getSignUpMode(db)) === "open") return true;
  if (!email) return false;
  return hasPendingInvitation(db, email, now);
}

/**
 * A pending, unexpired workspace or team invitation for this address. Case-
 * insensitive: Auth.js lowercases the sign-in address, but an invitation keeps
 * whatever case the inviter typed.
 */
export async function hasPendingInvitation(db: PrismaClient, email: string, now: Date): Promise<boolean> {
  const where = {
    email: { equals: email, mode: "insensitive" as const },
    status: "pending",
    expiresAt: { gt: now },
  };
  const [workspaceInvite, teamInvite] = await Promise.all([
    db.workspaceInvitation.findFirst({ where, select: { id: true } }),
    db.teamInvitation.findFirst({ where, select: { id: true } }),
  ]);
  return workspaceInvite !== null || teamInvite !== null;
}
