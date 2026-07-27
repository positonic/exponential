import "server-only";

import type { JSONContent } from "@tiptap/core";
import { Window } from "happy-dom";

import { markdownToDoc } from "~/lib/prd/codec";

/**
 * Server-side Markdown → ProseMirror JSON, for API writes that carry only the
 * Markdown projection (CLI/SDK/agents updating `Feature.description`). Without
 * this, a Markdown-only write silently diverges from the canonical
 * `descriptionDoc` (ADR-0024) and the UI keeps rendering the stale doc forever.
 *
 * The codec needs a DOM (it spins up a headless Tiptap editor), which the
 * server lacks. Rather than duplicating the tiptap-markdown parse pipeline,
 * this installs happy-dom globals around the conversion so the *exact* client
 * codec runs — the server and the browser can never disagree on the schema.
 *
 * Safety of the global swap: the entire install → convert → restore sequence
 * is synchronous, so on Node's single thread no concurrent request (or SSR
 * render checking `typeof window`) can observe the temporary globals. Keep it
 * that way — never `await` inside {@link withDom}.
 */

/**
 * The globals the headless Editor + tiptap-markdown parse path touches. This
 * set is validated by the unit tests, which run the conversion across every
 * PRD node type (headings, task lists, tables, block images, code blocks).
 */
const DOM_GLOBALS = [
  "window",
  "document",
  "navigator",
  "Node",
  "Element",
  "HTMLElement",
  "SVGElement",
  "Text",
  "Comment",
  "DocumentFragment",
  "DOMParser",
  "MutationObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "CustomEvent",
  "KeyboardEvent",
  "MouseEvent",
  "InputEvent",
  "ClipboardEvent",
  "DragEvent",
  "Range",
] as const;

function withDom<T>(fn: () => T): T {
  const win = new Window();
  // Some of these exist on globalThis as accessor properties (e.g. Node ships
  // a getter-only `navigator`), so plain assignment would throw. Swap via
  // property descriptors and restore the original descriptor afterwards.
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const key of DOM_GLOBALS) {
    const desc = Object.getOwnPropertyDescriptor(globalThis, key);
    if (desc && !desc.configurable) {
      // `window`/`document` are what the codec actually renders through — if
      // they exist and can't be swapped, the conversion would silently use
      // the wrong DOM. Fail loudly instead. The rest of the list is
      // quirk-detection surface where the ambient value is tolerable.
      if (key === "window" || key === "document") {
        throw new Error(
          `Cannot install temporary DOM: globalThis.${key} exists and is non-configurable`,
        );
      }
      continue;
    }
    saved.set(key, desc);
    Object.defineProperty(globalThis, key, {
      value:
        key === "window"
          ? win
          : (win as unknown as Record<string, unknown>)[key],
      configurable: true,
      writable: true,
      enumerable: desc?.enumerable ?? true,
    });
  }
  try {
    const result = fn();
    // The no-concurrent-observer guarantee holds only while the callback is
    // synchronous. A thenable here means async work started with the
    // temporary globals installed — refuse it loudly so the hazard is caught
    // in tests, not production.
    if (
      result != null &&
      typeof (result as { then?: unknown }).then === "function"
    ) {
      throw new Error(
        "withDom callback must be synchronous - an async callback would leak DOM globals to concurrent requests",
      );
    }
    return result;
  } finally {
    try {
      for (const [key, desc] of saved) {
        if (desc) Object.defineProperty(globalThis, key, desc);
        else delete (globalThis as Record<string, unknown>)[key];
      }
    } finally {
      void win.happyDOM.close();
    }
  }
}

/**
 * Convert a Markdown `description` into the canonical `descriptionDoc` form.
 * Same output as the client's lazy migration ({@link markdownToDoc}) — it *is*
 * that function, run under a throwaway DOM. Comment marks cannot survive (the
 * Markdown projection never carried them), so callers rewriting an existing
 * doc orphan any anchored comment threads — the same trade-off as a full-body
 * rewrite in the editor.
 */
export function markdownToDocServer(
  markdown: string | null | undefined,
): JSONContent {
  return withDom(() => markdownToDoc(markdown));
}
