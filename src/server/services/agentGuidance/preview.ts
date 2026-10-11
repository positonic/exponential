/**
 * Who may read the method while it is still a draft (settled decision 1,
 * D-0002): members of the workspaces listed in
 * `METHOD_PREVIEW_WORKSPACE_SLUGS` (comma-separated; default `exponential`).
 * Everyone else sees no method until it is published.
 */
import type { PrismaClient } from "@prisma/client";
import { getWorkspaceMembership } from "~/server/services/access";

export const DEFAULT_METHOD_PREVIEW_WORKSPACE_SLUGS: readonly string[] = ["exponential"];

/** Parses the env value; unset or blank falls back to the default. */
export function parseMethodPreviewSlugs(raw: string | undefined): string[] {
  const slugs = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return slugs.length > 0 ? slugs : [...DEFAULT_METHOD_PREVIEW_WORKSPACE_SLUGS];
}

/**
 * True when `userId` belongs to a preview workspace. With `workspaceId`, that
 * workspace itself must be a preview workspace the caller belongs to; without
 * it, membership of any preview workspace counts.
 */
export async function canPreviewDraftMethod(
  db: PrismaClient,
  opts: { userId: string; workspaceId?: string; previewSlugs: readonly string[] },
): Promise<boolean> {
  if (opts.previewSlugs.length === 0) return false;
  const workspaces = await db.workspace.findMany({
    where: {
      slug: { in: [...opts.previewSlugs] },
      ...(opts.workspaceId ? { id: opts.workspaceId } : {}),
    },
    select: { id: true },
  });
  for (const ws of workspaces) {
    if (await getWorkspaceMembership(db, opts.userId, ws.id)) return true;
  }
  return false;
}
