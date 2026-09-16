import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { COMMENT_HIGHLIGHT_CLASS } from "./comment-mark";

/**
 * The highlight of a **pending** comment thread — one started from a selection
 * whose first comment hasn't been posted yet (ADR-0024).
 *
 * A pending thread must never leave a trace in the saved document: the thread
 * itself lives only in React state, so a `comment` mark persisted before the
 * first comment posts becomes a permanent highlight with no thread behind it
 * the moment the user reloads or navigates away. So the pending highlight is a
 * view-only decoration, mapped through edits like a mark would be, and the real
 * `comment` mark is applied only when the first comment is being posted
 * ({@link anchorPendingComment}).
 */
export interface PendingComment {
  threadId: string;
  from: number;
  to: number;
}

type PendingMeta = { type: "set"; pending: PendingComment } | { type: "clear" };

const pendingKey = new PluginKey<PendingComment | null>("prdPendingComment");

export const PendingCommentHighlight = Extension.create({
  name: "pendingCommentHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<PendingComment | null>({
        key: pendingKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(pendingKey) as PendingMeta | undefined;
            if (meta) return meta.type === "set" ? meta.pending : null;
            if (!value || !tr.docChanged) return value;
            // Non-inclusive at both edges, matching the comment mark: typing
            // right before or after the highlight doesn't grow it.
            const from = tr.mapping.map(value.from, 1);
            const to = Math.max(from, tr.mapping.map(value.to, -1));
            return { ...value, from, to };
          },
        },
        props: {
          decorations(state) {
            const pending = pendingKey.getState(state);
            if (!pending || pending.from >= pending.to) return DecorationSet.empty;
            return DecorationSet.create(state.doc, [
              Decoration.inline(pending.from, pending.to, {
                class: COMMENT_HIGHLIGHT_CLASS,
                "data-comment-pending": pending.threadId,
              }),
            ]);
          },
        },
      }),
    ];
  },
});

/** The pending thread and its current (edit-mapped) range, if any. */
export function getPendingComment(state: EditorState): PendingComment | null {
  return pendingKey.getState(state) ?? null;
}

/** Show a pending highlight over `from..to`. Doesn't touch the document. */
export function setPendingComment(editor: Editor, pending: PendingComment): void {
  const { state, view } = editor;
  view.dispatch(state.tr.setMeta(pendingKey, { type: "set", pending } satisfies PendingMeta));
}

/** Drop the pending highlight. Doesn't touch the document. */
export function clearPendingComment(editor: Editor): void {
  const { state, view } = editor;
  view.dispatch(state.tr.setMeta(pendingKey, { type: "clear" } satisfies PendingMeta));
}

/** The pending thread whose highlight covers `pos`, if any. */
export function pendingThreadIdAt(state: EditorState, pos: number): string | null {
  const pending = getPendingComment(state);
  if (!pending || pending.from >= pending.to) return null;
  return pos >= pending.from && pos <= pending.to ? pending.threadId : null;
}

/**
 * Turn the pending highlight for `threadId` into a real `comment` mark over its
 * current range. The decoration stays until {@link clearPendingComment}, so the
 * caller can roll the mark back if the post fails and the highlight survives.
 * Returns false (and leaves the document alone) when there's nothing to anchor —
 * no matching pending thread, or its text was deleted while composing, in which
 * case the thread is simply created orphaned from its quote snapshot.
 */
export function anchorPendingComment(editor: Editor, threadId: string): boolean {
  const { state, view } = editor;
  const pending = getPendingComment(state);
  const markType = state.schema.marks.comment;
  if (!pending || pending.threadId !== threadId || !markType) return false;
  if (pending.from >= pending.to) return false;
  // Kept off the undo stack: the mark is bookkeeping for a comment row, not a
  // user edit, and undoing it would orphan the thread it anchors.
  view.dispatch(
    state.tr
      .addMark(pending.from, pending.to, markType.create({ threadId }))
      .setMeta("addToHistory", false),
  );
  return true;
}

/**
 * The text currently under a thread's `comment` mark — a quote snapshot for
 * threads whose root comment is created after the fact (a highlight whose
 * thread was never posted). Separate marked spans are joined with a space,
 * capped like a fresh selection's snapshot.
 */
export function threadMarkText(doc: PMNode, threadId: string): string {
  const spans: string[] = [];
  let lastEnd = -1;
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return undefined;
    const marked = node.marks.some(
      (m) => m.type.name === "comment" && m.attrs.threadId === threadId,
    );
    if (!marked) return undefined;
    // Adjacent text nodes (split by another mark) are one continuous span.
    if (pos === lastEnd && spans.length > 0) {
      spans[spans.length - 1] += node.text;
    } else {
      spans.push(node.text);
    }
    lastEnd = pos + node.nodeSize;
    return undefined;
  });
  return spans.join(" ").slice(0, 1000);
}
