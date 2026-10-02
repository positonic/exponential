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
/** Updates per page of the public index; older ones are on later pages. */
export const PUBLIC_INDEX_PAGE_SIZE = 20;
/** Items in the RSS feed (newest first). Readers keep what they already fetched. */
export const FEED_ITEM_LIMIT = 50;
const MAX_PAGE = 1000;

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
  /** Visitors can subscribe here: the workspace has a newsletter List. */
  acceptsSignups: boolean;
}

/** The leading `# headline` duplicates the title the page already shows. */
export function stripLeadingHeadline(markdown: string): string {
  return markdown.replace(/^\s*#\s[^\n]*\n*/, "").trim();
}

export async function getPublicWorkspace(db: PrismaClient, slug: string): Promise<PublicWorkspace | null> {
  const workspace = await db.workspace.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      updateConfig: { select: { isPublic: true, timezone: true, newsletterCollectionId: true } },
    },
  });
  if (!workspace?.updateConfig?.isPublic) return null;
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    timezone: workspace.updateConfig.timezone,
    acceptsSignups: Boolean(workspace.updateConfig.newsletterCollectionId),
  };
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

/** `?page=` as a page number: anything missing or malformed is page 1. */
export function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  return Math.min(Math.max(Number(raw), 1), MAX_PAGE);
}

/**
 * One page of a public workspace's approved updates, newest first (page 1 is
 * the newest); null if the workspace is not public. `hasOlder` says whether a
 * later page exists, so every update stays reachable from the index.
 */
export async function listPublicUpdates(
  db: PrismaClient,
  workspaceSlug: string,
  { page = 1, pageSize = PUBLIC_INDEX_PAGE_SIZE }: { page?: number; pageSize?: number } = {},
): Promise<{ workspace: PublicWorkspace; updates: PublicUpdateSummary[]; page: number; hasOlder: boolean } | null> {
  const workspace = await getPublicWorkspace(db, workspaceSlug);
  if (!workspace) return null;
  const rows = await db.workspaceUpdate.findMany({
    where: {
      workspaceId: workspace.id,
      status: { in: PUBLISHED_STATUSES },
      approvedBody: { not: null },
    },
    orderBy: [{ approvedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    // One extra row tells us whether an older page exists.
    take: pageSize + 1,
    select: SUMMARY_SELECT,
  });
  return {
    workspace,
    updates: rows.slice(0, pageSize).map(toSummary),
    page,
    hasOlder: rows.length > pageSize,
  };
}

/** One approved update of a public workspace; null if either is not public. */
export async function getPublicUpdate(
  db: PrismaClient,
  workspaceSlug: string,
  updateId: string,
): Promise<{ workspace: PublicWorkspace; update: PublicUpdateSummary } | null> {
  const workspace = await getPublicWorkspace(db, workspaceSlug);
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
