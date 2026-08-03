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

/// Where the wiki lives. Held in managed state; `wiki_set_root` swaps it and
/// every command re-jails against whatever is current.
#[derive(Default)]
pub struct WikiRoot(pub Mutex<Option<PathBuf>>);

/// Default location — visible in Finder on purpose. The wiki is the user's, and
/// a folder they can open, edit, and `git log` is the whole point.
fn default_root() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    Path::new(&home).join("Documents").join("exponential-wiki")
}

fn current_root(state: &WikiRoot) -> PathBuf {
    state
        .0
        .lock()
        .expect("wiki root mutex poisoned")
        .clone()
        .unwrap_or_else(default_root)
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
    // canonical path of its own yet, but its parent directory does.
    let mut probe = joined.as_path();
    let existing = loop {
        if probe.exists() {
            break probe;
        }
        match probe.parent() {
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
