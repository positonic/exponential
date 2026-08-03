fn main() {
    // Commands invoked from a *remote* origin are gated by Tauri v2's ACL, and
    // an app-defined command has no permission at all unless it is declared
    // here — the runtime answers "Command <name> not allowed by ACL". Listing a
    // command autogenerates `allow-<kebab-name>` / `deny-<kebab-name>`
    // permissions, which `capabilities/remote.json` then grants to the web app's
    // origin. Every new command needs a line here *and* a grant there.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "desktop_shell_info",
                "desktop_start_login",
                "desktop_get_pending_auth",
                "wiki_init",
                "wiki_list_pages",
                "wiki_read_page",
                "wiki_write_page",
                "wiki_commit_turn",
                "wiki_search",
                "wiki_get_root",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
