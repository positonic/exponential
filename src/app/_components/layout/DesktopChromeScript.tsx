// Marks the document with the desktop shell hosting it, before first paint.
//
// Both shells use the macOS overlay title bar (Electron `hiddenInset`, Tauri
// `TitleBarStyle::Overlay`), so the traffic lights float over the page's
// top-left corner — which is the sidebar's workspace switcher. CSS reserves
// room for them off `data-titlebar="overlay"`; doing it here rather than in a
// client component keeps the sidebar from painting once in the wrong place and
// then jumping.
//
// Detection mirrors `~/lib/platform.ts` and is duplicated as a string on
// purpose: this runs in <head>, ahead of any bundle. Both globals are injected
// before page scripts (Electron's preload, Tauri's init script), and a miss
// just means no inset — never a broken layout.
export function DesktopChromeScript() {
  const script = `
    try {
      var shell = window.__TAURI_INTERNALS__ ? 'tauri'
        : (window.electron ? 'electron' : null);
      if (shell) {
        var root = document.documentElement;
        root.setAttribute('data-shell', shell);
        // The overlay title bar is a macOS arrangement; other platforms keep
        // their native chrome and need no inset.
        if (/Mac/i.test(navigator.userAgent)) {
          root.setAttribute('data-titlebar', 'overlay');
        }
      }
    } catch (e) {}
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
