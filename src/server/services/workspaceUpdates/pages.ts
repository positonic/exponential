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
import { getEmbeddingTriggerService } from "~/server/services/embedding/EmbeddingTriggerService";
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
  const page = await db.knowledgePage.create({
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
 * Insert a pageLink to `child` on the index Page, newest first (after the
 * intro paragraph). Idempotent: a child already linked is left where it is.
 */
export async function prependPageLink(
  db: PrismaClient,
  input: { indexPageId: string; workspaceSlug: string; childPageId: string; childTitle: string },
): Promise<boolean> {
  const link: JSONContent = {
    type: "pageLink",
    attrs: {
      pageId: input.childPageId,
      title: input.childTitle,
      href: buildPageEditorPath(input.workspaceSlug, input.childPageId),
    },
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const page = await db.knowledgePage.findUnique({
      where: { id: input.indexPageId },
      select: { bodyDoc: true, body: true, docVersion: true },
    });
    if (!page) return false;
    const baseDoc = (page.bodyDoc as JSONContent | null) ?? markdownToDocServer(page.body);
    const content = baseDoc.content ?? [];
    if (content.some((n) => n.type === "pageLink" && n.attrs?.pageId === input.childPageId)) {
      return true;
    }
    // Keep a leading intro paragraph on top; links go newest-first beneath it.
    const introLength = content[0]?.type === "paragraph" ? 1 : 0;
    const nextDoc: JSONContent = {
      ...baseDoc,
      type: "doc",
      content: [...content.slice(0, introLength), link, ...content.slice(introLength)],
    };
    const { count } = await db.knowledgePage.updateMany({
      where: { id: input.indexPageId, docVersion: page.docVersion },
      data: {
        bodyDoc: nextDoc as Prisma.InputJsonValue,
        body: docToMarkdownServer(nextDoc),
        docVersion: { increment: 1 },
      },
    });
    if (count === 1) return true;
  }
  return false;
}

/**
 * Replace a draft Page's content and title (regenerate). Compare-and-set on
 * the version read, so a reviewer's concurrent save is never silently lost —
 * the caller reports "conflict" and the reviewer retries.
 */
export async function replacePageContent(
  db: PrismaClient,
  input: { pageId: string; title: string; markdown: string },
): Promise<"replaced" | "missing" | "conflict"> {
  const { bodyDoc, body } = docAndBody(input.markdown);
  for (let attempt = 0; attempt < 2; attempt++) {
    const page = await db.knowledgePage.findUnique({
      where: { id: input.pageId },
      select: { docVersion: true },
    });
    if (!page) return "missing";
    const { count } = await db.knowledgePage.updateMany({
      where: { id: input.pageId, docVersion: page.docVersion },
      data: {
        title: input.title,
        bodyDoc: bodyDoc as Prisma.InputJsonValue,
        body,
        docVersion: { increment: 1 },
      },
    });
    if (count === 1) {
      getEmbeddingTriggerService(db).triggerPageEmbedding(input.pageId);
      return "replaced";
    }
  }
  return "conflict";
}
