/**
 * Workspace resolver (Voice — Web Client, ticket #10) — the single source of
 * truth for "which workspace does this voice session operate in".
 *
 * Lifted out of brainPassthrough.ts so EVERY voice tool gets workspace context
 * the same way. Previously the inline copy only fed `ask_exponential`, so the
 * four coarse tools operated user-wide — a latent multi-workspace bug. This
 * helper is now called once at session-mint time (`voice.createSession`); the
 * result is stamped into the voice-session JWT as a verified `workspaceId`
 * claim, then threaded into every coarse tool by `voice.dispatch`.
 *
 * Three-tier resolution:
 *   1. explicit `workspaceId` — ONLY if the user is a member; otherwise rejected.
 *      A caller must never be able to mint a session into a workspace they can't
 *      access (that would be a privilege-escalation path), so an explicit id the
 *      user is not a member of throws rather than silently falling through.
 *   2. the user's `defaultWorkspaceId` — only if they are still a member of it
 *      (a stale default for a workspace they were removed from is ignored).
 *   3. the user's first `WorkspaceUser` membership (oldest by `joinedAt`).
 *
 * Returns `undefined` only when no explicit id was given and the user belongs to
 * no workspace at all.
 */
import type { PrismaClient } from "@prisma/client";

/**
 * Thrown when an explicit `workspaceId` is supplied but the user is not a member
 * of it. `voice.createSession` maps this to a `FORBIDDEN` tRPC error.
 */
export class WorkspaceAccessError extends Error {
  constructor(public readonly workspaceId: string) {
    super(`User is not a member of workspace ${workspaceId}`);
    this.name = "WorkspaceAccessError";
  }
}

/**
 * Resolve the workspace for a voice session. See module docs for the three-tier
 * order. Throws {@link WorkspaceAccessError} when `explicit` is provided but the
 * user is not a member.
 */
export async function resolveWorkspaceId(
  userId: string,
  db: PrismaClient,
  explicit?: string,
): Promise<string | undefined> {
  // (1) Explicit id — validate membership before trusting it.
  if (explicit) {
    const membership = await db.workspaceUser.findFirst({
      where: { userId, workspaceId: explicit },
      select: { workspaceId: true },
    });
    if (!membership) throw new WorkspaceAccessError(explicit);
    return explicit;
  }

  // (2) The user's default workspace — but only if they are STILL a member.
  //     defaultWorkspaceId can go stale (the user was removed from it without
  //     the field being cleared); trusting it blindly would mint a session for a
  //     workspace they no longer belong to. Verify membership, else fall through.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { defaultWorkspaceId: true },
  });
  if (user?.defaultWorkspaceId) {
    const stillMember = await db.workspaceUser.findFirst({
      where: { userId, workspaceId: user.defaultWorkspaceId },
      select: { workspaceId: true },
    });
    if (stillMember) return user.defaultWorkspaceId;
  }

  // (3) First membership (oldest), as a last resort.
  const membership = await db.workspaceUser.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: { workspaceId: true },
  });
  return membership?.workspaceId;
}
