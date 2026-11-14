import type { PrismaClient } from "@prisma/client";
import { PAGE_ENTITY_TYPE } from "~/server/services/activity/pageActivity";
import { recordActivity } from "~/server/services/activity/recordActivity";

export interface RecordPageActivityInput {
  pageId: string;
  action: "created" | "updated";
  /**
   * Who wrote it. Null for an automated write (an agenda seed, a generated
   * Workspace update): nobody did that, so the feed says nothing.
   */
  authorId: string | null;
}

/**
 * Record that someone created or edited a page, for the activity feed.
 *
 * Callers pass every write that produced a *new* page revision. Page history
 * already folds an author's editor autosaves inside its window into one
 * revision (`recordPageRevision` returns `folded: true`), and a folded save is
 * not passed here — so the feed gets one "edited" row per editing session and
 * agrees with history on what a session is. A Markdown write (CLI, MCP, an
 * agent) never folds, so each one is a row.
 *
 * Nothing is recorded for:
 * - a write with no author;
 * - a database Row (`databaseId` set): a table cell, not a page someone wrote.
 *
 * The event carries the page's title, and a page can be private. That is safe
 * because every feed reader checks page access when it is read
 * (`services/activity/pageActivity.ts`).
 *
 * Call it after the write has committed, never inside its transaction: a
 * failed insert there would abort the transaction and lose the page write.
 * Instrumentation only — it never throws.
 */
export async function recordPageActivity(
  db: PrismaClient,
  input: RecordPageActivityInput,
): Promise<void> {
  if (!input.authorId) return;
  try {
    const page = await db.knowledgePage.findUnique({
      where: { id: input.pageId },
      select: { title: true, workspaceId: true, databaseId: true },
    });
    if (!page || page.databaseId) return;

    await recordActivity(db, {
      workspaceId: page.workspaceId,
      userId: input.authorId,
      entityType: PAGE_ENTITY_TYPE,
      entityId: input.pageId,
      action: input.action,
      metadata: { title: page.title },
    });
  } catch (error) {
    console.error("[recordPageActivity] failed", {
      pageId: input.pageId,
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
