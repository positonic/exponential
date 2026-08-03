# Exponential Beta — Tauri shell

A Tauri v2 macOS shell that loads the Exponential web app and gives it a small
native surface. It exists to probe whether a local-first Exponential is worth
pursuing (feature: *Local-first desktop foray*), **not** to replace the Electron
app in `../electron` — that one is still the shipped desktop app and is untouched
by anything here.

The two shells are deliberately installable side by side: different bundle id
(`im.exponential.beta` vs `im.exponential.app`) and different URL scheme.

## Running it

```bash
npm run dev          # in one terminal — the shell's debug build loads localhost:3000
npm run tauri:dev    # in another
```

Debug builds are hard-wired to `http://localhost:3000` and release builds to
`https://exponential.im`, so a dev build can never silently drive production.

```bash
npm run tauri:build  # release .app in src-tauri/target/release/bundle
```

No signing, notarization, or auto-update — these are personal builds. macOS only;
Windows/Linux get their own go/no-go later.

## Testing sign-in

macOS only routes a custom URL scheme to a **bundled** app, so `exponential-beta://`
deep links — and therefore sign-in — cannot be exercised by `tauri dev` at all.
Build the app, then point it somewhere safe with `EXPONENTIAL_BETA_URL` (the same
escape hatch as Electron's `ELECTRON_PROD_URL`):

```bash
npm run tauri:build
EXPONENTIAL_BETA_URL=http://localhost:3000 \
  "src-tauri/target/release/bundle/macos/Exponential Beta.app/Contents/MacOS/exponential-beta"
```

The env var cannot grant trust — an origin missing from `capabilities/remote.json`
loads as an inert page with no shell commands.

Completing sign-in needs one manual step that no shell can avoid: browsers ask
"Open Exponential Beta?" before handing a custom scheme to the OS. The Electron
shell prompts identically.

## Adding a command

Remote pages are not trusted by default, so a new `#[tauri::command]` needs three
edits, and skipping either of the last two fails at runtime with
`Command <name> not allowed by ACL`:

1. Write the command and add it to `generate_handler!` in `src/lib.rs`.
2. Add its name to the `commands(&[...])` list in `build.rs` — this generates an
   `allow-<kebab-case-name>` permission.
3. Grant that permission in `capabilities/remote.json`.
