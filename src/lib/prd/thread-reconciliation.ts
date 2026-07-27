import type { JSONContent } from "@tiptap/core";

/**
 * Thread reconciliation — the pure classifier that reconciles the PRD document
 * against its {@link FeatureComment} rows (ADR-0024 §Modules). A comment thread
 * is one of:
 *
 *  - **anchored** — its `comment` mark is still present in the document, so the
 *    highlight is glued to live text.
 *  - **orphaned** — the marked text was deleted; the mark is gone. The thread is
 *    kept (never lost) and rendered from its `quotedText` snapshot.
 *  - **resolved** — explicitly settled (`resolvedAt` set); collapsed and its
 *    highlight hidden. Resolution wins over anchored/orphaned.
 *
 * Pure and DOM-free: it walks the ProseMirror JSON for `comment` marks and
 * groups the rows, so it is unit-testable in isolation and reusable on client
 * and server.
 */
export type ThreadStatus = "anchored" | "orphaned" | "resolved";

export interface ReconcilableComment {
  id: string;
  threadId: string | null;
  parentId: string | null;
  quotedText: string | null;
  resolvedAt: Date | null;
}

export interface ReconciledThread<C extends ReconcilableComment> {
  threadId: string;
  status: ThreadStatus;
  /** Whether the comment mark is still present in the document. */
  anchored: boolean;
  /** Snapshot of the originally-selected text (for orphan rendering). */
  quotedText: string | null;
  /** Root comment (no parent) plus its replies, in input order. */
  comments: C[];
  root: C;
}

/** Collect every `threadId` referenced by a `comment` mark in the document. */
export function collectAnchoredThreadIds(
  doc: JSONContent | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  const walk = (node: JSONContent | undefined) => {
    if (!node) return;
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "comment") {
          const threadId = (mark.attrs as { threadId?: unknown } | undefined)
            ?.threadId;
          if (typeof threadId === "string" && threadId) ids.add(threadId);
        }
      }
    }
    if (node.content) {
      for (const child of node.content) walk(child);
    }
  };
  walk(doc ?? undefined);
  return ids;
}

export function reconcileThreads<C extends ReconcilableComment>(
  doc: JSONContent | null | undefined,
  comments: C[],
): ReconciledThread<C>[] {
  const anchoredIds = collectAnchoredThreadIds(doc);

  const groups = new Map<string, C[]>();
  for (const comment of comments) {
    if (!comment.threadId) continue; // doc-level comments are a future concern
    const arr = groups.get(comment.threadId) ?? [];
    arr.push(comment);
    groups.set(comment.threadId, arr);
  }

  const result: ReconciledThread<C>[] = [];
  for (const [threadId, group] of groups) {
    const root = group.find((c) => !c.parentId) ?? group[0];
    if (!root) continue;
    const anchored = anchoredIds.has(threadId);
    const resolved = group.some((c) => !c.parentId && c.resolvedAt != null);
    const status: ThreadStatus = resolved
      ? "resolved"
      : anchored
        ? "anchored"
        : "orphaned";
    result.push({
      threadId,
      status,
      anchored,
      quotedText: root.quotedText,
      comments: group,
      root,
    });
  }
  return result;
}
