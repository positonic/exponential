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
        ])
        .setup(|app| {
            resolve_wiki_root(app.handle());
            build_main_window(app.handle())?;

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

/// Create the single app window pointed at the remote web app.
///
/// The window is built here rather than declared in `tauri.conf.json` because the
/// URL is build-dependent (dev server vs production) and a `WebviewUrl::External`
/// in static config cannot express that.
fn build_main_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    let url = app_base_url()
        .parse()
        .unwrap_or_else(|e| panic!("{BASE_URL_ENV} is not a valid URL: {e}"));

    let opener = app.clone();
    let new_window_opener = app.clone();

    let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
        .title("Exponential Beta")
        .inner_size(1400.0, 900.0)
        .min_inner_size(800.0, 600.0)
        // The page is remote and takes a moment to paint; without this the window
        // opens as a white flash before the app's dark surface arrives.
        .background_color(window_background())
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

    // Match the Electron shell's `hiddenInset` chrome: the traffic lights float
    // over the page instead of sitting in a separate title bar.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .traffic_light_position(tauri::LogicalPosition::new(16.0, 16.0));

    builder.build()?;
    Ok(())
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
