//! The local wiki: a git-backed folder of plain markdown the librarian agent
//! maintains on the user's machine.
//!
//! Two constraints shape everything here, and both come from the feature spec
//! rather than from Tauri:
//!
//! **The contract is brain-agnostic.** Nothing in the file layout or these
//! commands knows about Mastra, or about any particular model. The wiki is
//! markdown with `[[wikilinks]]` and a `schema.md` describing its conventions,
//! so a different agent — Claude Code, a local inference loop, something over
//! MCP — can operate the same wiki tomorrow without a migration.
//!
//! **Every path is jailed to the wiki root.** These commands are reachable from
//! a remote web page (see the capability in `capabilities/remote.json`), so a
//! path bug here is a read/write primitive over the user's disk handed to
//! whatever the model was talked into emitting. `resolve` is the only way to
//! turn a caller-supplied path into a real one, and it is tested against
//! traversal, absolute paths, and symlinks pointing out of the wiki.

use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use serde::Serialize;

/// Files seeded on first init. `schema.md` is the important one: it is where the
/// librarian's conventions live, which is what lets a *different* agent pick up
/// the same wiki and behave consistently.
const INDEX_MD: &str = include_str!("../seeds/index.md");
const LOG_MD: &str = include_str!("../seeds/log.md");
const SCHEMA_MD: &str = include_str!("../seeds/schema.md");

/// Where the wiki lives. Resolved once at startup and held here; every command
/// jails against whatever is current, so pointing it somewhere else moves the
/// jail with it.
#[derive(Default)]
pub struct WikiRoot(pub Mutex<Option<PathBuf>>);

/// Store file the resolved root is persisted to, so it survives a restart.
pub const STORE_FILE: &str = "wiki.json";
/// Key within that store.
pub const STORE_KEY: &str = "root";
/// Dev override, read at startup. Applies to that launch only — see
/// `resolve_root_for_launch` for why it is deliberately never persisted.
pub const ROOT_ENV: &str = "EXPONENTIAL_WIKI_ROOT";

/// Default location — visible in Finder on purpose. The wiki is the user's, and
/// a folder they can open, edit, and `git log` is the whole point.
pub fn default_root() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    Path::new(&home).join("Documents").join("exponential-wiki")
}

/// The root for this launch, and whether it is ours to remember.
pub struct RootChoice {
    pub root: PathBuf,
    /// False for an env override: that path is this launch's business only.
    pub persist: bool,
}

/// Decide the root from what's available — an explicit override wins, then a
/// previously stored choice, then the default — and say whether the answer
/// should be written back to the store.
///
/// **There is deliberately no command to change this from the page.** The jail
/// is only worth anything if the thing being jailed cannot move the walls, and
/// these commands are reachable from a remote origin — a page-callable setter
/// would turn "read inside the wiki" into "read anywhere" for any script running
/// on that origin. Configuring the root is therefore an out-of-band act (the env
/// var, or a future native settings UI), never an in-page one.
///
/// The env override is deliberately **not** persisted. It used to be, and that
/// turned a one-off `EXPONENTIAL_WIKI_ROOT=/tmp/scratch` test run into the
/// permanent setting: every later launch read that path back out of the store,
/// so the app believed a wiki existed, the first-run panel never appeared, and
/// the librarian read and wrote a throwaway folder the user had forgotten about.
/// A variable set for one command should not outlive it.
pub fn resolve_root_for_launch(stored: Option<String>) -> RootChoice {
    if let Some(from_env) = std::env::var(ROOT_ENV).ok().filter(|v| !v.trim().is_empty()) {
        return RootChoice { root: PathBuf::from(from_env), persist: false };
    }
    let root = match stored.filter(|v| !v.trim().is_empty()) {
        Some(path) => PathBuf::from(path),
        None => default_root(),
    };
    RootChoice { root, persist: true }
}

fn current_root(state: &WikiRoot) -> PathBuf {
    state
        .0
        .lock()
        .expect("wiki root mutex poisoned")
        .clone()
        .unwrap_or_else(default_root)
}

/// Where the wiki is, so the app can tell the user rather than making them guess.
/// Read-only by design — see `resolve_root_for_launch`.
#[tauri::command]
pub fn wiki_get_root(state: tauri::State<WikiRoot>) -> String {
    current_root(&state).to_string_lossy().into_owned()
}

/// Anything a wiki command can refuse to do. Rendered to the caller as a string;
/// the variants exist so the jail's reasons are testable.
#[derive(Debug, PartialEq, Eq)]
pub enum WikiError {
    /// The path escaped, or tried to escape, the wiki root.
    OutsideWiki,
    /// Empty, absolute, or otherwise not a relative path inside the wiki.
    BadPath,
    /// Nothing there.
    NotFound,
    /// The filesystem or git said no.
    Io(String),
}

impl std::fmt::Display for WikiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            // Deliberately vague about *why* a path was refused: the caller is
            // ultimately model output, and a precise "that resolved to
            // /Users/..." would be a filesystem oracle.
            Self::OutsideWiki => write!(f, "path is outside the wiki folder"),
            Self::BadPath => write!(f, "not a valid path inside the wiki"),
            Self::NotFound => write!(f, "no such page"),
            Self::Io(e) => write!(f, "{e}"),
        }
    }
}

impl From<WikiError> for String {
    fn from(e: WikiError) -> Self {
        e.to_string()
    }
}

type WikiResult<T> = Result<T, WikiError>;

/// Turn a caller-supplied relative path into a real one inside `root`, or refuse.
///
/// The check is belt *and* braces on purpose:
///
///  1. Reject anything that isn't a plain relative path — absolute paths, `..`
///     components, Windows prefixes — before touching the filesystem. This
///     catches the traversal attempt even when the target doesn't exist.
///  2. Canonicalize the deepest ancestor that *does* exist and confirm it is
///     still under the canonical root. Only this step catches a symlink already
///     sitting in the wiki that points somewhere else entirely.
///
/// Step 1 alone would miss symlinks; step 2 alone would miss `..` into a
/// not-yet-existing path. Both are tested.
///
/// There is a time-of-check/time-of-use gap between step 2's check and the
/// caller's eventual open, and it is not closed here — any path-based check has
/// one. Exploiting it means swapping a symlink into the wiki folder in the
/// window between the two, which requires local write access inside the user's
/// own wiki; anyone holding that can simply read the files directly, so the
/// check buys nothing extra. The threat this function actually defends against
/// is a *path* the model was talked into emitting, and that it does close.
pub fn resolve(root: &Path, rel: &str) -> WikiResult<PathBuf> {
    if rel.trim().is_empty() {
        return Err(WikiError::BadPath);
    }

    let rel_path = Path::new(rel);
    for component in rel_path.components() {
        match component {
            Component::Normal(_) => {}
            Component::CurDir => {}
            // `..`, `/`, and `C:\` are all attempts to leave, whether or not
            // they'd succeed after joining.
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(WikiError::OutsideWiki);
            }
        }
    }

    let canonical_root = root.canonicalize().map_err(|_| WikiError::NotFound)?;
    let joined = canonical_root.join(rel_path);

    // Walk up to the nearest existing ancestor: a write to a new page has no
    // canonical path of its own yet, but its parent directory does. The walk
    // stops at the root — which always exists, having just been canonicalized —
    // so it can never wander up into the rest of the filesystem looking for
    // something that exists.
    let mut probe = joined.as_path();
    let existing = loop {
        if probe.exists() {
            break probe;
        }
        if probe == canonical_root {
            return Err(WikiError::OutsideWiki);
        }
        match probe.parent().filter(|p| p.starts_with(&canonical_root)) {
            Some(parent) => probe = parent,
            None => return Err(WikiError::OutsideWiki),
        }
    };

    let canonical_existing = existing.canonicalize().map_err(|_| WikiError::OutsideWiki)?;
    if !canonical_existing.starts_with(&canonical_root) {
        return Err(WikiError::OutsideWiki);
    }

    Ok(joined)
}

/// A page as the librarian sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiPage {
    /// Path relative to the wiki root — the same string every command takes back.
    pub path: String,
    pub bytes: u64,
}

/// What the app needs to decide between "offer to create a wiki" and "chat".
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiStatus {
    /// Where it would live, whether or not it does — the first-run panel names
    /// this so the user knows what is about to appear on their disk.
    pub root: String,
    pub exists: bool,
    /// Whether the folder is a git repo. False for a folder restored from a
    /// backup that lost `.git`, which still counts as existing.
    pub git: bool,
    pub page_count: usize,
}

/// Report on the wiki **without creating it**.
///
/// The distinction from `wiki_init` is the whole point: creating a folder in
/// someone's Documents should be something they chose, not a side effect of
/// asking a question. This is what the first-run panel asks before offering the
/// button, so it must stay free of side effects.
#[tauri::command]
pub fn wiki_status(state: tauri::State<WikiRoot>) -> WikiStatus {
    let root = current_root(&state);
    status_at(&root)
}

pub fn status_at(root: &Path) -> WikiStatus {
    let exists = root.is_dir();
    WikiStatus {
        root: root.to_string_lossy().into_owned(),
        exists,
        git: exists && root.join(".git").exists(),
        // `list_pages` on a missing folder is an empty list, not an error, so
        // this is safe to call either way.
        page_count: list_pages(root).map(|p| p.len()).unwrap_or(0),
    }
}

/// Create the wiki if it isn't there yet, and report where it is.
///
/// Idempotent, and that matters: this runs at the start of a chat turn, so it
/// must never clobber a wiki the user has been building for weeks. An existing
/// file is left exactly as it is, including a `schema.md` the user has edited to
/// change how their librarian behaves.
#[tauri::command]
pub fn wiki_init(state: tauri::State<WikiRoot>) -> Result<WikiInfo, String> {
    let root = current_root(&state);
    init_at(&root).map_err(Into::into)
}

/// What the page needs to know about the wiki it is talking to.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiInfo {
    pub root: String,
    /// True when this call created the folder, so the UI can say so once.
    pub created: bool,
    /// False when git is unavailable — the wiki still works, without history.
    pub git: bool,
}

pub fn init_at(root: &Path) -> WikiResult<WikiInfo> {
    let created = !root.exists();
    std::fs::create_dir_all(root).map_err(|e| WikiError::Io(e.to_string()))?;

    let git = if root.join(".git").exists() {
        true
    } else {
        git(root, &["init", "--quiet"]).is_ok()
    };

    for (name, body) in [
        ("index.md", INDEX_MD),
        ("log.md", LOG_MD),
        ("schema.md", SCHEMA_MD),
    ] {
        let path = root.join(name);
        if !path.exists() {
            std::fs::write(&path, body).map_err(|e| WikiError::Io(e.to_string()))?;
        }
    }

    Ok(WikiInfo {
        root: root.to_string_lossy().into_owned(),
        created,
        git,
    })
}

/// Every markdown page in the wiki, so the librarian can see what it has.
#[tauri::command]
pub fn wiki_list_pages(state: tauri::State<WikiRoot>) -> Result<Vec<WikiPage>, String> {
    let root = current_root(&state);
    list_pages(&root).map_err(Into::into)
}

pub fn list_pages(root: &Path) -> WikiResult<Vec<WikiPage>> {
    let mut pages = Vec::new();
    collect_pages(root, root, &mut pages)?;
    // Stable order: the list goes into a prompt, and a set that reshuffles
    // between turns makes the model's behaviour irreproducible.
    pages.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(pages)
}

fn collect_pages(root: &Path, dir: &Path, out: &mut Vec<WikiPage>) -> WikiResult<()> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        // A wiki that hasn't been initialised yet is empty, not an error.
        Err(_) => return Ok(()),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        // `.git` is the wiki's history, not its content.
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_pages(root, &path, out)?;
        } else if path.extension().is_some_and(|e| e == "md") {
            let rel = path
                .strip_prefix(root)
                .map_err(|_| WikiError::OutsideWiki)?
                .to_string_lossy()
                .into_owned();
            let bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(WikiPage { path: rel, bytes });
        }
    }
    Ok(())
}

/// Read one page.
#[tauri::command]
pub fn wiki_read_page(state: tauri::State<WikiRoot>, path: String) -> Result<String, String> {
    let root = current_root(&state);
    read_page(&root, &path).map_err(Into::into)
}

pub fn read_page(root: &Path, rel: &str) -> WikiResult<String> {
    let target = resolve(root, rel)?;
    std::fs::read_to_string(&target).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => WikiError::NotFound,
        _ => WikiError::Io(e.to_string()),
    })
}

/// One page that matched a search, with the lines that matched.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    /// True when the *filename* matched, so a page called `ada.md` surfaces for
    /// "ada" even if the word never appears in its body.
    pub path_matched: bool,
    /// Matching lines, trimmed. Capped — the result goes into a prompt.
    pub lines: Vec<String>,
}

/// Plain text and filename search across the wiki.
///
/// No embeddings, no index: the wiki is small, and this is what the Karpathy
/// pattern actually calls for — the librarian navigates by `index.md` and
/// `[[wikilinks]]`, and searches when that comes up short. An embedding index
/// would be a second source of truth to keep in sync with the files for no gain
/// at this size. Revisit only if retrieval quality actually disappoints.
#[tauri::command]
pub fn wiki_search(state: tauri::State<WikiRoot>, query: String) -> Result<Vec<SearchHit>, String> {
    let root = current_root(&state);
    search(&root, &query).map_err(Into::into)
}

/// Matching lines kept per page, so a big page can't crowd out the others.
const MAX_LINES_PER_HIT: usize = 5;
/// Pages returned, so a single-letter query can't blow the model's context.
const MAX_HITS: usize = 20;

pub fn search(root: &Path, query: &str) -> WikiResult<Vec<SearchHit>> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }

    let mut hits = Vec::new();
    for page in list_pages(root)? {
        let path_matched = page.path.to_lowercase().contains(&needle);
        let content = read_page(root, &page.path).unwrap_or_default();
        let lines: Vec<String> = content
            .lines()
            .filter(|line| line.to_lowercase().contains(&needle))
            .take(MAX_LINES_PER_HIT)
            .map(|line| line.trim().to_string())
            .collect();

        if path_matched || !lines.is_empty() {
            hits.push(SearchHit {
                path: page.path,
                path_matched,
                lines,
            });
        }
        if hits.len() >= MAX_HITS {
            break;
        }
    }
    Ok(hits)
}

/// Write a page, creating parent folders as needed.
///
/// Deliberately unconditional: the librarian is allowed to revise a page it (or
/// the user) wrote before, and `schema.md` tells it to prefer updating an
/// existing page over starting a near-duplicate. Nothing is lost by overwriting
/// because every writing turn is committed — `git log` and `git revert` are the
/// undo, which is most of the reason the wiki is a repo at all.
#[tauri::command]
pub fn wiki_write_page(
    state: tauri::State<WikiRoot>,
    path: String,
    content: String,
) -> Result<(), String> {
    let root = current_root(&state);
    write_page(&root, &path, &content).map_err(Into::into)
}

pub fn write_page(root: &Path, rel: &str, content: &str) -> WikiResult<()> {
    let target = resolve(root, rel)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| WikiError::Io(e.to_string()))?;
    }
    std::fs::write(&target, content).map_err(|e| WikiError::Io(e.to_string()))
}

/// What a commit did, so the caller can say so.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    /// False when the turn changed nothing — not an error, just nothing to record.
    pub committed: bool,
    /// Short hash, when something was committed.
    pub sha: Option<String>,
}

/// Record everything this chat turn changed as a **single** commit.
///
/// One commit per turn, not per write: a turn that files a page, updates
/// `index.md` and appends to `log.md` is one coherent change, and splitting it
/// into three would make the history unreadable and un-revertable — you could
/// undo the page but keep the index entry pointing at it.
///
/// Called once at turn end. Committing nothing is a success: a turn that only
/// answered questions has nothing to record.
#[tauri::command]
pub fn wiki_commit_turn(
    state: tauri::State<WikiRoot>,
    message: String,
) -> Result<CommitResult, String> {
    let root = current_root(&state);
    commit_turn(&root, &message).map_err(Into::into)
}

pub fn commit_turn(root: &Path, message: &str) -> WikiResult<CommitResult> {
    git(root, &["add", "-A"])?;

    // `diff --cached --quiet` exits non-zero exactly when something is staged.
    let nothing_staged = git(root, &["diff", "--cached", "--quiet"]).is_ok();
    if nothing_staged {
        return Ok(CommitResult {
            committed: false,
            sha: None,
        });
    }

    let subject = commit_subject(message);
    // Identity is set per-commit rather than globally: the wiki is the user's
    // repo and we should not be writing to their git config to use it.
    git(
        root,
        &[
            "-c",
            "user.name=Exponential librarian",
            "-c",
            "user.email=librarian@exponential.im",
            "commit",
            "--quiet",
            "-m",
            &subject,
        ],
    )?;

    let sha = git(root, &["rev-parse", "--short", "HEAD"])?.trim().to_string();
    Ok(CommitResult {
        committed: true,
        sha: Some(sha),
    })
}

/// Turn a turn summary into a one-line commit subject.
///
/// `git log --oneline` is how the user reads this history, so a subject that
/// wraps or carries a stray newline makes the whole log worse.
fn commit_subject(message: &str) -> String {
    let first_line = message.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
    let cleaned = if first_line.is_empty() {
        "Wiki update"
    } else {
        first_line
    };
    let mut subject: String = cleaned.chars().take(72).collect();
    if cleaned.chars().count() > 72 {
        subject.push('…');
    }
    subject
}

/// Run git in the wiki. Shelling out rather than linking libgit2 keeps the
/// history in exactly the format the user's own `git log` and editor expect —
/// the wiki being an ordinary git repo is a feature, not an implementation
/// detail.
fn git(root: &Path, args: &[&str]) -> WikiResult<String> {
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|e| WikiError::Io(format!("git unavailable: {e}")))?;
    if !output.status.success() {
        return Err(WikiError::Io(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real wiki in a scratch directory. Dependency-free by design — these
    /// tests guard the jail, so they must not depend on anything that could
    /// itself be misconfigured.
    struct TempWiki {
        root: PathBuf,
    }

    impl TempWiki {
        fn new(name: &str) -> Self {
            let root = std::env::temp_dir().join(format!("exp-wiki-test-{name}"));
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(&root).expect("scratch wiki");
            Self { root }
        }
    }

    impl Drop for TempWiki {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn resolves_an_ordinary_page() {
        let wiki = TempWiki::new("ordinary");
        let path = resolve(&wiki.root, "notes/thing.md").expect("plain relative path is fine");
        assert!(path.starts_with(wiki.root.canonicalize().unwrap()));
        assert!(path.ends_with("notes/thing.md"));
    }

    #[test]
    fn refuses_to_climb_out_with_dot_dot() {
        let wiki = TempWiki::new("climb");
        for attempt in [
            "../secrets.md",
            "notes/../../secrets.md",
            "a/b/../../../etc/passwd",
            "..",
        ] {
            assert_eq!(
                resolve(&wiki.root, attempt),
                Err(WikiError::OutsideWiki),
                "should have refused {attempt}",
            );
        }
    }

    #[test]
    fn refuses_absolute_paths() {
        let wiki = TempWiki::new("absolute");
        for attempt in ["/etc/passwd", "/tmp/elsewhere.md"] {
            assert_eq!(
                resolve(&wiki.root, attempt),
                Err(WikiError::OutsideWiki),
                "should have refused {attempt}",
            );
        }
    }

    #[test]
    fn refuses_an_empty_or_blank_path() {
        let wiki = TempWiki::new("blank");
        assert_eq!(resolve(&wiki.root, ""), Err(WikiError::BadPath));
        assert_eq!(resolve(&wiki.root, "   "), Err(WikiError::BadPath));
    }

    #[test]
    fn refuses_a_symlink_pointing_out_of_the_wiki() {
        // The case the component check alone cannot catch: the path looks
        // entirely innocent, and the escape happens in the filesystem.
        let wiki = TempWiki::new("symlink");
        let outside = std::env::temp_dir().join("exp-wiki-test-symlink-target");
        std::fs::create_dir_all(&outside).expect("target dir");
        std::fs::write(outside.join("secret.md"), "not yours").expect("target file");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, wiki.root.join("escape")).expect("symlink");

        assert_eq!(
            resolve(&wiki.root, "escape/secret.md"),
            Err(WikiError::OutsideWiki),
        );
        // And the same for a path under the link that does not exist yet, which
        // is the write case.
        assert_eq!(
            resolve(&wiki.root, "escape/new-page.md"),
            Err(WikiError::OutsideWiki),
        );

        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn allows_a_page_that_does_not_exist_yet() {
        // Writing a new page must work; only *escaping* is refused.
        let wiki = TempWiki::new("new-page");
        assert!(resolve(&wiki.root, "brand/new/page.md").is_ok());
    }

    #[test]
    fn status_does_not_create_the_wiki() {
        // The load-bearing property: the first-run panel calls this to decide
        // whether to offer the button, so if it created anything the button
        // would be asking permission for something already done.
        let root = std::env::temp_dir().join("exp-wiki-status-none");
        let _ = std::fs::remove_dir_all(&root);

        let status = status_at(&root);
        assert!(!status.exists);
        assert!(!status.git);
        assert_eq!(status.page_count, 0);
        assert!(!root.exists(), "asking must not create");
        // It still reports where the wiki *would* go, because the panel names
        // the path before the user agrees to it.
        assert_eq!(status.root, root.to_string_lossy());
    }

    #[test]
    fn status_sees_a_wiki_that_exists() {
        let wiki = TempWiki::new("status-exists");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "people/ada.md", "# Ada").unwrap();

        let status = status_at(&wiki.root);
        assert!(status.exists);
        assert!(status.git);
        assert_eq!(status.page_count, 4, "three seeds plus the page");
    }

    #[test]
    fn a_wiki_without_git_still_counts_as_existing() {
        // A folder restored from a backup that lost .git is still the user's
        // wiki; offering to "create" it again would be wrong.
        let wiki = TempWiki::new("status-nogit");
        init_at(&wiki.root).expect("init");
        std::fs::remove_dir_all(wiki.root.join(".git")).unwrap();

        let status = status_at(&wiki.root);
        assert!(status.exists);
        assert!(!status.git);
    }

    #[test]
    fn init_seeds_the_conventions_and_a_git_repo() {
        let wiki = TempWiki::new("init");
        let info = init_at(&wiki.root).expect("init");
        assert!(info.git, "the wiki should be a git repo");
        for seed in ["index.md", "log.md", "schema.md"] {
            assert!(wiki.root.join(seed).exists(), "{seed} should be seeded");
        }
        assert!(
            read_page(&wiki.root, "schema.md")
                .unwrap()
                .contains("[[wikilinks]]"),
            "schema.md carries the conventions a BYO agent reads",
        );
    }

    #[test]
    fn init_is_idempotent_and_never_clobbers() {
        // This runs at the start of every turn against a wiki the user may have
        // been building for weeks — including a schema.md they have edited to
        // change how their librarian behaves.
        let wiki = TempWiki::new("idempotent");
        init_at(&wiki.root).expect("first init");
        std::fs::write(wiki.root.join("schema.md"), "MY OWN CONVENTIONS").expect("user edit");
        std::fs::write(wiki.root.join("mine.md"), "my page").expect("user page");

        let info = init_at(&wiki.root).expect("second init");
        assert!(!info.created, "the folder already existed");
        assert_eq!(read_page(&wiki.root, "schema.md").unwrap(), "MY OWN CONVENTIONS");
        assert_eq!(read_page(&wiki.root, "mine.md").unwrap(), "my page");
    }

    #[test]
    fn lists_markdown_pages_including_nested_ones() {
        let wiki = TempWiki::new("list");
        init_at(&wiki.root).expect("init");
        std::fs::create_dir_all(wiki.root.join("people")).unwrap();
        std::fs::write(wiki.root.join("people/ada.md"), "# Ada").unwrap();
        std::fs::write(wiki.root.join("notes.txt"), "not a page").unwrap();

        let paths: Vec<String> = list_pages(&wiki.root)
            .unwrap()
            .into_iter()
            .map(|p| p.path)
            .collect();

        assert!(paths.contains(&"people/ada.md".to_string()));
        assert!(paths.contains(&"index.md".to_string()));
        assert!(!paths.iter().any(|p| p.ends_with(".txt")), "only markdown");
        assert!(!paths.iter().any(|p| p.starts_with(".git")), "history is not content");
    }

    #[test]
    fn listing_is_ordered_so_prompts_are_reproducible() {
        let wiki = TempWiki::new("order");
        init_at(&wiki.root).expect("init");
        for name in ["zebra.md", "apple.md", "middle.md"] {
            std::fs::write(wiki.root.join(name), "x").unwrap();
        }
        let paths: Vec<String> = list_pages(&wiki.root)
            .unwrap()
            .into_iter()
            .map(|p| p.path)
            .collect();
        let mut sorted = paths.clone();
        sorted.sort();
        assert_eq!(paths, sorted);
    }

    /// `git log --oneline`, as the user would read it.
    fn log_subjects(root: &Path) -> Vec<String> {
        git(root, &["log", "--pretty=%s"])
            .unwrap_or_default()
            .lines()
            .map(str::to_string)
            .collect()
    }

    #[test]
    fn writes_a_page_and_creates_its_folder() {
        let wiki = TempWiki::new("write");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "people/ada.md", "# Ada\n\nWrote the first program.").expect("write");
        assert!(read_page(&wiki.root, "people/ada.md").unwrap().contains("first program"));
    }

    #[test]
    fn writing_obeys_the_same_jail_as_reading() {
        let wiki = TempWiki::new("write-jail");
        init_at(&wiki.root).expect("init");
        assert_eq!(
            write_page(&wiki.root, "../escaped.md", "nope"),
            Err(WikiError::OutsideWiki),
        );
        assert_eq!(
            write_page(&wiki.root, "/tmp/escaped.md", "nope"),
            Err(WikiError::OutsideWiki),
        );
    }

    #[test]
    fn a_turn_that_touches_three_files_is_one_commit() {
        // The point of commit-per-turn: filing a page, linking it from the index
        // and logging it are one change. Three commits would let you revert the
        // page and leave the index pointing at a file that no longer exists.
        let wiki = TempWiki::new("one-commit");
        init_at(&wiki.root).expect("init");
        commit_turn(&wiki.root, "Wiki created").expect("seed commit");
        let before = log_subjects(&wiki.root).len();

        write_page(&wiki.root, "decisions/why-postgres.md", "# Why Postgres").unwrap();
        write_page(&wiki.root, "index.md", "# Index\n\n- [[decisions/why-postgres]]").unwrap();
        write_page(&wiki.root, "log.md", "# Log\n\n- Filed why-postgres.").unwrap();

        let result = commit_turn(&wiki.root, "Why did we pick Postgres?").expect("commit");
        assert!(result.committed);
        assert!(result.sha.is_some());

        let subjects = log_subjects(&wiki.root);
        assert_eq!(subjects.len(), before + 1, "one turn, one commit");
        assert_eq!(subjects.first().map(String::as_str), Some("Why did we pick Postgres?"));
    }

    #[test]
    fn a_turn_that_wrote_nothing_commits_nothing() {
        // Answering a question is not a change. An empty commit per turn would
        // bury the real ones.
        let wiki = TempWiki::new("no-op-commit");
        init_at(&wiki.root).expect("init");
        commit_turn(&wiki.root, "Wiki created").expect("seed commit");
        let before = log_subjects(&wiki.root);

        let result = commit_turn(&wiki.root, "What's in my wiki?").expect("no-op commit");
        assert!(!result.committed);
        assert!(result.sha.is_none());
        assert_eq!(log_subjects(&wiki.root), before);
    }

    #[test]
    fn a_deleted_page_is_committed_too() {
        // `git add -A` rather than `add .`, so a page the librarian removed
        // doesn't linger in history's working tree.
        let wiki = TempWiki::new("delete-commit");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "temp.md", "scratch").unwrap();
        commit_turn(&wiki.root, "Add temp").expect("commit");

        std::fs::remove_file(wiki.root.join("temp.md")).unwrap();
        let result = commit_turn(&wiki.root, "Remove temp").expect("commit");
        assert!(result.committed, "a deletion is a change");
    }

    #[test]
    fn commit_subjects_stay_one_readable_line() {
        // `git log --oneline` is how this history gets read.
        assert_eq!(commit_subject("Ask about Ada"), "Ask about Ada");
        assert_eq!(commit_subject("first line\nsecond line"), "first line");
        assert_eq!(commit_subject("   \n\n  real content  "), "real content");
        assert_eq!(commit_subject(""), "Wiki update");
        assert_eq!(commit_subject("   "), "Wiki update");

        let long = "x".repeat(200);
        let subject = commit_subject(&long);
        assert_eq!(subject.chars().count(), 73, "72 chars plus the ellipsis");
        assert!(subject.ends_with('…'));
        assert!(!subject.contains('\n'));
    }

    #[test]
    fn committing_does_not_touch_the_users_git_config() {
        // The wiki is the user's repo. Setting a global identity to make our
        // commits work would be a side effect well outside our remit.
        let wiki = TempWiki::new("identity");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "page.md", "content").unwrap();
        commit_turn(&wiki.root, "Add a page").expect("commit");

        let author = git(&wiki.root, &["log", "-1", "--pretty=%an"]).unwrap();
        assert_eq!(author.trim(), "Exponential librarian");
        // No repo-level identity was written either.
        assert!(git(&wiki.root, &["config", "--local", "user.name"]).is_err());
    }

    /// Serialises the tests that read `EXPONENTIAL_WIKI_ROOT`, since env vars are
    /// process-global and vitest-style parallelism would make them flaky.
    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn the_root_falls_back_to_the_default() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::remove_var(ROOT_ENV);
        assert_eq!(resolve_root_for_launch(None).root, default_root());
        assert_eq!(resolve_root_for_launch(Some("   ".into())).root, default_root());
    }

    #[test]
    fn a_stored_root_survives_a_restart() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::remove_var(ROOT_ENV);
        assert_eq!(
            resolve_root_for_launch(Some("/tmp/my-wiki".into())).root,
            PathBuf::from("/tmp/my-wiki"),
        );
    }

    #[test]
    fn the_env_override_wins_over_the_stored_root() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var(ROOT_ENV, "/tmp/override-wiki");
        assert_eq!(
            resolve_root_for_launch(Some("/tmp/stored-wiki".into())).root,
            PathBuf::from("/tmp/override-wiki"),
        );
        std::env::remove_var(ROOT_ENV);
    }

    #[test]
    fn the_env_override_is_not_remembered() {
        // Regression: it used to be written back to the store, so a single
        // `EXPONENTIAL_WIKI_ROOT=/tmp/scratch` run silently repointed the wiki
        // for good — the app then believed a wiki existed and never offered to
        // create the real one.
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var(ROOT_ENV, "/tmp/override-wiki");
        let choice = resolve_root_for_launch(Some("/tmp/stored-wiki".into()));
        assert_eq!(choice.root, PathBuf::from("/tmp/override-wiki"));
        assert!(!choice.persist, "an env override must not outlive its launch");
        std::env::remove_var(ROOT_ENV);
    }

    #[test]
    fn a_root_the_user_chose_is_remembered() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::remove_var(ROOT_ENV);
        assert!(resolve_root_for_launch(None).persist);
        assert!(resolve_root_for_launch(Some("/tmp/my-wiki".into())).persist);
    }

    #[test]
    fn the_jail_follows_the_configured_root() {
        // Moving the root moves the walls with it: what was inside the old wiki
        // must be outside the new one, or "configurable root" would quietly be a
        // way to widen the jail.
        let old = TempWiki::new("jail-old");
        let new = TempWiki::new("jail-new");
        init_at(&old.root).expect("init old");
        init_at(&new.root).expect("init new");
        write_page(&old.root, "secret.md", "old wiki content").unwrap();

        assert!(read_page(&old.root, "secret.md").is_ok());
        assert_eq!(read_page(&new.root, "secret.md"), Err(WikiError::NotFound));

        // And no relative path from the new root can reach into the old one.
        let hop = format!("../{}/secret.md", old.root.file_name().unwrap().to_string_lossy());
        assert_eq!(read_page(&new.root, &hop), Err(WikiError::OutsideWiki));
    }

    #[test]
    fn two_wikis_stay_independent() {
        let a = TempWiki::new("independent-a");
        let b = TempWiki::new("independent-b");
        init_at(&a.root).expect("init a");
        init_at(&b.root).expect("init b");
        write_page(&a.root, "only-in-a.md", "a").unwrap();

        let b_paths: Vec<String> = list_pages(&b.root).unwrap().into_iter().map(|p| p.path).collect();
        assert!(!b_paths.contains(&"only-in-a.md".to_string()));
        assert!(a.root.join("only-in-a.md").exists(), "the other wiki is untouched");
    }

    #[test]
    fn search_finds_a_page_by_its_contents() {
        let wiki = TempWiki::new("search-body");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "people/ada.md", "# Ada\n\nWrote the first program.").unwrap();
        write_page(&wiki.root, "tools/ripgrep.md", "Fast search.").unwrap();

        let hits = search(&wiki.root, "first program").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "people/ada.md");
        assert_eq!(hits[0].lines, vec!["Wrote the first program."]);
    }

    #[test]
    fn search_finds_a_page_by_its_filename() {
        // The page whose subject *is* its name often never repeats that name in
        // the body — "ada" should still find people/ada.md.
        let wiki = TempWiki::new("search-name");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "people/ada.md", "Wrote the first program.").unwrap();

        let hit = search(&wiki.root, "ada")
            .unwrap()
            .into_iter()
            .find(|h| h.path == "people/ada.md")
            .expect("the page named for the subject should be found");
        assert!(hit.path_matched);
        assert!(hit.lines.is_empty(), "matched on the name, not the body");
    }

    #[test]
    fn search_ignores_case_and_surrounding_whitespace() {
        let wiki = TempWiki::new("search-case");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "note.md", "Postgres was chosen for JSONB.").unwrap();

        let hit = search(&wiki.root, "  POSTGRES  ")
            .unwrap()
            .into_iter()
            .find(|h| h.path == "note.md")
            .expect("case and padding should not matter");
        assert_eq!(hit.lines, vec!["Postgres was chosen for JSONB."]);
    }

    #[test]
    fn search_matches_substrings_including_inside_words() {
        // Plain substring matching, as specified — no stemming, no word
        // boundaries. So "ada" also hits "readable". The librarian reads the
        // hits and decides, and MAX_HITS bounds the noise; documented here so
        // the looseness is a known property rather than a surprise.
        let wiki = TempWiki::new("search-substring");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "prose.md", "This history is readable.").unwrap();

        let hit = search(&wiki.root, "ada")
            .unwrap()
            .into_iter()
            .find(|h| h.path == "prose.md");
        assert!(hit.is_some(), "substring matching is the documented behaviour");
    }

    #[test]
    fn an_empty_query_finds_nothing_rather_than_everything() {
        // Guards the obvious footgun: "contains empty string" is true for every
        // line of every page, which would dump the whole wiki into the prompt.
        let wiki = TempWiki::new("search-empty");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "note.md", "content").unwrap();
        assert!(search(&wiki.root, "").unwrap().is_empty());
        assert!(search(&wiki.root, "   ").unwrap().is_empty());
    }

    #[test]
    fn search_results_are_bounded_so_they_fit_in_a_prompt() {
        let wiki = TempWiki::new("search-bounded");
        init_at(&wiki.root).expect("init");
        let many_lines = (0..50).map(|i| format!("needle {i}")).collect::<Vec<_>>().join("\n");
        write_page(&wiki.root, "big.md", &many_lines).unwrap();
        for i in 0..40 {
            write_page(&wiki.root, &format!("page-{i}.md"), "needle").unwrap();
        }

        let hits = search(&wiki.root, "needle").unwrap();
        assert!(hits.len() <= MAX_HITS, "capped at {MAX_HITS} pages");
        for hit in &hits {
            assert!(hit.lines.len() <= MAX_LINES_PER_HIT);
        }
    }

    #[test]
    fn reading_a_missing_page_says_so_rather_than_leaking_the_path() {
        let wiki = TempWiki::new("missing");
        init_at(&wiki.root).expect("init");
        assert_eq!(read_page(&wiki.root, "nope.md"), Err(WikiError::NotFound));
        assert_eq!(
            WikiError::OutsideWiki.to_string(),
            "path is outside the wiki folder",
            "the message must not echo the resolved path back to the model",
        );
    }
}
