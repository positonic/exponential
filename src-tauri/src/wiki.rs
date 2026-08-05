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
    /// A rename would land on a page that already exists.
    AlreadyExists,
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
            Self::AlreadyExists => write!(f, "a page already exists there"),
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
    app: tauri::AppHandle,
    state: tauri::State<WikiRoot>,
    path: String,
    content: String,
) -> Result<(), String> {
    let root = current_root(&state);
    write_page(&root, &path, &content)?;
    notify(&app, "write", Some(path));
    Ok(())
}

pub fn write_page(root: &Path, rel: &str, content: &str) -> WikiResult<()> {
    let target = resolve(root, rel)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| WikiError::Io(e.to_string()))?;
    }
    std::fs::write(&target, content).map_err(|e| WikiError::Io(e.to_string()))
}

/// Remove a page.
///
/// Deliberately leaves inbound `[[wikilinks]]` alone, which is the opposite of
/// what `rename_page` does — and the difference is the point. Per `schema.md` a
/// link to a page that doesn't exist is not a broken link, it "marks something
/// worth writing". Deleting a page is a statement that its subject should not
/// have a page; the links that pointed at it becoming red links records exactly
/// that, and is how the next reader (or librarian) finds out.
///
/// Files only. A caller that hands over a directory gets `NotFound` rather than
/// a recursive delete, so there is no path through this command that empties
/// the wiki.
#[tauri::command]
pub fn wiki_delete_page(
    app: tauri::AppHandle,
    state: tauri::State<WikiRoot>,
    path: String,
) -> Result<(), String> {
    let root = current_root(&state);
    delete_page(&root, &path)?;
    notify(&app, "delete", Some(path));
    Ok(())
}

pub fn delete_page(root: &Path, rel: &str) -> WikiResult<()> {
    let target = resolve(root, rel)?;
    if !target.is_file() {
        return Err(WikiError::NotFound);
    }
    std::fs::remove_file(&target).map_err(|e| WikiError::Io(e.to_string()))?;
    prune_empty_parent(root, &target);
    Ok(())
}

/// What a rename did, so the caller can say so rather than guess.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RenameResult {
    /// The paths actually used, after `.md` was filled in.
    pub from: String,
    pub to: String,
    /// Pages whose `[[wikilinks]]` were repointed at the new path. The UI says
    /// how many, because a rename that quietly edits six other files is a
    /// surprise the user should not discover from `git log` afterwards.
    pub relinked: Vec<String>,
}

/// Move a page, **and repoint every `[[wikilink]]` that pointed at it**.
///
/// The decision worth recording, since `schema.md` is the contract other agents
/// read: a rename rewrites inbound links rather than refusing.
///
/// The alternative was to refuse when anything links to the page, and it is
/// worse. Wikilinks *are* this wiki's navigation model — `index.md` reaches
/// everything through them and `schema.md` tells the librarian to link
/// generously — so a rename that left them behind would turn every reference
/// into a red link, i.e. into a claim that nobody has written that page. The
/// page is right there under a new name; recording the opposite is a lie the
/// wiki would then carry forward. And refusing outright would make rename
/// unusable for exactly the pages that earned a rename by being well linked.
///
/// The rewrite is safe to be automatic *because* the wiki is a git repo: the
/// move and every edit it caused land in one commit, so `git show` reads as one
/// reviewable change and `git revert` undoes all of it. That is most of the
/// reason the wiki is a repo at all.
///
/// Links are rewritten to the canonical target form (no `.md`), per `schema.md`,
/// even where the original spelled the extension out.
#[tauri::command]
pub fn wiki_rename_page(
    app: tauri::AppHandle,
    state: tauri::State<WikiRoot>,
    from: String,
    to: String,
) -> Result<RenameResult, String> {
    let root = current_root(&state);
    let result = rename_page(&root, &from, &to)?;
    notify(&app, "rename", Some(result.to.clone()));
    Ok(result)
}

pub fn rename_page(root: &Path, from_rel: &str, to_rel: &str) -> WikiResult<RenameResult> {
    // Only the extension is filled in. Nothing else about the destination is
    // "helpfully" normalised — stripping a leading `/` here would turn
    // `/etc/passwd` into a path inside the wiki instead of the refusal it
    // should be, and `resolve` is what makes that refusal.
    let to_rel = with_md_extension(to_rel);

    let from_path = resolve(root, from_rel)?;
    let to_path = resolve(root, &to_rel)?;

    if !from_path.is_file() {
        return Err(WikiError::NotFound);
    }

    let from_clean = clean_rel(from_rel);
    let to_clean = clean_rel(&to_rel);
    if from_path == to_path {
        // Renaming a page to its own name is a no-op, not a collision. Saying
        // "a page already exists there" about the page you are renaming would
        // be true and useless.
        return Ok(RenameResult { from: from_clean, to: to_clean, relinked: Vec::new() });
    }
    if to_path.exists() {
        return Err(WikiError::AlreadyExists);
    }

    if let Some(parent) = to_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| WikiError::Io(e.to_string()))?;
    }
    std::fs::rename(&from_path, &to_path).map_err(|e| WikiError::Io(e.to_string()))?;
    prune_empty_parent(root, &from_path);

    // Listed *after* the move, so the page itself is walked under its new name
    // and a link it made to itself is repointed too.
    let from_target = path_to_target(&from_clean);
    let to_target = path_to_target(&to_clean);
    let mut relinked = Vec::new();
    for page in list_pages(root)? {
        let content = match read_page(root, &page.path) {
            Ok(content) => content,
            // One unreadable page must not abort a rename that has already
            // moved the file; the rest still get repointed.
            Err(_) => continue,
        };
        if let Some(next) = rewrite_wikilinks(&content, &from_target, &to_target) {
            write_page(root, &page.path, &next)?;
            relinked.push(page.path);
        }
    }
    relinked.sort();

    Ok(RenameResult { from: from_clean, to: to_clean, relinked })
}

/// Drop the page's folder if the page was the last thing in it. Best-effort:
/// `remove_dir` only succeeds on an empty directory, so this can never take
/// anything with it. Git wouldn't have tracked the empty folder, but the user
/// opens this wiki in Finder, and litter there is real.
fn prune_empty_parent(root: &Path, page: &Path) {
    let Some(parent) = page.parent() else { return };
    let Ok(canonical_root) = root.canonicalize() else { return };
    if parent == canonical_root || !parent.starts_with(&canonical_root) {
        return;
    }
    let _ = std::fs::remove_dir(parent);
}

/// `people/ada` → `people/ada.md`, leaving an existing extension alone.
fn with_md_extension(rel: &str) -> String {
    let trimmed = rel.trim();
    if trimmed.ends_with(".md") {
        trimmed.to_string()
    } else {
        format!("{trimmed}.md")
    }
}

/// The plain `a/b/c.md` form of a path `resolve` has already accepted.
///
/// Safe only *after* `resolve`: it drops non-`Normal` components, and dropping
/// a `..` rather than refusing it would be a traversal. `resolve` has already
/// refused those, so all that is left to drop here is a `./`.
fn clean_rel(rel: &str) -> String {
    Path::new(rel)
        .components()
        .filter_map(|c| match c {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// `people/ada.md` → `people/ada`, the form a `[[wikilink]]` carries.
///
/// This mirrors `pathToTarget` in `src/lib/wiki/wikiLinks.ts`, and the
/// duplication is deliberate: the link syntax is `schema.md`'s contract, not
/// either implementation's, and both sides need it. Rust needs it because a
/// rename must be one atomic operation behind one command — a UI looping over
/// every page over IPC could half-finish — and the renderer needs it in JS.
/// `schema.md` is what keeps them honest; change the syntax there and both move.
fn path_to_target(path: &str) -> String {
    let clean = normalize_target(path);
    clean.strip_suffix(".md").map(str::to_string).unwrap_or(clean)
}

/// Trim a link target the way the renderer does, so `[[ ./people/ada ]]` and
/// `[[people/ada]]` are recognised as the same link.
fn normalize_target(raw: &str) -> String {
    let trimmed = raw.trim();
    let trimmed = trimmed.strip_prefix("./").unwrap_or(trimmed);
    trimmed.trim_start_matches('/').to_string()
}

/// Repoint every `[[wikilink]]` aimed at `from_target` to `to_target`, or
/// `None` when the document has none — so an untouched page is not rewritten
/// with identical bytes and does not show up as changed.
///
/// Code is skipped, and that is not a nicety: `schema.md` documents this very
/// syntax inside code spans (``[[wikilinks]]``, `[[people/ada]]`), and a plain
/// find-and-replace would edit the documentation of the feature whenever
/// someone renamed the page it uses as its example.
fn rewrite_wikilinks(markdown: &str, from_target: &str, to_target: &str) -> Option<String> {
    let mut changed = false;
    let mut in_fence = false;
    let mut out: Vec<String> = Vec::new();

    for line in markdown.split('\n') {
        let opens_fence = {
            let t = line.trim_start();
            t.starts_with("```") || t.starts_with("~~~")
        };
        if opens_fence {
            in_fence = !in_fence;
            out.push(line.to_string());
            continue;
        }
        if in_fence {
            out.push(line.to_string());
            continue;
        }
        out.push(rewrite_line(line, from_target, to_target, &mut changed));
    }

    changed.then(|| out.join("\n"))
}

fn rewrite_line(line: &str, from_target: &str, to_target: &str, changed: &mut bool) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut out = String::with_capacity(line.len());
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '`' {
            // Copy an inline code span through verbatim, backticks and all.
            let start = i;
            let run = backtick_run(&chars, i);
            i += run;
            let end = match closing_run(&chars, i, run) {
                Some(end) => end,
                // Unclosed: the backticks are literal text, so only the run
                // itself is copied and scanning resumes right after it.
                None => i,
            };
            out.extend(chars[start..end].iter());
            i = end;
            continue;
        }

        if chars[i] == '[' && chars.get(i + 1) == Some(&'[') {
            if let Some(close) = link_close(&chars, i + 2) {
                let target: String = chars[i + 2..close].iter().collect();
                // Compared in target form so `[[people/ada]]` and the equally
                // valid `[[people/ada.md]]` are recognised as the same link.
                if path_to_target(&target) == from_target {
                    out.push_str("[[");
                    out.push_str(to_target);
                    out.push_str("]]");
                    *changed = true;
                    i = close + 2;
                    continue;
                }
            }
        }

        out.push(chars[i]);
        i += 1;
    }
    out
}

fn backtick_run(chars: &[char], from: usize) -> usize {
    chars[from..].iter().take_while(|c| **c == '`').count()
}

/// Index just past the next run of exactly `run` backticks, if there is one.
fn closing_run(chars: &[char], from: usize, run: usize) -> Option<usize> {
    let mut i = from;
    while i < chars.len() {
        if chars[i] == '`' {
            let here = backtick_run(chars, i);
            i += here;
            if here == run {
                return Some(i);
            }
        } else {
            i += 1;
        }
    }
    None
}

/// Index of the `]]` closing a link opened at `from`, matching the renderer's
/// `\[\[([^[\]\n]+)]]` — no brackets and no line break inside a target.
fn link_close(chars: &[char], from: usize) -> Option<usize> {
    let mut i = from;
    while i < chars.len() {
        match chars[i] {
            ']' if chars.get(i + 1) == Some(&']') => {
                return (i > from).then_some(i);
            }
            '[' | ']' => return None,
            _ => i += 1,
        }
    }
    None
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
    app: tauri::AppHandle,
    state: tauri::State<WikiRoot>,
    message: String,
) -> Result<CommitResult, String> {
    let root = current_root(&state);
    let result = commit_turn(&root, &message)?;
    // Only when something landed: a history view has nothing to re-read after
    // a turn that changed nothing.
    if result.committed {
        notify(&app, "commit", None);
    }
    Ok(result)
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

/// One commit, as `git log` would show it.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiCommit {
    /// Short hash — what `git show` and `git revert` take.
    pub sha: String,
    pub subject: String,
    pub author: String,
    /// ISO-8601 with offset, so the page formats it in the reader's locale
    /// rather than us guessing one here.
    pub date: String,
    /// Pages this commit touched. Empty for a single page's history, where the
    /// answer is always the page you asked about.
    pub paths: Vec<String>,
}

/// Most commits any one call will return, however much the caller asks for.
/// This lands in a UI list and, eventually, in a prompt.
const MAX_HISTORY: usize = 100;

/// One page's history, following it through renames.
///
/// `--follow` is the reason this is worth having over a plain filter: a page
/// that was renamed keeps its history here, which is exactly the promise
/// `rename_page` makes when it moves a well-linked page.
#[tauri::command]
pub fn wiki_page_history(
    state: tauri::State<WikiRoot>,
    path: String,
    limit: Option<usize>,
) -> Result<Vec<WikiCommit>, String> {
    let root = current_root(&state);
    page_history(&root, &path, limit.unwrap_or(20)).map_err(Into::into)
}

pub fn page_history(root: &Path, rel: &str, limit: usize) -> WikiResult<Vec<WikiCommit>> {
    // Jailed like every other path, even though git does the reading: the
    // argument still reaches a subprocess, and `--` alone is not a boundary.
    resolve(root, rel)?;
    git_log(root, &["--follow"], Some(&clean_rel(rel)), limit)
}

/// What changed across the whole wiki lately, newest first.
///
/// The counterpart view to per-page history: the librarian writes while you are
/// elsewhere in the app, and this is how you find out what it filed.
#[tauri::command]
pub fn wiki_recent_changes(
    state: tauri::State<WikiRoot>,
    limit: Option<usize>,
) -> Result<Vec<WikiCommit>, String> {
    let root = current_root(&state);
    recent_changes(&root, limit.unwrap_or(20)).map_err(Into::into)
}

pub fn recent_changes(root: &Path, limit: usize) -> WikiResult<Vec<WikiCommit>> {
    git_log(root, &["--name-only"], None, limit)
}

/// Record separator between commits, and field separator within one. Control
/// characters because a commit subject can contain anything a person can type,
/// and picking a printable delimiter is how log parsers break.
const RECORD_SEP: char = '\u{1e}';
const FIELD_SEP: char = '\u{1f}';
const LOG_FORMAT: &str = "--pretty=format:%x1e%h%x1f%s%x1f%an%x1f%aI";

fn git_log(
    root: &Path,
    extra: &[&str],
    path: Option<&str>,
    limit: usize,
) -> WikiResult<Vec<WikiCommit>> {
    // A wiki restored from a backup that lost `.git` has no history — that is
    // an answer, not a failure. `wiki_status` already reports `git: false` so
    // the UI can say why.
    if !root.join(".git").exists() {
        return Ok(Vec::new());
    }
    // And a freshly created repo has no HEAD yet, which `git log` reports as an
    // error rather than as an empty log.
    if git(root, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }

    let capped = limit.clamp(1, MAX_HISTORY).to_string();
    let mut args = vec!["log", "--max-count", capped.as_str(), LOG_FORMAT];
    args.extend_from_slice(extra);
    if let Some(path) = path {
        args.push("--");
        args.push(path);
    }

    Ok(parse_log(&git(root, &args)?))
}

fn parse_log(raw: &str) -> Vec<WikiCommit> {
    raw.split(RECORD_SEP)
        .filter(|record| !record.trim().is_empty())
        .filter_map(|record| {
            let mut lines = record.lines();
            let mut fields = lines.next()?.split(FIELD_SEP);
            let sha = fields.next()?.trim().to_string();
            if sha.is_empty() {
                return None;
            }
            Some(WikiCommit {
                sha,
                subject: fields.next().unwrap_or_default().to_string(),
                author: fields.next().unwrap_or_default().to_string(),
                date: fields.next().unwrap_or_default().trim().to_string(),
                // Present only with `--name-only`; the blank line git puts
                // between the subject and the file list drops out here.
                paths: lines
                    .map(str::trim)
                    .filter(|line| !line.is_empty())
                    .map(str::to_string)
                    .collect(),
            })
        })
        .collect()
}

/// Event name the web app listens on. Namespaced because it rides the same bus
/// as Tauri's own window events.
pub const CHANGED_EVENT: &str = "wiki://changed";

/// What just changed, for a listener deciding whether to re-read.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiChanged {
    /// `write`, `delete`, `rename` or `commit`.
    pub kind: String,
    /// The page most directly affected, where there is one.
    pub path: Option<String>,
}

/// Tell any open wiki view that the folder moved under it.
///
/// Before this, `/wiki` only re-read on window focus — so the librarian could
/// file three pages from the chat drawer and the list sitting next to it went
/// on showing the old wiki until you clicked away and back. Best-effort by
/// design: a failed notification must not fail the write it is reporting.
fn notify(app: &tauri::AppHandle, kind: &str, path: Option<String>) {
    use tauri::Emitter;
    let _ = app.emit(CHANGED_EVENT, WikiChanged { kind: kind.to_string(), path });
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
    fn deletes_a_page() {
        let wiki = TempWiki::new("delete");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "people/ada.md", "# Ada").unwrap();

        delete_page(&wiki.root, "people/ada.md").expect("delete");
        assert_eq!(read_page(&wiki.root, "people/ada.md"), Err(WikiError::NotFound));
        // The folder went with its last page rather than lingering in Finder.
        assert!(!wiki.root.join("people").exists());
    }

    #[test]
    fn deleting_obeys_the_same_jail_as_writing() {
        let wiki = TempWiki::new("delete-jail");
        init_at(&wiki.root).expect("init");
        assert_eq!(delete_page(&wiki.root, "../outside.md"), Err(WikiError::OutsideWiki));
        assert_eq!(delete_page(&wiki.root, "/etc/passwd"), Err(WikiError::OutsideWiki));
        assert_eq!(delete_page(&wiki.root, "nope.md"), Err(WikiError::NotFound));
    }

    #[test]
    fn deleting_refuses_a_directory_rather_than_emptying_it() {
        // The one that would matter: `delete_page("people")` must not be a
        // recursive remove. There is no path through this command that can
        // take out more than the page it names.
        let wiki = TempWiki::new("delete-dir");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "people/ada.md", "# Ada").unwrap();

        assert_eq!(delete_page(&wiki.root, "people"), Err(WikiError::NotFound));
        assert!(wiki.root.join("people/ada.md").exists());
    }

    #[test]
    fn deleting_leaves_inbound_links_as_red_links() {
        // The deliberate difference from rename: per schema.md an unresolved
        // link marks something worth writing, which is exactly the right
        // record of "this page was deleted".
        let wiki = TempWiki::new("delete-links");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "people/ada.md", "# Ada").unwrap();
        write_page(&wiki.root, "index.md", "- [[people/ada]]\n").unwrap();

        delete_page(&wiki.root, "people/ada.md").expect("delete");
        assert_eq!(read_page(&wiki.root, "index.md").unwrap(), "- [[people/ada]]\n");
    }

    #[test]
    fn renames_a_page_and_repoints_what_linked_to_it() {
        let wiki = TempWiki::new("rename");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "people/ada.md", "# Ada Lovelace\n").unwrap();
        write_page(&wiki.root, "index.md", "- [[people/ada]] — first programmer\n").unwrap();
        write_page(&wiki.root, "notes.md", "See [[people/ada]] and [[people/hopper]].\n").unwrap();

        let result = rename_page(&wiki.root, "people/ada.md", "people/lovelace.md").expect("rename");

        assert_eq!(result.from, "people/ada.md");
        assert_eq!(result.to, "people/lovelace.md");
        assert_eq!(result.relinked, vec!["index.md", "notes.md"]);

        assert_eq!(read_page(&wiki.root, "people/lovelace.md").unwrap(), "# Ada Lovelace\n");
        assert_eq!(read_page(&wiki.root, "people/ada.md"), Err(WikiError::NotFound));
        assert_eq!(
            read_page(&wiki.root, "index.md").unwrap(),
            "- [[people/lovelace]] — first programmer\n",
        );
        // The link to an unrelated page is untouched.
        assert_eq!(
            read_page(&wiki.root, "notes.md").unwrap(),
            "See [[people/lovelace]] and [[people/hopper]].\n",
        );
    }

    #[test]
    fn a_rename_and_its_relinks_are_one_commit() {
        // The property that makes rewriting inbound links safe to do
        // automatically: the whole rename is one reviewable, revertable change.
        let wiki = TempWiki::new("rename-commit");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "people/ada.md", "# Ada").unwrap();
        write_page(&wiki.root, "index.md", "- [[people/ada]]\n").unwrap();
        commit_turn(&wiki.root, "Seed").expect("seed commit");
        let before = log_subjects(&wiki.root).len();

        rename_page(&wiki.root, "people/ada.md", "people/lovelace.md").expect("rename");
        let result = commit_turn(&wiki.root, "Rename people/ada to people/lovelace").expect("commit");

        assert!(result.committed);
        assert_eq!(log_subjects(&wiki.root).len(), before + 1);
    }

    #[test]
    fn renaming_fills_in_a_missing_extension() {
        // A destination without `.md` would otherwise create a file that
        // `list_pages` never shows — the page would vanish from the wiki.
        let wiki = TempWiki::new("rename-ext");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "ada.md", "# Ada").unwrap();

        let result = rename_page(&wiki.root, "ada.md", "people/lovelace").expect("rename");
        assert_eq!(result.to, "people/lovelace.md");
        assert!(wiki.root.join("people/lovelace.md").is_file());
    }

    #[test]
    fn renaming_will_not_overwrite_an_existing_page() {
        let wiki = TempWiki::new("rename-collide");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "a.md", "first").unwrap();
        write_page(&wiki.root, "b.md", "second").unwrap();

        assert_eq!(rename_page(&wiki.root, "a.md", "b.md"), Err(WikiError::AlreadyExists));
        assert_eq!(read_page(&wiki.root, "a.md").unwrap(), "first");
        assert_eq!(read_page(&wiki.root, "b.md").unwrap(), "second");
    }

    #[test]
    fn renaming_a_page_to_its_own_name_does_nothing_quietly() {
        let wiki = TempWiki::new("rename-noop");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "ada.md", "# Ada").unwrap();

        let result = rename_page(&wiki.root, "ada.md", "ada.md").expect("no-op rename");
        assert!(result.relinked.is_empty());
        assert_eq!(read_page(&wiki.root, "ada.md").unwrap(), "# Ada");
    }

    #[test]
    fn renaming_obeys_the_same_jail_in_both_directions() {
        let wiki = TempWiki::new("rename-jail");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "ada.md", "# Ada").unwrap();

        assert_eq!(
            rename_page(&wiki.root, "../outside.md", "ada2.md"),
            Err(WikiError::OutsideWiki),
        );
        for escape in ["../escaped.md", "/tmp/escaped.md", "../../escaped"] {
            assert_eq!(
                rename_page(&wiki.root, "ada.md", escape),
                Err(WikiError::OutsideWiki),
                "should have refused a destination of {escape}",
            );
        }
        // And the page is still where it was.
        assert_eq!(read_page(&wiki.root, "ada.md").unwrap(), "# Ada");
    }

    #[test]
    fn renaming_a_missing_page_says_so() {
        let wiki = TempWiki::new("rename-missing");
        init_at(&wiki.root).expect("init");
        assert_eq!(rename_page(&wiki.root, "nope.md", "yes.md"), Err(WikiError::NotFound));
    }

    #[test]
    fn a_rename_does_not_rewrite_the_syntax_documented_in_code() {
        // schema.md explains wikilinks *using* `[[people/ada]]` inside a code
        // span. Renaming that page must not edit the documentation of the
        // feature — the same reason the renderer walks the AST rather than
        // replacing strings.
        let wiki = TempWiki::new("rename-code");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "people/ada.md", "# Ada").unwrap();
        let doc = "Use `[[people/ada]]` to link.\n\n```md\n[[people/ada]]\n```\n\nReal: [[people/ada]]\n";
        write_page(&wiki.root, "doc.md", doc).unwrap();

        rename_page(&wiki.root, "people/ada.md", "people/lovelace.md").expect("rename");

        assert_eq!(
            read_page(&wiki.root, "doc.md").unwrap(),
            "Use `[[people/ada]]` to link.\n\n```md\n[[people/ada]]\n```\n\nReal: [[people/lovelace]]\n",
        );
    }

    #[test]
    fn a_page_with_nothing_to_repoint_is_left_byte_identical() {
        // Rewriting every page with identical bytes would put the whole wiki
        // in one commit's diff and bury what the rename actually did.
        let wiki = TempWiki::new("rename-untouched");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "ada.md", "# Ada").unwrap();
        write_page(&wiki.root, "unrelated.md", "Nothing to see.\n").unwrap();

        let result = rename_page(&wiki.root, "ada.md", "lovelace.md").expect("rename");
        assert!(!result.relinked.contains(&"unrelated.md".to_string()));
        assert_eq!(read_page(&wiki.root, "unrelated.md").unwrap(), "Nothing to see.\n");
    }

    #[test]
    fn relinking_recognises_the_spellings_the_renderer_accepts() {
        let wiki = TempWiki::new("rename-spellings");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "people/ada.md", "# Ada").unwrap();
        write_page(
            &wiki.root,
            "index.md",
            "[[people/ada]] [[ people/ada ]] [[./people/ada]] [[people/ada.md]] [[people/adam]]\n",
        )
        .unwrap();

        rename_page(&wiki.root, "people/ada.md", "lovelace.md").expect("rename");

        // Every spelling of the target is repointed, and rewritten to the
        // canonical `.md`-less form schema.md specifies. A different page whose
        // name merely starts the same is not touched.
        assert_eq!(
            read_page(&wiki.root, "index.md").unwrap(),
            "[[lovelace]] [[lovelace]] [[lovelace]] [[lovelace]] [[people/adam]]\n",
        );
    }

    #[test]
    fn a_self_link_is_repointed_too() {
        let wiki = TempWiki::new("rename-self");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "ada.md", "# Ada\n\nSee [[ada]] — that's me.\n").unwrap();

        rename_page(&wiki.root, "ada.md", "lovelace.md").expect("rename");
        assert_eq!(
            read_page(&wiki.root, "lovelace.md").unwrap(),
            "# Ada\n\nSee [[lovelace]] — that's me.\n",
        );
    }

    #[test]
    fn rewriting_leaves_malformed_links_alone() {
        // `[[]]` is not a link, and neither is an unterminated one. Both are
        // literal text the author meant, same as in the renderer.
        assert_eq!(rewrite_wikilinks("[[]] [[ada", "ada", "lovelace"), None);
        assert_eq!(rewrite_wikilinks("no links here", "ada", "lovelace"), None);
        // An unclosed code span makes its backtick literal without swallowing
        // the rest of the line.
        assert_eq!(
            rewrite_wikilinks("` [[ada]]", "ada", "lovelace").as_deref(),
            Some("` [[lovelace]]"),
        );
    }

    #[test]
    fn page_history_reads_the_pages_own_commits() {
        let wiki = TempWiki::new("history-page");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "ada.md", "# Ada").unwrap();
        commit_turn(&wiki.root, "File Ada").expect("commit");
        write_page(&wiki.root, "other.md", "# Other").unwrap();
        commit_turn(&wiki.root, "File something else").expect("commit");
        write_page(&wiki.root, "ada.md", "# Ada Lovelace").unwrap();
        commit_turn(&wiki.root, "Expand Ada").expect("commit");

        let history = page_history(&wiki.root, "ada.md", 20).expect("history");
        let subjects: Vec<&str> = history.iter().map(|c| c.subject.as_str()).collect();

        // Newest first, and the commit that touched only another page is absent.
        assert_eq!(subjects, vec!["Expand Ada", "File Ada"]);
        assert_eq!(history[0].author, "Exponential librarian");
        assert!(!history[0].sha.is_empty());
        // ISO-8601, for the page to format however the reader's locale wants.
        assert!(history[0].date.starts_with("20"), "got {}", history[0].date);
    }

    #[test]
    fn page_history_survives_a_rename() {
        // The promise rename makes: moving a page does not cost it its past.
        let wiki = TempWiki::new("history-follow");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "ada.md", "# Ada").unwrap();
        commit_turn(&wiki.root, "File Ada").expect("commit");

        rename_page(&wiki.root, "ada.md", "people/lovelace.md").expect("rename");
        commit_turn(&wiki.root, "Rename Ada").expect("commit");

        let subjects: Vec<String> = page_history(&wiki.root, "people/lovelace.md", 20)
            .expect("history")
            .into_iter()
            .map(|c| c.subject)
            .collect();
        assert_eq!(subjects, vec!["Rename Ada", "File Ada"]);
    }

    #[test]
    fn recent_changes_lists_the_wiki_with_the_files_each_commit_touched() {
        let wiki = TempWiki::new("history-recent");
        init_at(&wiki.root).expect("init");
        commit_turn(&wiki.root, "Wiki created").expect("commit");
        write_page(&wiki.root, "people/ada.md", "# Ada").unwrap();
        write_page(&wiki.root, "index.md", "- [[people/ada]]\n").unwrap();
        commit_turn(&wiki.root, "File Ada and link her").expect("commit");

        let changes = recent_changes(&wiki.root, 20).expect("recent");
        assert_eq!(changes[0].subject, "File Ada and link her");
        let mut paths = changes[0].paths.clone();
        paths.sort();
        assert_eq!(paths, vec!["index.md", "people/ada.md"]);
        assert_eq!(changes[1].subject, "Wiki created");
    }

    #[test]
    fn history_is_bounded_however_much_is_asked_for() {
        let wiki = TempWiki::new("history-bounded");
        init_at(&wiki.root).expect("init");
        for i in 0..8 {
            write_page(&wiki.root, "page.md", &format!("revision {i}")).unwrap();
            commit_turn(&wiki.root, &format!("Revision {i}")).expect("commit");
        }

        assert_eq!(recent_changes(&wiki.root, 3).expect("recent").len(), 3);
        // A caller asking for everything still gets a list that fits in a UI.
        assert!(recent_changes(&wiki.root, usize::MAX).expect("recent").len() <= MAX_HISTORY);
        // And zero is read as "one", not as "no limit" — git treats
        // --max-count=0 as an empty log, which reads as "no history".
        assert_eq!(recent_changes(&wiki.root, 0).expect("recent").len(), 1);
    }

    #[test]
    fn history_of_a_wiki_without_git_is_empty_rather_than_an_error() {
        // A folder restored from a backup that lost .git still opens; it just
        // has no past. wiki_status already reports git: false so the UI can
        // explain, and a thrown error here would be a worse way to find out.
        let wiki = TempWiki::new("history-nogit");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "ada.md", "# Ada").unwrap();
        std::fs::remove_dir_all(wiki.root.join(".git")).unwrap();

        assert_eq!(recent_changes(&wiki.root, 20), Ok(Vec::new()));
        assert_eq!(page_history(&wiki.root, "ada.md", 20), Ok(Vec::new()));
    }

    #[test]
    fn history_of_a_repo_with_no_commits_yet_is_empty() {
        // `git log` on a fresh repo exits non-zero rather than printing
        // nothing, so this is a real branch and not a hypothetical one.
        let wiki = TempWiki::new("history-fresh");
        init_at(&wiki.root).expect("init");
        assert_eq!(recent_changes(&wiki.root, 20), Ok(Vec::new()));
    }

    #[test]
    fn history_obeys_the_jail() {
        let wiki = TempWiki::new("history-jail");
        init_at(&wiki.root).expect("init");
        commit_turn(&wiki.root, "Wiki created").expect("commit");
        assert_eq!(
            page_history(&wiki.root, "../outside.md", 20),
            Err(WikiError::OutsideWiki),
        );
    }

    #[test]
    fn a_commit_subject_containing_the_log_delimiters_still_parses() {
        // The subject is user (and model) text. Parsing on control characters
        // is what keeps a subject full of pipes or tabs from splitting a record.
        let wiki = TempWiki::new("history-delimiters");
        init_at(&wiki.root).expect("init");
        write_page(&wiki.root, "page.md", "x").unwrap();
        commit_turn(&wiki.root, "Weird | subject\twith\tseparators").expect("commit");

        let changes = recent_changes(&wiki.root, 5).expect("recent");
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].subject, "Weird | subject\twith\tseparators");
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
