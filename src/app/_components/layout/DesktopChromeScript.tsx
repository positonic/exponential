// Marks the document with the desktop shell hosting it, as early as possible.
//
// Both shells use the macOS overlay title bar (Electron `hiddenInset`, Tauri
// `TitleBarStyle::Overlay`), so the traffic lights float over the page's
// top-left corner — which is the sidebar's workspace switcher. CSS reserves
// room for them off `data-titlebar="overlay"`; running here rather than in a
// client component keeps the sidebar from painting in the wrong place and then
// jumping.
//
// Detection mirrors `~/lib/platform.ts` and is duplicated as a string on
// purpose: this runs in <head>, ahead of any bundle.
//
// It retries because a single early check is not enough. Electron's preload
// defines `window.electron` before any page script, but Tauri injects
// `__TAURI_INTERNALS__` into a *remote* page after the document's own head
// scripts have run — so the first check finds nothing, and the shipped version
// of this file gave up there and left the inset at 0px. The bug was invisible:
// IPC worked moments later, so nothing else looked wrong.
//
// The Tauri shell now stamps the attributes itself from an initialization
// script (see `TITLEBAR_MARKER_SCRIPT` in `src-tauri/src/lib.rs`), which is the
// race-free path. These retries stay as the fallback for a shell binary older
// than that change, and for Electron. Marking twice is harmless — same values.
export function DesktopChromeScript() {
  const script = `
    (function () {
      function mark() {
        var shell = window.__TAURI_INTERNALS__ ? 'tauri'
          : (window.electron ? 'electron' : null);
        if (!shell) return false;
        var root = document.documentElement;
        root.setAttribute('data-shell', shell);
        // The overlay title bar is a macOS arrangement; other platforms keep
        // their native chrome and need no inset.
        if (/Mac/i.test(navigator.userAgent)) {
          root.setAttribute('data-titlebar', 'overlay');
        }
        return true;
      }

      try {
        if (mark()) return;
        // Bounded: a shell that has not identified itself within ~2s of load
        // is not going to, and we stop rather than poll forever.
        var tries = 0;
        var timer = setInterval(function () {
          if (mark() || ++tries > 40) clearInterval(timer);
        }, 50);
        document.addEventListener('DOMContentLoaded', mark);
        window.addEventListener('load', mark);
      } catch (e) {}
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
