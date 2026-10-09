import type { Editor } from "@tiptap/core";
import type { Fragment } from "@tiptap/pm/model";

/**
 * Markdown for whatever is selected in the editor — the "Copy as Markdown"
 * bubble-menu control.
 *
 * Plain Cmd-C deliberately puts *text* on `text/plain` (see
 * {@link ../prd/plain-text-clipboard}) and the formatted slice on `text/html`.
 * This is the third, explicit route, for pasting into a Markdown **source**
 * target — a README, an issue body, an agent prompt.
 *
 * Nodes with no Markdown spec (table rows and cells) still come out as the
 * inline HTML that tiptap-markdown falls back to. That is valid Markdown and
 * the only lossless option for them, so it is left as-is here; it is only on
 * the plain-text flavour that it was wrong.
 */
export function selectionToMarkdown(editor: Editor | null): string | null {
  if (!editor) return null;

  const { selection } = editor.state;
  if (selection.empty) return null;

  const storage = editor.storage.markdown as
    | { serializer?: { serialize: (content: Fragment) => string } }
    | undefined;
  const serializer = storage?.serializer;
  if (!serializer) return null;

  // Block serializers emit trailing blank lines; a clipboard payload wants
  // neither those nor the leading indent of a partial block.
  const markdown = serializer.serialize(selection.content().content).trim();

  return markdown || null;
}
