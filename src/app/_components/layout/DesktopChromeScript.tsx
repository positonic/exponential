// Marks the document with the desktop shell hosting it, as early as possible.
//
// The Electron shell uses the macOS overlay title bar (`hiddenInset`), so the
// traffic lights float over the page's top-left corner — which is the
// sidebar's workspace switcher. CSS reserves room for them off
// `data-titlebar="overlay"`; running here rather than in a client component
// keeps the sidebar from painting in the wrong place and then jumping.
//
// The overlay stamp is Electron-ONLY. The tabbed Tauri shell (ADR-0053) uses
// Safari-style chrome — a visible titlebar with the webview laid out below it —
// and needs no inset at all; it stamps `data-shell` itself from an
// initialization script (`TITLEBAR_MARKER_SCRIPT` in `src-tauri/src/lib.rs`)
// and deliberately does not stamp `data-titlebar`. Stamping overlay here on
// detecting Tauri would resurrect a 38px dead inset in that shell, so don't.
// (Pre-tab Tauri binaries older than PR 482 relied on this fallback for their
// overlay inset; they lose it, and the answer is to update the app.)
//
// Detection mirrors `~/lib/platform.ts` and is duplicated as a string on
// purpose: this runs in <head>, ahead of any bundle.
//
// It retries because a single early check is not enough: Electron's preload
// defines `window.electron` before any page script, but on a slow bridge the
// first check can still miss. Marking twice is harmless — same values.
export function DesktopChromeScript() {
  const script = `
    (function () {
      function mark() {
        var shell = window.__TAURI_INTERNALS__ ? 'tauri'
          : (window.electron ? 'electron' : null);
        if (!shell) return false;
        var root = document.documentElement;
        root.setAttribute('data-shell', shell);
        // Overlay inset is Electron-only (macOS arrangement); the tabbed Tauri
        // shell sits below a real titlebar and must NOT get the inset.
        if (shell === 'electron' && /Mac/i.test(navigator.userAgent)) {
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
