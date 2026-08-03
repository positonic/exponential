//! Desktop sign-in: system-browser OAuth returning over the `exponential-beta://`
//! deep link.
//!
//! A port of the Electron shell's flow (`electron/main.ts`), behaviour for
//! behaviour, because it talks to the same server handshake (ADR-0005 in
//! `exponential-ios`). The reason sign-in runs in the *system* browser rather than
//! in-window is unchanged: an embedded webview has no platform authenticator, so
//! Google passkeys cannot complete inside the app.
//!
//! PKCE is what makes the round-trip safe. The verifier is generated here, never
//! leaves this process until the page redeems it, and never appears in a URL — so
//! an auth code intercepted from the deep link is useless on its own. Two rules
//! follow from that and are load-bearing:
//!
//!   * the `{code, verifier}` pair reaches the page over IPC, not as query
//!     parameters, keeping the verifier out of access logs, history and Referer;
//!   * it is one-shot — read once, then dropped.
//!
//! One login may be in flight at a time; starting another abandons the first.

use std::sync::Mutex;

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{Manager, Url};
use tauri_plugin_opener::OpenerExt;

/// URL scheme the server redirects the finished sign-in to. Distinct from the
/// Electron/iOS `exponential://` on purpose: macOS resolves a scheme to a single
/// handler app, so sharing one would make callbacks land in whichever shell the
/// OS picked. Must stay in lockstep with `TAURI_REDIRECT_URI` server-side and
/// with `plugins.deep-link.desktop.schemes` in `tauri.conf.json`.
pub const CALLBACK_SCHEME: &str = "exponential-beta";

/// The full redirect target sent to `/api/auth/native/start`. The server
/// allow-lists this exact string.
const REDIRECT_URI: &str = "exponential-beta://auth/callback";

/// A sign-in we started and are waiting on. `state` is anti-forgery only (not a
/// secret); `verifier` is the secret that PKCE-binds the code to this process.
struct PendingLogin {
    verifier: String,
    state: String,
}

/// The redeemable pair, held between the deep-link callback and `/desktop-auth`
/// collecting it over IPC.
#[derive(Clone, Serialize)]
#[cfg_attr(test, derive(PartialEq, Eq))]
#[serde(rename_all = "camelCase")]
pub struct PendingAuth {
    pub code: String,
    pub verifier: String,
}

impl std::fmt::Debug for PendingAuth {
    /// Redacted on purpose. The verifier travels over IPC rather than in a URL
    /// precisely so it never reaches a log; an accidental `{:?}` would undo that.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PendingAuth { code: <redacted>, verifier: <redacted> }")
    }
}

/// Sign-in state for the app. Registered as Tauri managed state.
#[derive(Default)]
pub struct LoginState {
    pending_login: Mutex<Option<PendingLogin>>,
    pending_auth: Mutex<Option<PendingAuth>>,
}

/// 32 random bytes → 43 base64url chars, matching the server's PKCE sizing.
fn random_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("OS randomness must be available");
    URL_SAFE_NO_PAD.encode(bytes)
}

/// PKCE S256: base64url(sha256(verifier)).
fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// Begin sign-in: mint a PKCE pair, remember it, and hand the user to the system
/// browser. Resolves once the browser has been opened, not when sign-in finishes.
#[tauri::command]
pub fn desktop_start_login(app: tauri::AppHandle) -> Result<(), String> {
    let verifier = random_token();
    let state = random_token();
    let auth_url = format!(
        "{}/api/auth/native/start?code_challenge={}&state={}&redirect_uri={}",
        crate::app_base_url(),
        urlencoding_encode(&pkce_challenge(&verifier)),
        urlencoding_encode(&state),
        urlencoding_encode(REDIRECT_URI),
    );

    // Store before opening: the callback can only arrive after the browser is up,
    // but ordering it this way leaves no window where a callback finds no login.
    *app.state::<LoginState>()
        .pending_login
        .lock()
        .expect("login state mutex poisoned") = Some(PendingLogin { verifier, state });

    eprintln!("[auth] opening the system browser for sign-in");
    app.opener()
        .open_url(auth_url, None::<&str>)
        .map_err(|e| format!("could not open the system browser: {e}"))
}

/// One-shot collection of the `{code, verifier}` pair by `/desktop-auth`.
///
/// Returns `null` when there is no pending sign-in — including on a second call,
/// which is why `/desktop-auth` must guard against React's double-invoke.
#[tauri::command]
pub fn desktop_get_pending_auth(app: tauri::AppHandle) -> Option<PendingAuth> {
    app.state::<LoginState>()
        .pending_auth
        .lock()
        .expect("login state mutex poisoned")
        .take()
}

/// Why a callback was thrown away. Only ever logged — the page is told nothing,
/// so a forged deep link learns nothing from trying.
#[derive(Debug, PartialEq, Eq)]
enum Rejection {
    /// Not our scheme. Someone else's deep link, or a stray navigation.
    WrongScheme,
    /// No `code` and/or no `state` in the query.
    Incomplete,
    /// Nothing in flight — a stale, replayed, or unsolicited callback.
    NoPendingLogin,
    /// In flight, but `state` doesn't match: forged or from an abandoned attempt.
    StateMismatch,
}

/// Decide what an inbound deep link means, given the login we have in flight.
///
/// Split out from the Tauri plumbing because this is the security decision worth
/// testing directly: it is what stands between an arbitrary
/// `exponential-beta://` URL — which any local process can fire — and a
/// redeemable auth pair. Consumes `pending` so a callback can only ever be
/// matched once, whatever the outcome.
fn match_callback(url: &Url, pending: Option<PendingLogin>) -> Result<PendingAuth, Rejection> {
    if url.scheme() != CALLBACK_SCHEME {
        return Err(Rejection::WrongScheme);
    }

    let mut code = None;
    let mut state = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            _ => {}
        }
    }

    let (Some(code), Some(state)) = (code, state) else {
        return Err(Rejection::Incomplete);
    };
    let Some(pending) = pending else {
        return Err(Rejection::NoPendingLogin);
    };
    if state != pending.state {
        return Err(Rejection::StateMismatch);
    }

    Ok(PendingAuth {
        code,
        verifier: pending.verifier,
    })
}

/// Handle an `exponential-beta://auth/callback?code&state` deep link: match it
/// against the login we started, then hand the page to `/desktop-auth` to redeem.
pub fn handle_callback(app: &tauri::AppHandle, url: &Url) {
    let login_state = app.state::<LoginState>();
    let pending = login_state
        .pending_login
        .lock()
        .expect("login state mutex poisoned")
        .take();

    let pair = match match_callback(url, pending) {
        Ok(pair) => pair,
        Err(reason) => {
            eprintln!("[auth] rejected callback: {reason:?}");
            return;
        }
    };

    *login_state
        .pending_auth
        .lock()
        .expect("login state mutex poisoned") = Some(pair);
    eprintln!("[auth] callback accepted; handing off to /desktop-auth");

    if let Some(window) = app.get_webview_window("main") {
        let target = format!("{}/desktop-auth", crate::app_base_url());
        match target.parse() {
            Ok(url) => {
                if let Err(e) = window.navigate(url) {
                    eprintln!("[auth] could not navigate to /desktop-auth: {e}");
                }
            }
            Err(e) => eprintln!("[auth] /desktop-auth is not a valid URL: {e}"),
        }
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Percent-encode a query-parameter value.
///
/// Hand-rolled rather than pulling a crate: the inputs are base64url tokens and
/// one constant URI, so the only characters that ever need escaping are `-`, `_`
/// (which don't) and `:` / `/` in the redirect URI.
fn urlencoding_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_matches_the_rfc_7636_s256_example() {
        // RFC 7636 appendix B: the canonical verifier/challenge pair. If this
        // drifts, the server's PKCE check silently fails every sign-in.
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            pkce_challenge(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn random_tokens_are_43_char_base64url_and_unique() {
        let a = random_token();
        let b = random_token();
        assert_eq!(a.len(), 43, "server expects a 43-char base64url challenge");
        assert!(a.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'));
        assert_ne!(a, b);
    }

    #[test]
    fn encodes_the_redirect_uri_but_leaves_base64url_tokens_alone() {
        let token = "abc-DEF_123";
        assert_eq!(urlencoding_encode(token), token);
        assert_eq!(
            urlencoding_encode(REDIRECT_URI),
            "exponential-beta%3A%2F%2Fauth%2Fcallback"
        );
    }

    fn login(state: &str) -> PendingLogin {
        PendingLogin {
            verifier: "the-pkce-verifier".into(),
            state: state.into(),
        }
    }

    fn url(raw: &str) -> Url {
        raw.parse().expect("test URL must parse")
    }

    #[test]
    fn accepts_the_callback_for_the_login_we_started() {
        let pair = match_callback(
            &url("exponential-beta://auth/callback?code=the-code&state=s1"),
            Some(login("s1")),
        )
        .expect("matching callback should be accepted");
        assert_eq!(pair.code, "the-code");
        // The verifier comes from *our* in-flight login, never from the URL —
        // that is the whole point of PKCE here.
        assert_eq!(pair.verifier, "the-pkce-verifier");
    }

    #[test]
    fn accepts_regardless_of_query_parameter_order_or_extras() {
        assert!(match_callback(
            &url("exponential-beta://auth/callback?state=s1&extra=x&code=the-code"),
            Some(login("s1")),
        )
        .is_ok());
    }

    #[test]
    fn url_decodes_the_code_before_handing_it_over() {
        // The server percent-encodes the JWT into the redirect; hand the page the
        // decoded value or redemption fails on a mangled token.
        let pair = match_callback(
            &url("exponential-beta://auth/callback?code=a.b%2Bc%3Dd&state=s1"),
            Some(login("s1")),
        )
        .expect("callback should be accepted");
        assert_eq!(pair.code, "a.b+c=d");
    }

    #[test]
    fn rejects_a_forged_or_stale_state() {
        assert_eq!(
            match_callback(
                &url("exponential-beta://auth/callback?code=the-code&state=attacker"),
                Some(login("s1")),
            ),
            Err(Rejection::StateMismatch)
        );
    }

    #[test]
    fn rejects_a_callback_when_no_login_is_in_flight() {
        // Any local process can fire this URL at us; unsolicited ones go nowhere.
        assert_eq!(
            match_callback(
                &url("exponential-beta://auth/callback?code=the-code&state=s1"),
                None,
            ),
            Err(Rejection::NoPendingLogin)
        );
    }

    #[test]
    fn rejects_a_callback_missing_code_or_state() {
        assert_eq!(
            match_callback(
                &url("exponential-beta://auth/callback?state=s1"),
                Some(login("s1")),
            ),
            Err(Rejection::Incomplete)
        );
        assert_eq!(
            match_callback(
                &url("exponential-beta://auth/callback?code=the-code"),
                Some(login("s1")),
            ),
            Err(Rejection::Incomplete)
        );
    }

    #[test]
    fn rejects_another_apps_scheme() {
        // Notably the Electron/iOS scheme: if macOS ever misroutes one to us, we
        // must not consume it.
        assert_eq!(
            match_callback(
                &url("exponential://auth/callback?code=the-code&state=s1"),
                Some(login("s1")),
            ),
            Err(Rejection::WrongScheme)
        );
    }

    #[test]
    fn the_scheme_constant_and_redirect_uri_agree() {
        // The scheme is duplicated into tauri.conf.json and the server allow-list;
        // at minimum keep the two copies in this file from drifting apart.
        assert!(REDIRECT_URI.starts_with(&format!("{CALLBACK_SCHEME}://")));
        assert_eq!(REDIRECT_URI, "exponential-beta://auth/callback");
    }
}
