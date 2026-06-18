import { Editor, type JSONContent } from "@tiptap/core";
import { PRD_EXTENSIONS } from "./extensions";

/**
 * PRD document codec — the pure boundary between the two representations of the
 * PRD body (ADR-0024):
 *
 *  - `descriptionDoc` (ProseMirror JSON) is the **source of truth** the editor
 *    reads and writes.
 *  - `description` (Markdown) is a **derived, write-only projection** for
 *    off-island readers (CLI, agents/SDK, card previews).
 *
 * The invariant: Markdown is written *from* the JSON, one way only, and never
 * read back into the editor. The single exception is the lazy, one-time
 * migration of a legacy `description` into `descriptionDoc` the first time a
 * feature is opened ({@link markdownToDoc}); thereafter the JSON is canonical.
 *
 * Both functions spin up a throwaway headless Tiptap editor. That requires a
 * DOM, so they run in the browser and in unit tests (happy-dom) — never during
 * SSR. Callers must invoke them client-side (e.g. inside an effect).
 */

/** Canonical empty document. */
export const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function withEditor<T>(content: string | JSONContent, fn: (editor: Editor) => T): T {
  const editor = new Editor({
    extensions: PRD_EXTENSIONS,
    content,
  });
  try {
    return fn(editor);
  } finally {
    editor.destroy();
  }
}

/**
 * Markdown → ProseMirror JSON. Used for the one-time lazy migration of a
 * legacy `description` and anywhere we need to seed a doc from Markdown.
 */
export function markdownToDoc(markdown: string | null | undefined): JSONContent {
  if (!markdown || markdown.trim() === "") return EMPTY_DOC;
  return withEditor(markdown, (editor) => editor.getJSON());
}

/**
 * ProseMirror JSON → Markdown. Produces the derived `description` projection.
 * Comment marks (and any other view-only marks) drop cleanly because their
 * markdown spec is empty.
 */
export function docToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc) return "";
  return withEditor(doc, (editor) =>
    (editor.storage.markdown as { getMarkdown: () => string }).getMarkdown(),
  );
}

/** True when the document has no meaningful content (empty or whitespace). */
export function isDocEmpty(doc: JSONContent | null | undefined): boolean {
  if (!doc) return true;
  return docToMarkdown(doc).trim() === "";
}
