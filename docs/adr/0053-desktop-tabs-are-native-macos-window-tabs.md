# Desktop tabs are native macOS window tabs, under Safari-style chrome

## Status

Accepted — 2026-08-04

> Note on numbering: the desktop-tabs PRD and tickets `cool.lark` / `lazy.lake`
> cite this record as "ADR-0052". That number was taken by
> [0052-overdue-cohorts-and-amnesty.md](0052-overdue-cohorts-and-amnesty.md)
> before this file was written; this is the record they mean.

## Context

The Tauri shell (the desktop foray's daily driver) opens exactly one useful
window. Following a link replaces what you were looking at, and anything
stateful — a Zoe canvas mid-answer, a half-typed form — dies on navigation,
because the app is a single route tree in a single webview. The V2 scope of the
desktop feature is tabs.

Constraints: no Tauri `unstable` feature (rules out multi-webview-in-one-window
via `Window::add_child`), the Electron shell is not modified, and the web app
must expose no tab affordance so tabs are unreachable from a browser by
construction.

## Decision

**A tab is a real macOS window tab.** Every tab is its own `WebviewWindow`; all
windows share one `tabbing_identifier`, and AppKit provides the tab bar,
reordering, drag-out, the tab overview, and ⌘W. Each tab is a full live app
instance, which is what makes backgrounded state survive without feature code.

The `cool.lark` spike (built and inspected on release builds, 2026-08-04)
forced three refinements the original design did not anticipate:

1. **Merging must be explicit.** A shared `tabbing_identifier` only makes
   windows *tabbable*; AppKit auto-merges only when the user's global
   `AppleWindowTabbingMode` is `always`, and Apple's default is "In Full Screen
   Only". The shell therefore calls `-[NSWindow addTabbedWindow:ordered:]`
   (via `ns_window()` + `objc2`; neither tao nor tauri wraps it).

2. **The chrome is Safari's, not Electron's.** The shell previously matched
   Electron's `hiddenInset` overlay (`TitleBarStyle::Overlay`,
   `hidden_title`, custom traffic-light position). On a real build the overlay
   lost to the tab bar at every layer: tao implements
   `traffic_light_position` by shrinking the titlebar container the tab bar
   lives in (re-applied every `drawRect:`), so the bar was squashed and the
   lights vanished; the full-size content view put the page under the chrome,
   so scrolled content and the scrollbar showed through the titlebar row,
   fixed-position modals opened underneath the tab bar, and the transparent
   titlebar hit-tested through to the page, leaving the window undraggable
   (tauri#9503). Each symptom had a workaround; the workarounds were a
   machinery. A standard visible titlebar dissolves all of it: AppKit lays the
   web view out *below* the chrome, and drag, zoom, scrollbars, and modals are
   simply correct. `hidden_title(true)` keeps the empty titlebar row from
   drawing a window title; tab labels are unaffected (they read
   `NSWindow.tab.title`). The page-side consequence: the shell no longer
   stamps `data-titlebar="overlay"`, so the 38px sidebar inset stays off and
   the web app needs no inset at all.

3. **Tab keys cannot be menu equivalents, and the menu must be extended, not
   replaced.** AppKit matches non-⌘ key equivalents only after the responder
   chain declines the key, and WKWebView consumes Tab — so ⌃Tab/⌃⇧Tab are
   caught by a local `NSEvent` monitor (before webview dispatch), the way
   Safari does it; the dispatched actions are AppKit's own
   (`selectNextTab:` etc.). The menu is built by extending `Menu::default`:
   a from-scratch menu has no submenu tagged `WINDOW_SUBMENU_ID`, so Tauri
   never registers `NSApp.windowsMenu` and macOS silently loses the window
   list. The tab-bar `+` button is AppKit's own, summoned by implementing
   `newWindowForTab:` on the window class at runtime.

The capability in `capabilities/remote.json` scopes to `["main", "tab-*"]`;
tab windows are labelled `tab-<n>` from a counter, and the glob is the only
place a label shape may be relied on. The `desktop_shell_info` bridge was
verified working from inside a created tab on a release build.

## Consequences

- Backgrounded tabs keep running for free; session is shared (same WKWebView
  data store), so no re-authentication per tab.
- The Tauri shell's chrome now visibly diverges from the Electron shell's.
  Accepted: Electron is expected to be retired, not kept in parity.
- Tab labels all read "Exponential Beta" until URL-derived labels
  (`tab_title`, the V2 ticket's action 2) land.
- macOS-only by design. If a Windows/Linux shell ever happens, native tabbing
  does not exist there and a different mechanism is required.

## Rejected alternatives

- **In-page tabs in the web app** (React or iframe, gated on `isTauri()`): a
  `data-shell` check is a rule every future PR must respect; iframes also cost
  a full app instance each plus duplicated chrome. The native mechanism makes
  "no tabs in a browser" structural.
- **A custom tab strip over multiple webviews in one window**: needs
  `unstable`, plus reimplementing reorder/close/keyboard that AppKit provides.
- **One shared sidebar with tabs swapping only the content pane**
  (Notion-style): not expressible with native window tabs — a macOS tab *is* a
  window — and every in-page route to it was rejected above. Raised and
  declined during the spike.
- **Keeping the overlay chrome and patching around the tab bar**: tried on
  real builds during the spike (measured-inset push, body padding, modal CSS,
  JS drag shim); every patch was another moving part and scroll-under-chrome
  remained. This is the fallback the spike existed to evaluate, and the
  evaluation said no.
- **Reading `document.title` for tab labels**: effectively constant across
  the authenticated app; every tab would read identically.
