"use client";

import { useEffect, type RefObject } from "react";
import { isOverlayBlocking } from "~/app/_components/product/useListNavHotkeys";

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
    const isMac =
      typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

    // Either identifier is enough, and both are needed:
    //   `code` is the physical key, so ⌘F still works on a Cyrillic or Greek
    //     layout where `key` arrives as "а".
    //   `key` is the fallback for input paths that leave `code` empty —
    //     synthetic events, on-screen keyboards, some IME and remote-desktop
    //     stacks. Matching on `code` alone silently kills the shortcut there.
    const isFKey = (event: KeyboardEvent) =>
      event.code === "KeyF" || event.key === "f" || event.key === "F";

    const handler = (event: KeyboardEvent) => {
      if (!isFKey(event)) return;
      // Ctrl+F is emacs forward-char on macOS and works in every text field —
      // only ⌘ should trigger there. Elsewhere Ctrl is the find key.
      if (!(isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey)) return;
      // Leave ⌘⇧F / ⌘⌥F alone — those are browser/OS bindings.
      if (event.shiftKey || event.altKey) return;

      const input = ref.current;
      // No box on screen (hidden tab, unmounted view) — let the browser have it.
      if (!input || input.getClientRects().length === 0) return;

      // Something is layered above us — an open Select dropdown, a menu, a
      // modal. Stealing ⌘F would yank focus out of it, or into a search box the
      // user cannot even see. `null` root: this box is never inside an overlay.
      if (isOverlayBlocking(null)) return;

      event.preventDefault();
      input.focus();
      input.select();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ref]);
}
