/**
 * Page history (ADR-0074). A revision is a snapshot of the page *after* a
 * write — title, Markdown projection, ProseMirror doc, who and why — so any two
 * consecutive rows diff into "what changed", and any row can be restored.
 *
 * Editor autosaves land every few seconds while someone types. Storing each
 * one would make history unreadable, so an "editor" write by the same author
 * within {@link REVISION_FOLD_WINDOW_MS} of the latest editor revision *folds*
 * into it: the row's content moves forward and `updatedAt` advances, nothing is
 * inserted. A revision is therefore an editing session. Markdown-source writes
 * (CLI, MCP, agents), restores and creates never fold: each is one deliberate
 * change and gets its own row.
 *
 * Always call inside the transaction that wrote the page, after the write, so
 * the snapshot is read from the row the caller just committed to.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { createTwoFilesPatch, diffLines } from "diff";
import { markdownBytes } from "~/lib/pages/markdown-outline";

type Db = PrismaClient | Prisma.TransactionClient;

/** `baseline` rows are seeded by the migration for pages that predate history; never written here. */
export type PageRevisionKind = "baseline" | "create" | "editor" | "markdown" | "restore";

/** Editor saves by one author inside this window are one revision. */
export const REVISION_FOLD_WINDOW_MS = 10 * 60 * 1000;

export interface RecordPageRevisionInput {
  pageId: string;
  kind: PageRevisionKind;
  /**
   * Who wrote it. Null for an automated write (an agenda seed, a generated
   * Workspace update): no person wrote that text, so none is named, and the
   * `note` says what did.
   */
  authorId: string | null;
  /** Why the change was made. A note always gets its own row. */
  note?: string | null;
  now?: Date;
}

/**
 * Snapshot the page as it is now. Returns the revision id and whether the
 * write folded into an existing row.
 */
export async function recordPageRevision(
  db: Db,
  input: RecordPageRevisionInput,
): Promise<{ id: string; folded: boolean }> {
  const page = await db.knowledgePage.findUnique({
    where: { id: input.pageId },
    select: { title: true, body: true, bodyDoc: true, source: true, asOf: true, docVersion: true },
  });
  if (!page) {
    throw new Error(`recordPageRevision: page ${input.pageId} not found`);
  }
  const now = input.now ?? new Date();
  const note = input.note?.trim() ? input.note.trim() : null;
  // A null doc is written as SQL NULL (not JSON `null`), matching the page row.
  const bodyDoc =
    page.bodyDoc === null ? Prisma.DbNull : (page.bodyDoc as Prisma.InputJsonValue);

  if (input.kind === "editor" && !note) {
    const latest = await db.knowledgePageRevision.findFirst({
      where: { pageId: input.pageId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, kind: true, authorId: true, note: true, updatedAt: true },
    });
    const foldable =
      latest &&
      latest.kind === "editor" &&
      latest.authorId === input.authorId &&
      !latest.note &&
      now.getTime() - latest.updatedAt.getTime() < REVISION_FOLD_WINDOW_MS;
    if (foldable) {
      await db.knowledgePageRevision.update({
        where: { id: latest.id },
        data: {
          docVersion: page.docVersion,
          title: page.title,
          body: page.body,
          bodyDoc,
          source: page.source,
          asOf: page.asOf,
          bodyBytes: markdownBytes(page.body),
          updatedAt: now,
        },
      });
      return { id: latest.id, folded: true };
    }
  }

  const created = await db.knowledgePageRevision.create({
    data: {
      pageId: input.pageId,
      docVersion: page.docVersion,
      title: page.title,
      body: page.body,
      bodyDoc,
      source: page.source,
      asOf: page.asOf,
      bodyBytes: markdownBytes(page.body),
      kind: input.kind,
      note,
      authorId: input.authorId,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
  return { id: created.id, folded: false };
}

export interface RevisionDiffStats {
  /** Lines present only in `to`. */
  added: number;
  /** Lines present only in `from`. */
  removed: number;
}

export interface RevisionDiff {
  /** A unified diff (`---`/`+++`/`@@` hunks) of the Markdown bodies. Empty when identical. */
  unified: string;
  stats: RevisionDiffStats;
  titleChanged: boolean;
  /** `source` or `asOf` differ between the two snapshots. */
  provenanceChanged: boolean;
}

export interface RevisionSnapshotForDiff {
  label: string;
  title: string;
  body: string | null;
  source?: string | null;
  asOf?: Date | null;
}

/**
 * Line diff of two snapshots' Markdown as a unified patch, plus counts. The
 * patch is what the CLI prints and the history panel colours; agents read it
 * the way they read `git diff`.
 */
export function diffRevisionBodies(
  from: RevisionSnapshotForDiff,
  to: RevisionSnapshotForDiff,
): RevisionDiff {
  const a = from.body ?? "";
  const b = to.body ?? "";
  let added = 0;
  let removed = 0;
  // A missing final newline is not a change anyone wants to review.
  const options = { ignoreNewlineAtEof: true };
  for (const change of diffLines(a, b, options)) {
    if (change.added) added += change.count ?? 0;
    else if (change.removed) removed += change.count ?? 0;
  }
  const unified =
    a === b
      ? ""
      : createTwoFilesPatch(from.label, to.label, a, b, undefined, undefined, {
          ...options,
          context: 3,
        });
  return {
    unified,
    stats: { added, removed },
    titleChanged: from.title !== to.title,
    provenanceChanged:
      (from.source ?? null) !== (to.source ?? null) ||
      (from.asOf?.getTime() ?? null) !== (to.asOf?.getTime() ?? null),
  };
}
