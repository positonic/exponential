"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keyboard bindings for stepping through a list of entities — the peek drawers
 * (tickets, features) and the ticket detail page all share this so the same
 * keys mean the same thing wherever you are.
 *
 *   j / k       previous / next. Ignored while typing.
 *   ⌃⌘← / ⌃⌘→   same, but works everywhere including mid-sentence.
 *
 * The chord is Control+Command because every simpler arrow combination is
 * already spoken for on macOS: ⌘arrow is browser Back/Forward (and line
 * start/end while typing), ⌥arrow moves by word, ⌘⌥arrow switches browser tabs,
 * ⌃arrow switches Spaces, and fn⌃arrow tiles windows. Modifiers are matched
 * exactly, so plain ⌘arrow still reaches the browser as Back/Forward.
 */
export const LIST_NAV_KEYS = { prev: "j", next: "k" } as const;

/** Tooltip suffix, so the hint and the binding can't drift apart. */
export const LIST_NAV_HINT = {
  prev: `${LIST_NAV_KEYS.prev} or ⌃⌘←`,
  next: `${LIST_NAV_KEYS.next} or ⌃⌘→`,
} as const;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * True when something above us owns the keyboard.
 *
 * Two separate rules, because the failure modes differ:
 *
 * - An open menu or listbox always wins — it uses the arrow keys for its own
 *   items, and j/k for typeahead. Its items are buttons, so a tag-name filter
 *   would not catch them.
 * - A modal only wins if it isn't *ours*. The peek drawer is itself an
 *   aria-modal container, so a naive check would block the very navigation it
 *   is trying to provide; `root` lets a caller say "this overlay is the one I
 *   live inside".
 *
 * Visibility is tested with getClientRects() rather than offsetParent, which is
 * always null for position:fixed — what every Mantine dropdown is. Presence
 * alone proves nothing either: the ticket page keeps ~8 hidden listboxes
 * mounted at all times.
 *
 * Exported because any window-level key handler needs the same three rules —
 * `usePageSearchHotkey` reuses it rather than growing a second copy that drifts.
 */
export function isOverlayBlocking(root: HTMLElement | null): boolean {
  const visible = (el: HTMLElement) =>
    el.getAttribute("aria-hidden") !== "true" && el.getClientRects().length > 0;

  for (const el of document.querySelectorAll<HTMLElement>(
    '[role="menu"], [role="listbox"]',
  )) {
    if (visible(el)) return true;
  }

  for (const el of document.querySelectorAll<HTMLElement>(
    '[aria-modal="true"]',
  )) {
    if (!visible(el)) continue;
    if (root && el.contains(root)) continue; // the container we live in
    return true;
  }

  return false;
}

export function useListNavHotkeys({
  onPrev,
  onNext,
  enabled = true,
  root,
}: {
  /** Omit to render the boundary as a no-op (e.g. first item in the list). */
  onPrev?: () => void;
  onNext?: () => void;
  enabled?: boolean;
  /** The modal/drawer this consumer lives inside, if any. See isOverlayBlocking. */
  root?: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const chord = e.ctrlKey && e.metaKey && !e.altKey && !e.shiftKey;
      const bare =
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

      let dir: "prev" | "next" | null = null;
      if (chord && e.key === "ArrowLeft") dir = "prev";
      else if (chord && e.key === "ArrowRight") dir = "next";
      else if (bare && e.key === LIST_NAV_KEYS.prev) dir = "prev";
      else if (bare && e.key === LIST_NAV_KEYS.next) dir = "next";
      if (!dir) return;

      // The chord is the one that deliberately works while typing.
      if (bare && isTypingTarget(e.target)) return;
      if (isOverlayBlocking(root?.current ?? null)) return;

      const handler = dir === "prev" ? onPrev : onNext;
      if (!handler) return;

      e.preventDefault();
      // Commit field-level onBlur handlers (the ticket title saves that way)
      // before the entity swaps underneath the open editor.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      handler();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onPrev, onNext, root]);
}
