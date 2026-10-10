import type { PrismaClient } from "@prisma/client";
import { buildWorkspaceAccessWhere } from "~/server/services/access";

/**
 * Which workspace a `/go/<route>` link should land in for this user.
 *
 * Order: the user's chosen default workspace (Settings → General → Default
 * workspace) when they still have access to it; otherwise the Personal
 * workspace every account is given; otherwise the first workspace they can
 * access at all. Returns null only for an account with no workspace, which
 * `/go` sends to /workspaces.
 */
export async function resolveGoWorkspaceSlug(db: PrismaClient, userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { defaultWorkspaceId: true },
  });

  if (user?.defaultWorkspaceId) {
    const preferred = await db.workspace.findFirst({
      where: { id: user.defaultWorkspaceId, ...buildWorkspaceAccessWhere(userId) },
      select: { slug: true },
    });
    if (preferred) return preferred.slug;
  }

  const personal = await db.workspace.findFirst({
    where: { type: "personal", ownerId: userId },
    orderBy: { createdAt: "asc" },
    select: { slug: true },
  });
  if (personal) return personal.slug;

  const any = await db.workspace.findFirst({
    where: buildWorkspaceAccessWhere(userId),
    orderBy: { createdAt: "asc" },
    select: { slug: true },
  });
  return any?.slug ?? null;
}

/** A `/go/` route is a workspace-relative path: plain segments, no `..`, no scheme. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

export function sanitizeGoRoute(segments: string[]): string | null {
  if (segments.length === 0) return null;
  if (!segments.every((s) => SEGMENT.test(s) && s !== "..")) return null;
  return segments.join("/");
}
