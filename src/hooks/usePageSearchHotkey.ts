"use client";

import { useEffect, type RefObject } from "react";

/**
 * Binds ⌘F / Ctrl+F to a page's own search box.
 *
 * Deliberately a raw `keydown` listener rather than Mantine's `useHotkeys`:
 * that helper ignores events originating from `INPUT`/`TEXTAREA`/`SELECT`, so
 * pressing ⌘F while already inside the search box would fall through to the
 * browser's native find bar instead of re-selecting the query.
 *
 * ⌘K is *not* used here — it belongs to the global CommandPalette.
 */
export function usePageSearchHotkey(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "f" && event.key !== "F") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      // Leave ⌘⇧F / ⌘⌥F alone — those are browser/OS bindings.
      if (event.shiftKey || event.altKey) return;

      const input = ref.current;
      // No box on screen (hidden tab, unmounted view) — let the browser have it.
      if (!input || input.getClientRects().length === 0) return;

      // A modal/drawer is focused on top of the page: hijacking ⌘F to focus a
      // search box the user cannot even see would be worse than native find.
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active !== input &&
        active.closest('[aria-modal="true"]')
      ) {
        return;
      }

      event.preventDefault();
      input.focus();
      input.select();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ref]);
}
