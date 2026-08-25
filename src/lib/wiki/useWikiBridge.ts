"use client";

import { useEffect, useState } from "react";

import { getWikiBridge, type WikiBridge } from "~/lib/localWiki";
import { reportHandledError } from "~/lib/reportHandledError";

/**
 * The local wiki bridge for this device, resolved after mount.
 *
 * Resolved in an effect rather than during render because the answer differs
 * between the server (always null) and the Tauri shell, and branching on it
 * during render would hydrate a mismatch. `ready` distinguishes "we have not
 * looked yet" from "we looked and there is no wiki here" — the two want very
 * different UI.
 */
export function useWikiBridge(): { bridge: WikiBridge | null; ready: boolean } {
  const [bridge, setBridge] = useState<WikiBridge | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setBridge(getWikiBridge());
    setReady(true);
  }, []);

  return { bridge, ready };
}

/**
 * Whether this device can host a local wiki at all — for surfaces that only
 * need to know whether to offer it (the sidebar entry), not to talk to it.
 */
export function useLocalWikiAvailable(): boolean {
  return useWikiBridge().bridge !== null;
}

/**
 * Run `refresh` whenever the window regains focus.
 *
 * The librarian writes to the same files this UI is showing, from a chat in
 * another part of the app, and the shell has no change notification yet. Focus
 * is the cheap approximation: come back to the window and you see what the
 * librarian filed.
 */
export function useRefreshOnFocus(refresh: () => void): void {
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
}

/**
 * Run `refresh` whenever the wiki changes on disk, and when the window regains
 * focus.
 *
 * Both, not either. The shell's event is the good signal — the librarian files
 * a page from the chat drawer and the list beside it updates immediately,
 * where before you had to click away and back. Focus stays as the backstop for
 * the changes no event covers: the user editing a page in their own editor, or
 * `git pull` in the wiki folder, neither of which goes through our commands.
 */
export function useRefreshOnWikiChange(bridge: WikiBridge | null, refresh: () => void): void {
  useRefreshOnFocus(refresh);

  useEffect(() => {
    if (!bridge) return;
    try {
      return bridge.onChanged(() => refresh());
    } catch (e) {
      // A view that can't subscribe still works, just at focus speed — so
      // report it rather than letting it take the render down.
      reportHandledError(e, { area: "local-wiki-change-subscription" });
      return;
    }
  }, [bridge, refresh]);
}
