/**
 * Knowledge Page plumbing for Workspace updates. A draft is an ordinary Page
 * (ADR-0033) in the workspace with no project — so every workspace member can
 * read and comment on it — linked from the workspace's "Updates" index Page
 * through the pageLink graph (ADR-0039; there is no parentId).
 *
 * Every write stores the canonical `bodyDoc` and derives `body` from it (as
 * `ceremonies/notesSeed.ts` does), never Markdown alone: a Markdown-only write
 * would drop the index Page's pageLink nodes. Writes to an existing Page are a
 * compare-and-set on `docVersion` that re-reads once, then gives up.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { JSONContent } from "@tiptap/core";

import { buildPageEditorPath } from "~/lib/pages/page-path";
import { collectPageLinkIds } from "~/lib/pages/public-doc";
import { getEmbeddingTriggerService } from "~/server/services/embedding/EmbeddingTriggerService";
import { syncPageLinks, writePageBodyIfVersion } from "~/server/services/pages/page-links";
import { docToMarkdownServer, markdownToDocServer } from "~/server/services/prd/markdown-doc";

export const UPDATES_INDEX_TITLE = "Updates";

const UPDATES_INDEX_INTRO =
  "Each period's update from the resident copywriter. Drafts wait here for a reviewer's approval; nothing is sent until someone approves it.";

function docAndBody(markdown: string): { bodyDoc: JSONContent; body: string } {
  const bodyDoc = markdownToDocServer(markdown);
  return { bodyDoc, body: docToMarkdownServer(bodyDoc) };
}

/** Create a draft Page holding `markdown`, owned by `createdById`. */
export async function createDraftPage(
  db: PrismaClient,
  input: { workspaceId: string; createdById: string; title: string; markdown: string },
): Promise<string> {
  const { bodyDoc, body } = docAndBody(input.markdown);
  const page = await db.$transaction(async (tx) => {
    const created = await tx.knowledgePage.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: null,
        title: input.title,
        bodyDoc: bodyDoc as Prisma.InputJsonValue,
        body,
        createdById: input.createdById,
        includeInSearch: true,
      },
      select: { id: true },
    });
    await syncPageLinks(tx, created.id, bodyDoc);
    return created;
  });
  if (body.trim()) getEmbeddingTriggerService(db).triggerPageEmbedding(page.id);
  return page.id;
}

/**
 * The workspace's "Updates" index Page, created on first use and remembered on
 * the config. A remembered id whose Page was deleted is replaced.
 */
export async function ensureUpdatesIndexPage(
  db: PrismaClient,
  input: { workspaceId: string; createdById: string; indexPageId: string | null },
): Promise<string> {
  if (input.indexPageId) {
    const existing = await db.knowledgePage.findUnique({
      where: { id: input.indexPageId },
      select: { id: true, workspaceId: true },
    });
    if (existing?.workspaceId === input.workspaceId) return existing.id;
  }
  const pageId = await createDraftPage(db, {
    workspaceId: input.workspaceId,
    createdById: input.createdById,
    title: UPDATES_INDEX_TITLE,
    markdown: UPDATES_INDEX_INTRO,
  });
  await db.workspaceUpdateConfig.upsert({
    where: { workspaceId: input.workspaceId },
    create: { workspaceId: input.workspaceId, indexPageId: pageId },
    update: { indexPageId: pageId },
  });
  return pageId;
}

/**
 * Make the index Page link every given update Page, newest first, beneath its
 * intro paragraph. Links already present stay where they are; missing ones —
 * a new draft, or one an earlier run failed to link — are inserted in the
 * given order. So the index repairs itself on every run.
 */
export async function syncUpdatesIndex(
  db: PrismaClient,
  input: {
    indexPageId: string;
    workspaceSlug: string;
    /** Newest first. */
    pages: { id: string; title: string }[];
  },
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const page = await db.knowledgePage.findUnique({
      where: { id: input.indexPageId },
      select: { bodyDoc: true, body: true, docVersion: true },
    });
    if (!page) return false;
    const baseDoc = (page.bodyDoc as JSONContent | null) ?? markdownToDocServer(page.body);
    const content = baseDoc.content ?? [];
    const linked = new Set(collectPageLinkIds(baseDoc));
    const missing: JSONContent[] = input.pages
      .filter((p) => !linked.has(p.id))
      .map((p) => ({
        type: "pageLink",
        attrs: { pageId: p.id, title: p.title, href: buildPageEditorPath(input.workspaceSlug, p.id) },
      }));
    if (missing.length === 0) return true;

    // Keep a leading intro paragraph on top; links go newest-first beneath it.
    const introLength = content[0]?.type === "paragraph" ? 1 : 0;
    const nextDoc: JSONContent = {
      ...baseDoc,
      type: "doc",
      content: [...content.slice(0, introLength), ...missing, ...content.slice(introLength)],
    };
    const written = await writePageBodyIfVersion(db, {
      pageId: input.indexPageId,
      expectedVersion: page.docVersion,
      doc: nextDoc,
      data: { body: docToMarkdownServer(nextDoc) },
    });
    if (written) return true;
  }
  return false;
}

/**
 * Replace a draft Page's content and title (regenerate). One compare-and-set
 * against `expectedDocVersion` — the version the rewrite started from — with
 * no retry: a save that lands while the rewrite was being written is the
 * reviewer's newer work, so it is reported as a conflict, never overwritten.
 */
export async function replacePageContent(
  db: PrismaClient,
  input: { pageId: string; title: string; markdown: string; expectedDocVersion: number },
): Promise<"replaced" | "conflict"> {
  const { bodyDoc, body } = docAndBody(input.markdown);
  const written = await writePageBodyIfVersion(db, {
    pageId: input.pageId,
    expectedVersion: input.expectedDocVersion,
    doc: bodyDoc,
    data: { title: input.title, body },
  });
  if (!written) return "conflict";
  getEmbeddingTriggerService(db).triggerPageEmbedding(input.pageId);
  return "replaced";
}
