import type { ClipboardEvent } from "react";
import { httpUrlOrNull } from "~/lib/safeUrl";

/**
 * Paste-a-URL-over-a-selection for Markdown text fields: select "the spec",
 * paste `https://…`, get `[the spec](https://…)`. The Tiptap editors already
 * do this (Link's linkOnPaste); this brings the same gesture to plain
 * textareas and inputs whose value renders through MarkdownRenderer.
 */

export interface LinkedPaste {
  /** The full field value after the paste. */
  value: string;
  /** The Markdown link that replaces the selection. */
  snippet: string;
  /** Caret position just after the inserted link. */
  cursor: number;
}

/**
 * Returns the linked result, or null when the paste should behave normally:
 * nothing selected, the clipboard isn't a single http(s) URL, or the
 * selection is itself a URL (pasting a URL over a URL replaces it).
 */
export function linkSelectionOnPaste(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  pasted: string,
): LinkedPaste | null {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  if (start === end) return null;

  const url = pasted.trim();
  if (/\s/.test(url) || !httpUrlOrNull(url)) return null;

  const selected = value.slice(start, end);
  // A blank line ends a Markdown paragraph, so link text can't span one.
  if (!selected.trim() || /\n\s*\n/.test(selected)) return null;
  if (httpUrlOrNull(selected.trim())) return null;

  const text = selected.replace(/([[\]\\])/g, "\\$1");
  // Escape parens in the destination too: an unbalanced one (a truncated
  // `…/Foo_(bar`) would otherwise end the link early and render it as text.
  const destination = url.replace(/([()])/g, "\\$1");
  const snippet = `[${text}](${destination})`;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    snippet,
    cursor: start + snippet.length,
  };
}

/**
 * onPaste handler: links the selection when {@link linkSelectionOnPaste}
 * applies, otherwise leaves the paste alone. Inserts via `insertText` so the
 * browser's undo stack and the field's own onChange both see it; `onLinked`
 * is the fallback for a browser that refuses the command. Skips events an
 * earlier handler (e.g. image paste) already claimed.
 */
export function handleLinkPaste(
  e: ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
  onLinked: (value: string, cursor: number) => void,
): void {
  if (e.defaultPrevented) return;
  const el = e.currentTarget;
  const linked = linkSelectionOnPaste(
    el.value,
    el.selectionStart ?? 0,
    el.selectionEnd ?? 0,
    e.clipboardData.getData("text/plain"),
  );
  if (!linked) return;

  e.preventDefault();
  // execCommand is deprecated but still the only way to edit a field while
  // keeping native undo; every current browser supports insertText.
  if (document.execCommand("insertText", false, linked.snippet)) return;
  onLinked(linked.value, linked.cursor);
  requestAnimationFrame(() => el.setSelectionRange(linked.cursor, linked.cursor));
}
