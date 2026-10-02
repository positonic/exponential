/**
 * Read side of published Workspace updates: what `/updates/<workspace>`, its
 * detail pages and its RSS feed show. Only a workspace that opted in
 * (`isPublic`) has a public page, and only approved content is ever shown —
 * the snapshot frozen at approval (`approvedTitle` / `approvedBody`), never
 * the live draft Page, so post-approval edits stay private.
 */
import type { PrismaClient } from "@prisma/client";

import { WORKSPACE_UPDATE_STATUS } from "./types";

const PUBLISHED_STATUSES = [WORKSPACE_UPDATE_STATUS.APPROVED, WORKSPACE_UPDATE_STATUS.SENT];
const LIST_LIMIT = 50;

export interface PublicUpdateSummary {
  id: string;
  kind: string;
  title: string;
  /** Markdown with the leading headline removed (the page renders it as the title). */
  body: string;
  windowStart: Date;
  windowEnd: Date;
  publishedAt: Date;
}

export interface PublicWorkspace {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

/** The leading `# headline` duplicates the title the page already shows. */
export function stripLeadingHeadline(markdown: string): string {
  return markdown.replace(/^\s*#\s[^\n]*\n*/, "").trim();
}

async function loadPublicWorkspace(db: PrismaClient, slug: string): Promise<PublicWorkspace | null> {
  const workspace = await db.workspace.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, updateConfig: { select: { isPublic: true, timezone: true } } },
  });
  if (!workspace?.updateConfig?.isPublic) return null;
  return { id: workspace.id, name: workspace.name, slug: workspace.slug, timezone: workspace.updateConfig.timezone };
}

function toSummary(row: {
  id: string;
  kind: string;
  approvedTitle: string | null;
  approvedBody: string | null;
  windowStart: Date;
  windowEnd: Date;
  approvedAt: Date | null;
}): PublicUpdateSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.approvedTitle ?? "Update",
    body: stripLeadingHeadline(row.approvedBody ?? ""),
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    publishedAt: row.approvedAt ?? row.windowEnd,
  };
}

const SUMMARY_SELECT = {
  id: true,
  kind: true,
  approvedTitle: true,
  approvedBody: true,
  windowStart: true,
  windowEnd: true,
  approvedAt: true,
} as const;

/** A public workspace and its approved updates, newest first; null if it is not public. */
export async function listPublicUpdates(
  db: PrismaClient,
  workspaceSlug: string,
): Promise<{ workspace: PublicWorkspace; updates: PublicUpdateSummary[] } | null> {
  const workspace = await loadPublicWorkspace(db, workspaceSlug);
  if (!workspace) return null;
  const rows = await db.workspaceUpdate.findMany({
    where: {
      workspaceId: workspace.id,
      status: { in: PUBLISHED_STATUSES },
      approvedBody: { not: null },
    },
    orderBy: { approvedAt: "desc" },
    take: LIST_LIMIT,
    select: SUMMARY_SELECT,
  });
  return { workspace, updates: rows.map(toSummary) };
}

/** One approved update of a public workspace; null if either is not public. */
export async function getPublicUpdate(
  db: PrismaClient,
  workspaceSlug: string,
  updateId: string,
): Promise<{ workspace: PublicWorkspace; update: PublicUpdateSummary } | null> {
  const workspace = await loadPublicWorkspace(db, workspaceSlug);
  if (!workspace) return null;
  const row = await db.workspaceUpdate.findFirst({
    where: {
      id: updateId,
      workspaceId: workspace.id,
      status: { in: PUBLISHED_STATUSES },
      approvedBody: { not: null },
    },
    select: SUMMARY_SELECT,
  });
  return row ? { workspace, update: toSummary(row) } : null;
}

export function publicUpdatesPath(workspaceSlug: string): string {
  return `/updates/${workspaceSlug}`;
}

export function publicUpdatePath(workspaceSlug: string, updateId: string): string {
  return `/updates/${workspaceSlug}/${updateId}`;
}
