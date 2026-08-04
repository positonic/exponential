//! Exponential Beta — the Tauri v2 macOS shell.
//!
//! The shell is deliberately thin: it opens one window on the *remote* production
//! web app (`https://exponential.im`, or the local dev server in debug builds) and
//! exposes a small set of native commands to that remote origin over Tauri IPC.
//!
//! That last part was the load-bearing assumption of the whole design, and it
//! holds: a release build loading `https://exponential.im` can invoke
//! `desktop_shell_info` and get a result back. Two things had to line up, and
//! both are easy to get wrong when adding commands later:
//!
//!   1. `capabilities/remote.json` must list the page's origin under
//!      `remote.urls` — without it the webview gets no usable bridge. Note the
//!      apex domain 301s to `www`, so the *effective* origin is the redirect
//!      target; both are listed.
//!   2. Every app command must be declared in `build.rs` (which autogenerates an
//!      `allow-<name>` permission) *and* granted in the capability. Remote
//!      origins do not get app commands for free the way a bundled frontend
//!      does — an ungranted command fails with "not allowed by ACL".
//!
//! `desktop_shell_info` stays as the smallest round-trip a page can make to
//! confirm it is talking to the shell.

mod auth;
mod source;
mod wiki;

use std::sync::OnceLock;

use serde::Serialize;
use tauri::{Manager, Url};
use tauri_plugin_deep_link::DeepLinkExt;

/// Production origin the packaged shell loads.
const PROD_URL: &str = "https://exponential.im";
/// Dev origin — `next dev`, matching the Electron shell's DEV_URL.
const DEV_URL: &str = "http://localhost:3000";

/// Escape hatch mirroring the Electron shell's `ELECTRON_PROD_URL`: point a
/// packaged build at another origin. Its main use is testing deep-link sign-in,
/// which macOS only routes for a bundled `.app` — so the flow cannot be exercised
/// by a debug build at all, and a release build has to be aimed somewhere safe.
///
/// It is not a way to trust a new origin: the IPC bridge is granted by
/// `capabilities/remote.json`, so an origin that isn't listed there loads as an
/// inert web page with no shell commands.
const BASE_URL_ENV: &str = "EXPONENTIAL_BETA_URL";

/// Origin this build loads and trusts. Debug builds point at the dev server so a
/// developer build can never silently drive production.
pub fn app_base_url() -> &'static str {
    static BASE_URL: OnceLock<String> = OnceLock::new();
    BASE_URL.get_or_init(|| {
        let default = if cfg!(debug_assertions) { DEV_URL } else { PROD_URL };
        std::env::var(BASE_URL_ENV)
            .ok()
            .map(|value| value.trim_end_matches('/').to_owned())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| default.to_owned())
    })
}

/// What the web app learns about the shell it is running inside.
#[derive(Debug, Serialize)]
pub struct ShellInfo {
    /// Always `"tauri"` — lets the page distinguish us from the Electron shell.
    pub shell: &'static str,
    /// Shell version (the Tauri crate's package version, not the web app's).
    pub version: &'static str,
    /// Origin this build is pinned to. Handy when debugging a dev/prod mix-up.
    pub base_url: &'static str,
}

/// Liveness probe for the remote-domain IPC bridge.
///
/// Deliberately side-effect free: a page can call it at any time, and a successful
/// return is proof that the capability in `capabilities/remote.json` is in force
/// for this origin.
#[tauri::command]
fn desktop_shell_info() -> ShellInfo {
    ShellInfo {
        shell: "tauri",
        version: env!("CARGO_PKG_VERSION"),
        base_url: app_base_url(),
    }
}

/// SPIKE (cool.lark) — throwaway. The shell has run Tauri's default menu until
/// now, and the tab shortcuts do not survive that.
///
/// AppKit is supposed to inject Show Next/Previous Tab into whatever submenu is
/// registered as `NSApp.windowsMenu`, and the preconditions all hold — tao
/// leaves `allowsAutomaticWindowTabbing` on, and Tauri does call
/// `set_as_windows_menu_for_nsapp` for the submenu tagged `WINDOW_SUBMENU_ID`.
/// The items still never reached the keyboard, so they are declared explicitly
/// here. The actions are AppKit's own, so the behaviour is Safari's — cycling
/// wraps, the overview is the real overview — rather than a reimplementation.
///
/// Built by *extending* `Menu::default`, never by constructing a menu from
/// scratch. A fresh menu has no submenu carrying `WINDOW_SUBMENU_ID`, so
/// `set_as_windows_menu_for_nsapp` never fires and macOS silently loses the
/// window list and its tab handling. Adding a tab shortcut that way would remove
/// the others.
///
/// Cross-platform on purpose, even though tabs are macOS-only: Copy Page URL is
/// wanted everywhere the shell might run, and `CmdOrCtrl` resolves per platform.
/// (Linux's default menu has no File submenu, so the item is macOS/Windows —
/// acceptable for a shell that only targets macOS today.)
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem};

    let menu = Menu::default(app)?;

    // ⌘L. Safari focuses the address bar; with no address bar, copying the URL
    // is the useful half of the gesture.
    let copy_url = MenuItem::with_id(
        app,
        "copy-url",
        "Copy Page URL",
        true,
        Some("CmdOrCtrl+L"),
    )?;
    if let Some(file) = submenu_named(&menu, "File") {
        file.insert(&copy_url, 0)?;
    }

    #[cfg(target_os = "macos")]
    {
        use tauri::menu::PredefinedMenuItem;

        let new_tab = MenuItem::with_id(app, "new-tab", "New Tab", true, Some("CmdOrCtrl+T"))?;
        let next_tab = MenuItem::with_id(app, "next-tab", "Show Next Tab", true, Some("Ctrl+Tab"))?;
        let prev_tab = MenuItem::with_id(
            app,
            "prev-tab",
            "Show Previous Tab",
            true,
            Some("Ctrl+Shift+Tab"),
        )?;
        let overview = MenuItem::with_id(
            app,
            "tab-overview",
            "Show All Tabs",
            true,
            Some("CmdOrCtrl+Shift+Backslash"),
        )?;

        // New Tab sits above Close Window in File, where Safari puts it.
        if let Some(file) = submenu_named(&menu, "File") {
            file.insert(&new_tab, 0)?;
        }

        if let Some(window) = menu
            .get(tauri::menu::WINDOW_SUBMENU_ID)
            .and_then(|item| item.as_submenu().cloned())
        {
            window.append(&PredefinedMenuItem::separator(app)?)?;
            window.append(&next_tab)?;
            window.append(&prev_tab)?;
            window.append(&overview)?;
        }
    }

    Ok(menu)
}

/// The default menu gives its submenus no ids except Window and Help, so File
/// has to be found by the label the user reads.
fn submenu_named(
    menu: &tauri::menu::Menu<tauri::Wry>,
    name: &str,
) -> Option<tauri::menu::Submenu<tauri::Wry>> {
    menu.items().ok()?.into_iter().find_map(|item| {
        let submenu = item.as_submenu()?;
        (submenu.text().ok()? == name).then(|| submenu.clone())
    })
}

pub fn run() {
    tauri::Builder::default()
        // Single-instance must be registered first (plugin's own requirement).
        // A second launch focuses the running window rather than opening a rival
        // one that would not hold the in-flight login's PKCE verifier.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .menu(build_menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "copy-url" => copy_current_url(app),
            #[cfg(target_os = "macos")]
            "new-tab" => tabs::open(app),
            #[cfg(target_os = "macos")]
            "next-tab" => tabs::select_next(app),
            #[cfg(target_os = "macos")]
            "prev-tab" => tabs::select_previous(app),
            #[cfg(target_os = "macos")]
            "tab-overview" => tabs::toggle_overview(app),
            _ => {}
        })
        .manage(auth::LoginState::default())
        .manage(wiki::WikiRoot::default())
        .invoke_handler(tauri::generate_handler![
            desktop_shell_info,
            auth::desktop_start_login,
            auth::desktop_get_pending_auth,
            wiki::wiki_init,
            wiki::wiki_list_pages,
            wiki::wiki_read_page,
            wiki::wiki_write_page,
            wiki::wiki_commit_turn,
            wiki::wiki_search,
            wiki::wiki_get_root,
            wiki::wiki_status,
            source::wiki_fetch_url,
            source::wiki_read_external,
        ])
        .setup(|app| {
            resolve_wiki_root(app.handle());
            let _main = build_main_window(app.handle())?;
            #[cfg(target_os = "macos")]
            {
                install_tab_key_monitor(app.handle());
                install_plus_button(app.handle(), &_main);
            }
            // SPIKE (cool.lark) — throwaway. Second window sharing the tabbing
            // identifier, so a release build opens with a native tab bar and the
            // two questions can be looked at. Delete with the rest of the spike.
            spike_second_window(app.handle())?;

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    auth::handle_callback(&handle, &url);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Exponential Beta");
}

/// Settle where the wiki lives, once, at startup.
///
/// Resolving here rather than per-call means the root cannot change underneath a
/// turn that is halfway through reading and writing pages. The resolved value is
/// written back to the store so the choice survives a restart — including a
/// first run, where it pins the default rather than leaving it implicit and
/// liable to move if the default ever changes.
fn resolve_wiki_root(app: &tauri::AppHandle) {
    use tauri_plugin_store::StoreExt;

    let stored = app
        .store(wiki::STORE_FILE)
        .ok()
        .and_then(|store| store.get(wiki::STORE_KEY))
        .and_then(|value| value.as_str().map(str::to_owned));

    let root = wiki::resolve_root(stored);

    if let Ok(store) = app.store(wiki::STORE_FILE) {
        store.set(wiki::STORE_KEY, root.to_string_lossy().to_string());
        // Best-effort: a wiki that works but forgets its location next launch
        // beats refusing to start.
        if let Err(e) = store.save() {
            eprintln!("[wiki] could not persist the wiki root: {e}");
        }
    }

    *app.state::<wiki::WikiRoot>()
        .0
        .lock()
        .expect("wiki root mutex poisoned") = Some(root);
}

/// Tells the page it is inside this shell.
///
/// The page cannot reliably work this out for itself. It used to sniff
/// `window.__TAURI_INTERNALS__` from an inline `<head>` script, but on a remote
/// page that global lands *after* the document's own head scripts run — so the
/// check was made too early, found nothing, and the marking was silently
/// skipped. IPC worked fine a moment later, which is what made the bug so
/// quiet. An initialization script has no such race; `documentElement` may not
/// exist yet at injection time, hence the `DOMContentLoaded` retry.
///
/// With the Safari-style chrome this stamps only `data-shell` — the overlay-era
/// `data-titlebar` marking (and the 38px sidebar inset it switched on) is
/// deliberately gone, because the page no longer sits under any chrome.
#[cfg(target_os = "macos")]
const TITLEBAR_MARKER_SCRIPT: &str = r#"
(function () {
  function mark() {
    var root = document && document.documentElement;
    if (!root) return false;
    root.setAttribute('data-shell', 'tauri');
    // Deliberately NOT stamping data-titlebar="overlay": with the Safari-style
    // visible titlebar the page starts below the chrome, so the 38px inset that
    // attribute switches on in sidebar.css would be pure dead space.
    return true;
  }
  try {
    if (!mark()) {
      document.addEventListener('DOMContentLoaded', mark);
    }
  } catch (e) {}
})();
"#;

/// Non-macOS shells keep their native chrome, so there is nothing to mark.
#[cfg(not(target_os = "macos"))]
const TITLEBAR_MARKER_SCRIPT: &str = "";

/// Create the single app window pointed at the remote web app.
///
/// The window is built here rather than declared in `tauri.conf.json` because the
/// URL is build-dependent (dev server vs production) and a `WebviewUrl::External`
/// in static config cannot express that.
fn build_main_window(app: &tauri::AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    build_window(app, "main")
}

/// SPIKE (cool.lark) — throwaway. A second tab at startup, so the build opens
/// with a tab bar to inspect and the capability glob (`"windows": ["main",
/// "tab-*"]`, also spike-only) gets exercised: if the bridge reaches the second
/// window, `desktop_shell_info` answers from inside a tab.
///
/// The shared tabbing identifier alone is not enough to produce a tab. It makes
/// windows *tabbable*; AppKit only merges them on its own when the user's global
/// `AppleWindowTabbingMode` is `always`, and Apple ships that preference
/// defaulting to "In Full Screen Only". Left there, the second window opens as a
/// plain window behind the first and there is no tab bar at all — which is
/// exactly what the first spike build showed. `tabs::open` goes through
/// `-[NSWindow addTabbedWindow:ordered:]`, which merges deterministically.
fn spike_second_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    tabs::open(app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    Ok(())
}

/// SPIKE (cool.lark) — throwaway. Tab commands, sent to whichever window is
/// frontmost.
///
/// `selectNextTab:`, `selectPreviousTab:` and `toggleTabOverview:` are AppKit's
/// own actions, so the behaviour is Safari's by construction — cycling wraps,
/// the overview is the real overview — rather than something reimplemented and
/// approximately right.
#[cfg(target_os = "macos")]
mod tabs {
    use objc2::runtime::AnyObject;

    /// Labels are `tab-<n>` to match the capability glob. Nothing reads them.
    static NEXT_LABEL: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(1);

    pub fn next_label() -> String {
        let n = NEXT_LABEL.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        format!("tab-{n}")
    }

    fn ns_window(window: &tauri::WebviewWindow) -> Option<*mut AnyObject> {
        window.ns_window().ok().map(|ptr| ptr as *mut AnyObject)
    }

    pub fn select_next(app: &tauri::AppHandle) {
        if let Some(ns) = super::frontmost_window(app).as_ref().and_then(ns_window) {
            unsafe {
                let _: () = objc2::msg_send![ns, selectNextTab: std::ptr::null::<AnyObject>()];
            }
        }
    }

    pub fn select_previous(app: &tauri::AppHandle) {
        if let Some(ns) = super::frontmost_window(app).as_ref().and_then(ns_window) {
            unsafe {
                let _: () = objc2::msg_send![ns, selectPreviousTab: std::ptr::null::<AnyObject>()];
            }
        }
    }

    pub fn toggle_overview(app: &tauri::AppHandle) {
        if let Some(ns) = super::frontmost_window(app).as_ref().and_then(ns_window) {
            unsafe {
                let _: () = objc2::msg_send![ns, toggleTabOverview: std::ptr::null::<AnyObject>()];
            }
        }
    }

    /// Open a tab in the frontmost window's tab group.
    ///
    /// `addTabbedWindow:` rather than trusting the shared identifier: AppKit only
    /// auto-merges when the user's global `AppleWindowTabbingMode` is `always`,
    /// and Apple's default is "In Full Screen Only" — so without this an ordinary
    /// user gets a detached window and no tab at all.
    pub fn open(app: &tauri::AppHandle) {
        let host = super::frontmost_window(app);
        let Ok(created) = super::build_window(app, &next_label()) else {
            return;
        };
        let (Some(host_ns), Some(created_ns)) =
            (host.as_ref().and_then(ns_window), ns_window(&created))
        else {
            return;
        };
        // NSWindowOrderingMode::Above — new tab lands after the current one.
        unsafe {
            let _: () = objc2::msg_send![host_ns, addTabbedWindow: created_ns, ordered: 1isize];
        }
        let _ = created.set_focus();
    }
}

/// The window the user is looking at, or any window as a fallback.
///
/// The fallback matters at startup and in menu handlers that can fire while no
/// window reports focus; "some window" beats a silently dead menu item.
fn frontmost_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    let windows = app.webview_windows();
    windows
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
        .or_else(|| windows.values().next())
        .cloned()
}

/// Cmd/Ctrl+L. In a browser that focuses the address bar; the shell has no
/// address bar, so it copies the frontmost tab's URL instead — the half of ⌘L
/// people actually want here (grabbing a link to the page they're on).
fn copy_current_url(app: &tauri::AppHandle) {
    use tauri_plugin_clipboard_manager::ClipboardExt;

    let Some(window) = frontmost_window(app) else {
        return;
    };
    let Ok(url) = window.url() else {
        return;
    };
    if let Err(e) = app.clipboard().write_text(url.to_string()) {
        eprintln!("[shell] could not copy the current URL: {e}");
    }
}

/// SPIKE (cool.lark) — throwaway. ⌃Tab / ⌃⇧Tab, caught the way Safari catches
/// them: before the web view sees the key.
///
/// These cannot be menu key equivalents. AppKit matches a non-⌘ equivalent only
/// after the responder chain declines the key, and WKWebView consumes Tab —
/// which is why the menu items alone (previous build) never fired. A local
/// NSEvent monitor runs before dispatch, so it wins regardless of what the
/// webview would do with the key. The menu items stay for discoverability; the
/// monitor swallowing the event just means they are never reached by keyboard.
#[cfg(target_os = "macos")]
fn install_tab_key_monitor(app: &tauri::AppHandle) {
    use objc2::runtime::AnyObject;

    const KEY_DOWN_MASK: u64 = 1 << 10; // NSEventMaskKeyDown
    const SHIFT: u64 = 1 << 17; // NSEventModifierFlagShift
    const CONTROL: u64 = 1 << 18; // NSEventModifierFlagControl
    const OPTION: u64 = 1 << 19; // NSEventModifierFlagOption
    const COMMAND: u64 = 1 << 20; // NSEventModifierFlagCommand
    const TAB_KEY_CODE: u16 = 48;

    let handle = app.clone();
    let block = block2::RcBlock::new(move |event: *mut AnyObject| -> *mut AnyObject {
        let (key_code, flags): (u16, u64) = unsafe {
            (
                objc2::msg_send![event, keyCode],
                objc2::msg_send![event, modifierFlags],
            )
        };
        if key_code == TAB_KEY_CODE && flags & CONTROL != 0 && flags & (COMMAND | OPTION) == 0 {
            if flags & SHIFT != 0 {
                tabs::select_previous(&handle);
            } else {
                tabs::select_next(&handle);
            }
            return std::ptr::null_mut(); // swallowed — the webview never tabs focus
        }
        event
    });

    // The monitor and its block live for the life of the app; there is no
    // teardown moment, so leaking both is the correct lifetime.
    unsafe {
        let _monitor: *mut AnyObject = objc2::msg_send![
            objc2::class!(NSEvent),
            addLocalMonitorForEventsMatchingMask: KEY_DOWN_MASK,
            handler: &*block
        ];
    }
    std::mem::forget(block);
}

/// SPIKE (cool.lark) — throwaway. The `+` at the right end of the tab bar.
///
/// AppKit draws Safari's plus button by itself the moment any responder in the
/// window's chain implements `newWindowForTab:` — the button *is* that check.
/// Neither tao nor tauri implements it, so it is added to the window's own class
/// at runtime, once; the class is tao's window subclass, so every tab gets the
/// button from the same patch.
#[cfg(target_os = "macos")]
static TAB_APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

#[cfg(target_os = "macos")]
fn install_plus_button(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    use objc2::runtime::AnyObject;

    let _ = TAB_APP_HANDLE.set(app.clone());

    extern "C-unwind" fn new_window_for_tab(
        _this: *mut AnyObject,
        _sel: objc2::runtime::Sel,
        _sender: *mut AnyObject,
    ) {
        // Runs on the main thread — AppKit action dispatch, same as a menu item.
        if let Some(app) = TAB_APP_HANDLE.get() {
            tabs::open(app);
        }
    }

    let Ok(ptr) = window.ns_window() else {
        return;
    };
    unsafe {
        let ns = ptr as *mut AnyObject;
        let class: *mut objc2::runtime::AnyClass = objc2::msg_send![ns, class];
        let imp = std::mem::transmute::<
            extern "C-unwind" fn(*mut AnyObject, objc2::runtime::Sel, *mut AnyObject),
            objc2::runtime::Imp,
        >(new_window_for_tab);
        // "v@:@" — returns void, takes self, _cmd, sender.
        objc2::ffi::class_addMethod(class, objc2::sel!(newWindowForTab:), imp, c"v@:@".as_ptr());
    }
}

fn build_window(app: &tauri::AppHandle, label: &str) -> tauri::Result<tauri::WebviewWindow> {
    let url = app_base_url()
        .parse()
        .unwrap_or_else(|e| panic!("{BASE_URL_ENV} is not a valid URL: {e}"));

    let opener = app.clone();
    let new_window_opener = app.clone();

    let builder = tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::External(url))
        // SPIKE (cool.lark) — throwaway. Distinct per window, so the tab bar
        // shows whether AppKit reads the (hidden) window title for its label.
        .title(format!("Exponential Beta — {label}"))
        .inner_size(1400.0, 900.0)
        .min_inner_size(800.0, 600.0)
        // The page is remote and takes a moment to paint; without this the window
        // opens as a white flash before the app's dark surface arrives.
        .background_color(window_background())
        .initialization_script(TITLEBAR_MARKER_SCRIPT)
        .on_navigation(move |url| {
            if stays_in_app(url) {
                return true;
            }
            open_externally(&opener, url.as_str());
            false
        })
        // `target="_blank"` and `window.open` would otherwise spawn a bare second
        // window with no chrome and no way back.
        .on_new_window(move |url, _features| {
            if stays_in_app(&url) {
                return tauri::webview::NewWindowResponse::Allow;
            }
            open_externally(&new_window_opener, url.as_str());
            tauri::webview::NewWindowResponse::Deny
        });

    // SPIKE (cool.lark) — the chrome decision this spike exists to test, and
    // the overlay LOST. Safari-style chrome (a standard titlebar; the web view
    // starts below it) instead of Electron-matching overlay chrome, because on
    // a real build the overlay fought native tabs at every layer:
    //
    //   - `traffic_light_position` shrinks the titlebar container the tab bar
    //     lives in (tao's inset hack re-runs every drawRect:), squashing the
    //     bar and hiding the lights;
    //   - the full-size content view puts the page under the chrome, so
    //     scrolled content and the scrollbar showed through the titlebar row,
    //     fixed-position modals opened under the tab bar, and the transparent
    //     titlebar hit-tested through to the page, leaving the window
    //     undraggable (tauri#9503);
    //   - each had a workaround, and each workaround was another moving part.
    //
    // A visible titlebar dissolves all of it: AppKit lays content below the
    // chrome, dragging/zoom/scrollbars behave natively, and the page needs no
    // inset at all. `hidden_title` keeps the empty titlebar row from drawing a
    // window title over its middle; tab labels are unaffected (they read
    // NSWindow.tab.title, not the titlebar drawing).
    #[cfg(target_os = "macos")]
    let builder = builder
        .hidden_title(true)
        .tabbing_identifier("im.exponential.beta.tabs");

    let window = builder.build()?;
    Ok(window)
}

/// Hand a URL to the user's default browser.
fn open_externally(app: &tauri::AppHandle, url: &str) {
    use tauri_plugin_opener::OpenerExt;
    if let Err(e) = app.opener().open_url(url, None::<&str>) {
        eprintln!("[shell] could not open {url} externally: {e}");
    }
}

/// Should this navigation happen inside the app window, or in the browser?
///
/// Mirrors the Electron shell's `will-navigate` rule. Two things are allowed to
/// stay: the app's own origin, and the OAuth providers — those must complete
/// in-window or the integration flows (Notion, Google, …) would finish in a
/// browser tab the app can never hear back from. Everything else is someone
/// else's website and belongs in the user's real browser.
///
/// Non-http(s) schemes (`about:`, `blob:`, `data:`) are the page's own business
/// and pass through untouched — handing them to the browser would break previews
/// and downloads.
///
/// The obvious worry about keeping providers in-window is whether a page on
/// `accounts.google.com` — or an XSS on one — inherits this window's IPC access
/// and can then call the wiki commands. It does not. Tauri evaluates the
/// capability against the webview's *current* URL, so an origin absent from
/// `remote.urls` gets the injected global but no granted commands. Verified on a
/// release build: navigating this window to `https://github.com` and invoking
/// `desktop_shell_info` returns "Command desktop_shell_info not allowed by ACL".
/// Re-check this if the capability ever gains a wildcard origin.
fn stays_in_app(url: &Url) -> bool {
    if !matches!(url.scheme(), "http" | "https") {
        return true;
    }
    is_app_origin(url) || is_oauth_provider(url)
}

/// OAuth provider hosts, matched on suffix so regional and per-tenant subdomains
/// come along. Same list as the Electron shell.
const OAUTH_PROVIDERS: &[&str] = &[
    "accounts.google.com",
    "discord.com",
    "api.notion.com",
    "github.com",
    "login.microsoftonline.com",
];

fn is_oauth_provider(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    OAUTH_PROVIDERS
        .iter()
        .any(|provider| host == *provider || host.ends_with(&format!(".{provider}")))
}

/// Is this the web app itself?
fn is_app_origin(url: &Url) -> bool {
    app_base_url()
        .parse::<Url>()
        .is_ok_and(|base| same_site(url, &base))
}

/// Same origin, give or take a `www`.
///
/// The apex domain 301s to `www`, so treating the two as different origins would
/// bounce the very first navigation out to the browser and leave an empty shell.
/// Only the leading `www.` is folded — nothing else about the host is relaxed, so
/// a lookalike like `exponential.im.evil.test` still fails.
fn same_site(url: &Url, base: &Url) -> bool {
    fn bare_host(url: &Url) -> &str {
        url.host_str()
            .unwrap_or_default()
            .trim_start_matches("www.")
    }
    url.scheme() == base.scheme()
        && bare_host(url) == bare_host(base)
        && url.port_or_known_default() == base.port_or_known_default()
}

/// Window background behind the remote page.
///
/// Hardcoded here for the same reason `electron/colors.ts` exists: a native API
/// needs a literal colour before any stylesheet has loaded. Must stay in step
/// with `--background-primary` (dark) in `src/styles/colors.ts`.
fn window_background() -> tauri::utils::config::Color {
    tauri::utils::config::Color(0x1a, 0x1b, 0x1e, 0xff)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(raw: &str) -> Url {
        raw.parse().expect("test URL must parse")
    }

    #[test]
    fn the_app_itself_stays_in_the_window() {
        // Debug builds resolve app_base_url() to the dev server.
        assert!(stays_in_app(&url("http://localhost:3000/home")));
        assert!(stays_in_app(&url("http://localhost:3000/w/syntrofi/projects?tab=tasks")));
    }

    #[test]
    fn a_www_redirect_is_still_the_app() {
        // The regression this guards against presents as "the app opens an empty
        // window and launches my browser instead": exponential.im 301s to www.
        let base = url("https://exponential.im");
        assert!(same_site(&url("https://www.exponential.im/home"), &base));
        assert!(same_site(&url("https://exponential.im/home"), &base));
        assert!(same_site(&url("https://exponential.im/home"), &url("https://www.exponential.im")));
    }

    #[test]
    fn folding_www_does_not_relax_anything_else() {
        let base = url("https://exponential.im");
        assert!(!same_site(&url("https://exponential.im.evil.test/"), &base));
        assert!(!same_site(&url("https://notexponential.im/"), &base));
        assert!(!same_site(&url("https://staging.exponential.im/"), &base));
        assert!(!same_site(&url("http://exponential.im/"), &base));
        assert!(!same_site(&url("https://exponential.im:8443/"), &base));
    }

    #[test]
    fn other_websites_go_to_the_browser() {
        assert!(!stays_in_app(&url("https://example.com/")));
        assert!(!stays_in_app(&url("https://exponential.im.evil.test/")));
        assert!(!stays_in_app(&url("https://notexponential.im/")));
    }

    #[test]
    fn oauth_providers_complete_in_window() {
        // Integration connect flows redirect back to the app; sending them to the
        // browser would strand the callback where the app cannot see it.
        assert!(stays_in_app(&url("https://accounts.google.com/o/oauth2/auth")));
        assert!(stays_in_app(&url("https://api.notion.com/v1/oauth/authorize")));
        assert!(stays_in_app(&url("https://login.microsoftonline.com/common/oauth2/authorize")));
    }

    #[test]
    fn a_provider_lookalike_is_not_a_provider() {
        assert!(!stays_in_app(&url("https://github.com.evil.test/")));
        assert!(!stays_in_app(&url("https://evil-github.com/")));
    }

    #[test]
    fn page_internal_schemes_pass_through() {
        assert!(stays_in_app(&url("about:blank")));
        assert!(stays_in_app(&url("blob:http://localhost:3000/abc-123")));
    }
}
