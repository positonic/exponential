//! Reading things that are **not** in the wiki, so the librarian can ingest them.
//!
//! This module is the deliberate counterpart to `wiki.rs`'s jail, and the split
//! matters. Ingest exists to bring outside material *in*, which means reading a
//! URL or a file the wiki knows nothing about — so it cannot go through
//! `wiki::resolve`, and widening that jail to allow it would quietly hand the
//! model read access to the whole disk for every other command too.
//!
//! Instead these are separate commands with their own, narrower guards. Both are
//! reachable from a remote page and both take model-supplied input, so each one
//! assumes the argument is hostile:
//!
//! * `wiki_fetch_url` refuses anything but http(s), and refuses hosts that
//!   resolve to the loopback, private, or link-local ranges — otherwise a page
//!   the model was reading could talk it into fetching `http://localhost:8080`
//!   or a cloud metadata endpoint from inside the user's network.
//! * `wiki_read_external` refuses anything outside the user's home, refuses
//!   dotfiles and dot-directories (which is where credentials live), and refuses
//!   anything that doesn't look like text.
//!
//! Both cap what they will return, because the result goes into a prompt.

use std::net::IpAddr;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

/// Most we will hand back from any source. Comfortably larger than an article
/// or a notes file, far short of anything that would blow up a turn.
const MAX_BYTES: usize = 512 * 1024;

/// Anything a source read can refuse to do.
#[derive(Debug, PartialEq, Eq)]
pub enum SourceError {
    /// Not http(s), or not a URL at all.
    UnsupportedScheme,
    /// Points somewhere on the local network or at the machine itself.
    NotPublic,
    /// Outside the user's home, or somewhere credentials live.
    NotAllowedPath,
    /// Binary, or otherwise not something to put in a markdown wiki.
    NotText,
    /// Nothing there.
    NotFound,
    /// The network or the filesystem said no.
    Io(String),
}

impl std::fmt::Display for SourceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedScheme => write!(f, "only http and https URLs can be ingested"),
            // Deliberately does not say what it resolved to: the caller is model
            // output, and a precise answer makes this a network scanner.
            Self::NotPublic => write!(f, "that address is not publicly reachable"),
            Self::NotAllowedPath => write!(
                f,
                "only files under your home folder can be ingested, and not hidden ones"
            ),
            Self::NotText => write!(f, "that file does not look like text"),
            Self::NotFound => write!(f, "no such file"),
            Self::Io(e) => write!(f, "{e}"),
        }
    }
}

impl From<SourceError> for String {
    fn from(e: SourceError) -> Self {
        e.to_string()
    }
}

type SourceResult<T> = Result<T, SourceError>;

/// Material handed to the librarian to fold into the wiki.
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(PartialEq, Eq))]
#[serde(rename_all = "camelCase")]
pub struct FetchedSource {
    /// Echoed back so the librarian can cite where a page came from.
    pub source: String,
    /// Page title for a URL, filename for a file — a starting point for naming.
    pub title: Option<String>,
    pub text: String,
    /// True when the source was longer than we will carry into a prompt, so the
    /// librarian can say the ingest was partial rather than implying it read all
    /// of it.
    pub truncated: bool,
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/// Fetch a public web page for ingestion.
///
/// The fetch happens here rather than in the webview because the page cannot
/// reach arbitrary origins — and doing it in Rust is what makes the guards below
/// possible at all.
#[tauri::command]
pub async fn wiki_fetch_url(url: String) -> Result<FetchedSource, String> {
    fetch_url(&url).await.map_err(Into::into)
}

pub async fn fetch_url(raw: &str) -> SourceResult<FetchedSource> {
    let parsed = url::Url::parse(raw).map_err(|_| SourceError::UnsupportedScheme)?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(SourceError::UnsupportedScheme);
    }
    assert_public(&parsed)?;

    let response = reqwest::Client::builder()
        .user_agent("Exponential-Beta-Wiki/0.1")
        .timeout(std::time::Duration::from_secs(20))
        // A redirect could land somewhere private after we checked the original
        // host, so every hop is re-checked rather than trusted.
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            match assert_public(attempt.url()) {
                Ok(()) if attempt.previous().len() < 5 => attempt.follow(),
                _ => attempt.stop(),
            }
        }))
        .build()
        .map_err(|e| SourceError::Io(e.to_string()))?
        .get(parsed.clone())
        .send()
        .await
        .map_err(|e| SourceError::Io(e.to_string()))?;

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    if !content_type.is_empty()
        && !content_type.contains("text/")
        && !content_type.contains("json")
        && !content_type.contains("xml")
    {
        return Err(SourceError::NotText);
    }

    let body = response
        .text()
        .await
        .map_err(|e| SourceError::Io(e.to_string()))?;

    let title = html_title(&body);
    let text = if content_type.contains("html") || body.trim_start().starts_with('<') {
        html_to_text(&body)
    } else {
        body
    };
    let (text, truncated) = cap(text);

    Ok(FetchedSource {
        source: raw.to_string(),
        title,
        text,
        truncated,
    })
}

/// Refuse hosts that point back at this machine or into the local network.
///
/// Checked against the *resolved* addresses, not the name: `localtest.me` and
/// friends resolve to 127.0.0.1 while looking perfectly public.
fn assert_public(url: &url::Url) -> SourceResult<()> {
    let host = url.host_str().ok_or(SourceError::NotPublic)?;
    if host.eq_ignore_ascii_case("localhost") || host.to_lowercase().ends_with(".local") {
        return Err(SourceError::NotPublic);
    }

    use std::net::ToSocketAddrs;
    let port = url.port_or_known_default().unwrap_or(80);
    let addrs = (host, port)
        .to_socket_addrs()
        .map_err(|_| SourceError::NotPublic)?;

    let mut saw_one = false;
    for addr in addrs {
        saw_one = true;
        if !is_public(addr.ip()) {
            return Err(SourceError::NotPublic);
        }
    }
    if !saw_one {
        return Err(SourceError::NotPublic);
    }
    Ok(())
}

/// Is this address out on the internet, rather than somewhere we shouldn't reach?
pub fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !(v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_unspecified()
                // 100.64.0.0/10, carrier-grade NAT — also where Tailscale lives.
                || (v4.octets()[0] == 100 && (64..128).contains(&v4.octets()[1]))
                // 169.254.169.254 and friends are covered by is_link_local, but
                // be explicit about why that matters: cloud metadata.
                )
        }
        IpAddr::V6(v6) => {
            !(v6.is_loopback()
                || v6.is_unspecified()
                // fc00::/7 unique-local and fe80::/10 link-local.
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                || (v6.segments()[0] & 0xffc0) == 0xfe80)
        }
    }
}

/// The `<title>` of an HTML document, if it has one.
fn html_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title")?;
    let open_end = lower[start..].find('>')? + start + 1;
    let end = lower[open_end..].find("</title>")? + open_end;
    let title = decode_entities(html[open_end..end].trim());
    (!title.is_empty()).then_some(title)
}

/// Reduce HTML to something worth reading.
///
/// Hand-rolled rather than pulling a full parser: the librarian is good at
/// making sense of slightly ragged prose, and the alternative is a heavy
/// dependency in a shell whose whole point is staying thin. Drops the elements
/// whose text is never content, then strips tags and collapses whitespace.
fn html_to_text(html: &str) -> String {
    // Elements whose *contents* are markup, not prose.
    let mut rest = html.to_string();
    for tag in ["script", "style", "noscript", "svg", "head"] {
        rest = strip_element(&rest, tag);
    }

    let mut text = String::with_capacity(rest.len());
    let mut in_tag = false;
    for ch in rest.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                // A tag boundary is a word boundary; without this, block
                // elements run their text together.
                text.push(' ');
            }
            _ if !in_tag => text.push(ch),
            _ => {}
        }
    }

    collapse_whitespace(&decode_entities(&text))
}

/// Remove `<tag>…</tag>` and everything between, case-insensitively.
fn strip_element(html: &str, tag: &str) -> String {
    let lower = html.to_lowercase();
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = String::with_capacity(html.len());
    let mut cursor = 0;

    while let Some(start) = lower[cursor..].find(&open) {
        let start = start + cursor;
        out.push_str(&html[cursor..start]);
        match lower[start..].find(&close) {
            Some(end) => cursor = start + end + close.len(),
            // Unclosed: drop the remainder rather than emitting markup.
            None => return out,
        }
    }
    out.push_str(&html[cursor..]);
    out
}

/// The handful of entities that actually show up in prose.
fn decode_entities(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&rsquo;", "'")
        .replace("&mdash;", "—")
}

/// Collapse runs of whitespace, but keep paragraph breaks.
fn collapse_whitespace(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank_run = 0;
    for line in text.lines() {
        let trimmed = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if trimmed.is_empty() {
            blank_run += 1;
            if blank_run == 1 && !out.is_empty() {
                out.push('\n');
            }
        } else {
            blank_run = 0;
            out.push_str(&trimmed);
            out.push('\n');
        }
    }
    out.trim().to_string()
}

// ---------------------------------------------------------------------------
// Local files
// ---------------------------------------------------------------------------

/// Read a file from the user's own machine for ingestion.
///
/// Separate from every `wiki_*` path command on purpose: this is the one place
/// that reads *outside* the wiki, so it carries its own guard and cannot be
/// confused with the jail. It is still model-reachable, so the guard assumes the
/// path is hostile even though a user typically named the file themselves.
#[tauri::command]
pub fn wiki_read_external(path: String) -> Result<FetchedSource, String> {
    read_external(&expand_home(&path)).map_err(Into::into)
}

/// Expand a leading `~`, which is how people actually write paths.
pub fn expand_home(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if let Some(rest) = trimmed.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return Path::new(&home).join(rest);
        }
    }
    PathBuf::from(trimmed)
}

pub fn read_external(path: &Path) -> SourceResult<FetchedSource> {
    assert_ingestible_path(path)?;

    let bytes = std::fs::read(path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => SourceError::NotFound,
        _ => SourceError::Io(e.to_string()),
    })?;

    // A NUL byte in the first block is the cheap, reliable "this is binary"
    // signal — and keeps a PDF or an image out of a markdown wiki.
    if bytes.iter().take(8000).any(|b| *b == 0) {
        return Err(SourceError::NotText);
    }
    let text = String::from_utf8(bytes).map_err(|_| SourceError::NotText)?;
    let (text, truncated) = cap(text);

    Ok(FetchedSource {
        source: path.to_string_lossy().into_owned(),
        title: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned()),
        text,
        truncated,
    })
}

/// May the librarian read this file?
///
/// Two rules, both about blast radius rather than tidiness. It must live under
/// the user's home — nothing from `/etc`, `/var`, or another account. And no
/// component may start with a dot, which is where credentials live: `~/.ssh`,
/// `~/.aws`, `~/.env`. A model talked into ingesting one of those would be
/// writing it into a wiki the user may well sync somewhere.
pub fn assert_ingestible_path(path: &Path) -> SourceResult<()> {
    let home = std::env::var("HOME").map_err(|_| SourceError::NotAllowedPath)?;
    let home = Path::new(&home)
        .canonicalize()
        .map_err(|_| SourceError::NotAllowedPath)?;

    // Canonicalize so `..` and symlinks cannot smuggle the path back out; the
    // file has to exist to be read anyway.
    let resolved = path.canonicalize().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => SourceError::NotFound,
        _ => SourceError::NotAllowedPath,
    })?;
    if !resolved.starts_with(&home) {
        return Err(SourceError::NotAllowedPath);
    }

    let relative = resolved.strip_prefix(&home).unwrap_or(&resolved);
    for component in relative.components() {
        if let Component::Normal(part) = component {
            if part.to_string_lossy().starts_with('.') {
                return Err(SourceError::NotAllowedPath);
            }
        }
    }
    Ok(())
}

/// Trim to what we will carry into a prompt, reporting whether we cut anything.
fn cap(text: String) -> (String, bool) {
    if text.len() <= MAX_BYTES {
        return (text, false);
    }
    let mut end = MAX_BYTES;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    (text[..end].to_string(), true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_http_urls_are_ingestible() {
        for raw in ["file:///etc/passwd", "ftp://example.com/x", "not a url"] {
            let err = futures_lite_block_on(fetch_url(raw));
            assert_eq!(err, Err(SourceError::UnsupportedScheme), "{raw}");
        }
    }

    /// Minimal blocking runner so these tests need no async test harness.
    fn futures_lite_block_on<T>(fut: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(fut)
    }

    #[test]
    fn refuses_the_local_machine_and_the_local_network() {
        // The SSRF case: a page the model is reading talks it into fetching
        // something only this machine can reach.
        for raw in [
            "http://localhost:8080/admin",
            "http://127.0.0.1/",
            "http://[::1]/",
            "http://169.254.169.254/latest/meta-data/",
            "http://printer.local/",
        ] {
            assert_eq!(
                futures_lite_block_on(fetch_url(raw)),
                Err(SourceError::NotPublic),
                "{raw}",
            );
        }
    }

    #[test]
    fn classifies_addresses_the_way_the_guard_needs() {
        let private: Vec<IpAddr> = vec![
            "127.0.0.1".parse().unwrap(),
            "10.1.2.3".parse().unwrap(),
            "192.168.1.1".parse().unwrap(),
            "172.16.0.1".parse().unwrap(),
            "169.254.169.254".parse().unwrap(), // cloud metadata
            "100.64.0.1".parse().unwrap(),      // CGNAT / Tailscale
            "::1".parse().unwrap(),
            "fd00::1".parse().unwrap(),
            "fe80::1".parse().unwrap(),
        ];
        for ip in private {
            assert!(!is_public(ip), "{ip} should be refused");
        }
        for ip in ["93.184.216.34".parse().unwrap(), "2606:2800:220:1::1".parse::<IpAddr>().unwrap()] {
            assert!(is_public(ip), "{ip} should be allowed");
        }
    }

    #[test]
    fn html_becomes_readable_prose() {
        let html = r#"<html><head><title>Why Postgres</title><style>b{}</style></head>
            <body><script>evil()</script><h1>Why Postgres</h1>
            <p>We need joins &amp; JSONB.</p></body></html>"#;
        let text = html_to_text(html);
        assert!(text.contains("Why Postgres"));
        assert!(text.contains("We need joins & JSONB."));
        assert!(!text.contains("evil()"), "script contents are not prose");
        assert!(!text.contains('<'), "no markup survives");
        assert_eq!(html_title(html).as_deref(), Some("Why Postgres"));
    }

    #[test]
    fn an_unclosed_script_does_not_leak_markup() {
        assert!(!html_to_text("<p>hi</p><script>never closed").contains("never closed"));
    }

    #[test]
    fn long_sources_are_capped_and_say_so() {
        let (text, truncated) = cap("x".repeat(MAX_BYTES + 500));
        assert!(truncated, "the librarian must be able to say it read only part");
        assert_eq!(text.len(), MAX_BYTES);
    }

    #[test]
    fn capping_never_splits_a_character() {
        let (text, truncated) = cap("é".repeat(MAX_BYTES));
        assert!(truncated);
        assert!(text.chars().all(|c| c == 'é'), "no broken UTF-8");
    }

    #[test]
    fn tilde_expands_the_way_people_write_paths() {
        let home = std::env::var("HOME").unwrap();
        assert_eq!(expand_home("~/Downloads/n.md"), Path::new(&home).join("Downloads/n.md"));
        assert_eq!(expand_home("/tmp/x.md"), PathBuf::from("/tmp/x.md"));
    }

    #[test]
    fn refuses_files_outside_the_home_folder() {
        assert_eq!(
            assert_ingestible_path(Path::new("/etc/hosts")),
            Err(SourceError::NotAllowedPath),
        );
    }

    #[test]
    fn refuses_hidden_files_where_credentials_live() {
        // The reason this guard exists: a model talked into ingesting ~/.ssh/id_rsa
        // would be writing it into a wiki the user may sync somewhere.
        let home = PathBuf::from(std::env::var("HOME").unwrap());
        let dir = home.join("exp-source-test");
        let hidden = dir.join(".secrets");
        std::fs::create_dir_all(&hidden).unwrap();
        let secret = hidden.join("key.txt");
        std::fs::write(&secret, "hunter2").unwrap();

        assert_eq!(
            assert_ingestible_path(&secret),
            Err(SourceError::NotAllowedPath),
        );

        // A dotfile directly, too.
        let dotfile = dir.join(".env");
        std::fs::write(&dotfile, "SECRET=1").unwrap();
        assert_eq!(
            assert_ingestible_path(&dotfile),
            Err(SourceError::NotAllowedPath),
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_a_symlink_that_escapes_the_home_folder() {
        let home = PathBuf::from(std::env::var("HOME").unwrap());
        let dir = home.join("exp-source-test-link");
        std::fs::create_dir_all(&dir).unwrap();
        let link = dir.join("passwd");
        let _ = std::fs::remove_file(&link);
        #[cfg(unix)]
        std::os::unix::fs::symlink("/etc/passwd", &link).unwrap();

        assert_eq!(assert_ingestible_path(&link), Err(SourceError::NotAllowedPath));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_an_ordinary_notes_file() {
        let home = PathBuf::from(std::env::var("HOME").unwrap());
        let dir = home.join("exp-source-test-ok");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("notes.md");
        std::fs::write(&file, "# Notes\n\nPostgres it is.").unwrap();

        let source = read_external(&file).expect("a plain notes file is ingestible");
        assert!(source.text.contains("Postgres it is."));
        assert_eq!(source.title.as_deref(), Some("notes.md"));
        assert!(!source.truncated);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_binary_files() {
        let home = PathBuf::from(std::env::var("HOME").unwrap());
        let dir = home.join("exp-source-test-bin");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("image.png");
        std::fs::write(&file, [0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]).unwrap();

        assert_eq!(read_external(&file), Err(SourceError::NotText));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_file_says_so() {
        let home = PathBuf::from(std::env::var("HOME").unwrap());
        assert_eq!(
            read_external(&home.join("definitely-not-here-9e3f.md")),
            Err(SourceError::NotFound),
        );
    }
}
