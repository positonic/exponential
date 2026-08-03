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

use std::sync::OnceLock;

use serde::Serialize;
use tauri::Manager;
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
        .manage(auth::LoginState::default())
        .invoke_handler(tauri::generate_handler![
            desktop_shell_info,
            auth::desktop_start_login,
            auth::desktop_get_pending_auth,
        ])
        .setup(|app| {
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

/// Create the single app window pointed at the remote web app.
///
/// The window is built here rather than declared in `tauri.conf.json` because the
/// URL is build-dependent (dev server vs production) and a `WebviewUrl::External`
/// in static config cannot express that.
fn build_main_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    let url = app_base_url()
        .parse()
        .unwrap_or_else(|e| panic!("{BASE_URL_ENV} is not a valid URL: {e}"));

    let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
        .title("Exponential Beta")
        .inner_size(1400.0, 900.0)
        .min_inner_size(800.0, 600.0);

    // Match the Electron shell's `hiddenInset` chrome: the traffic lights float
    // over the page instead of sitting in a separate title bar.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .traffic_light_position(tauri::LogicalPosition::new(16.0, 16.0));

    builder.build()?;
    Ok(())
}
