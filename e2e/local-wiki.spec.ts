import { test, expect, type Page } from "@playwright/test";

const FIRST_PAINT_TIMEOUT = 60_000;

/**
 * The local wiki surface, driven against a stand-in for the Tauri shell's IPC.
 *
 * The wiki itself is a folder on disk reached over `window.__TAURI_INTERNALS__`,
 * which exists only inside the desktop shell — so CI (and a browser) would
 * otherwise only ever see the "not available here" state. Installing a fake
 * `invoke` before the page loads exercises everything above the IPC boundary:
 * listing, search, wikilink resolution, and the read/edit/save round trip.
 *
 * What it deliberately does NOT cover is the Rust side (`src-tauri/src/wiki.rs`),
 * which has its own tests. The contract between them is the command names and
 * payload shapes asserted here.
 */

const FILES: Record<string, string> = {
  "index.md":
    "# Index\n\nThe map of this wiki.\n\n## Pages\n\n- [[people/ada]] — first programmer\n- [[people/hopper]] — not written yet\n\nSee [[schema]] for the conventions.\n",
  "schema.md":
    "# How this wiki works\n\nPages refer to each other with `[[wikilinks]]` — the link text is the page's\npath without the `.md`.\n",
  "people/ada.md":
    "# Ada Lovelace\n\nWrote the first algorithm intended for a machine.\nLinked from [[index]], and see [[people/hopper]].\n",
};

/**
 * Install the fake shell bridge before any app code runs, and expose what it
 * was asked to do so a test can assert on the writes.
 */
async function installWikiStub(page: Page, files: Record<string, string> = FILES) {
  await page.addInitScript((seed: Record<string, string>) => {
    const store: Record<string, string> = { ...seed };
    const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
    (window as unknown as { __WIKI_CALLS__: typeof calls }).__WIKI_CALLS__ = calls;
    (window as unknown as { __WIKI_FILES__: typeof store }).__WIKI_FILES__ = store;

    const root = "/Users/dev/Documents/exponential-wiki";

    // Stand-in for Tauri's event channel. `transformCallback` hands a JS
    // function to Rust as an id; here it just goes in a map, and
    // `__WIKI_EMIT__` lets a test play the shell announcing a change.
    const handlers = new Map<number, (message: unknown) => void>();
    let nextId = 1;
    (window as unknown as { __WIKI_EMIT__: (payload: unknown) => void }).__WIKI_EMIT__ = (
      payload,
    ) => {
      handlers.forEach((handler, id) => handler({ event: "wiki://changed", id, payload }));
    };

    const history: { sha: string; subject: string; author: string; date: string; paths: string[] }[] =
      [
        {
          sha: "abc1234",
          subject: "File Ada and link her from the index",
          author: "Exponential librarian",
          date: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          paths: ["index.md", "people/ada.md"],
        },
        {
          sha: "def5678",
          subject: "Wiki created",
          author: "Exponential librarian",
          date: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
          paths: ["index.md", "log.md", "schema.md"],
        },
      ];

    (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
          transformCallback: (cb: (message: unknown) => void) => number;
        };
      }
    ).__TAURI_INTERNALS__ = {
      transformCallback: (cb) => {
        const id = nextId++;
        handlers.set(id, cb);
        return id;
      },
      invoke: (cmd: string, args?: Record<string, unknown>) => {
        calls.push({ cmd, args });
        const bytes = (s: string) => new TextEncoder().encode(s).length;
        switch (cmd) {
          case "plugin:event|listen":
            // The handler was already registered by transformCallback; the id
            // it returned doubles as the subscription id.
            return Promise.resolve(args?.handler);
          case "plugin:event|unlisten":
            handlers.delete(Number(args?.eventId));
            return Promise.resolve(null);
          case "wiki_page_history":
            return Promise.resolve(
              history
                .filter((c) => c.paths.includes(String(args?.path)))
                // Per-page history carries no file list, matching the real one.
                .map((c) => ({ ...c, paths: [] })),
            );
          case "wiki_recent_changes":
            return Promise.resolve(history);
          case "wiki_delete_page":
            delete store[String(args?.path)];
            return Promise.resolve(null);
          case "wiki_rename_page": {
            // A stand-in, not a re-implementation: the Rust side owns the real
            // relinking (and its own tests). This only has to move the page
            // and report a plausible shape, so the UI's half is exercised.
            const from = String(args?.from);
            const to = String(args?.to).endsWith(".md")
              ? String(args?.to)
              : `${String(args?.to)}.md`;
            store[to] = store[from] ?? "";
            delete store[from];
            const target = from.replace(/\.md$/, "");
            const replacement = to.replace(/\.md$/, "");
            const relinked: string[] = [];
            for (const path of Object.keys(store)) {
              const next = (store[path] ?? "").split(`[[${target}]]`).join(`[[${replacement}]]`);
              if (next !== store[path]) {
                store[path] = next;
                relinked.push(path);
              }
            }
            return Promise.resolve({ from, to, relinked });
          }
          case "wiki_get_root":
            return Promise.resolve(root);
          case "wiki_status":
            return Promise.resolve({
              root,
              exists: true,
              git: true,
              pageCount: Object.keys(store).length,
            });
          case "wiki_init":
            return Promise.resolve({ root, created: false, git: true });
          case "wiki_list_pages":
            return Promise.resolve(
              Object.keys(store)
                .sort()
                .map((path) => ({ path, bytes: bytes(store[path] ?? "") })),
            );
          case "wiki_read_page": {
            const content = store[String(args?.path)];
            return content === undefined
              ? Promise.reject(new Error("page not found"))
              : Promise.resolve(content);
          }
          case "wiki_write_page":
            store[String(args?.path)] = String(args?.content);
            return Promise.resolve(null);
          case "wiki_commit_turn":
            return Promise.resolve({ committed: true, sha: "abc1234" });
          case "wiki_search": {
            const q = String(args?.query).toLowerCase();
            return Promise.resolve(
              Object.keys(store)
                .filter(
                  (p) =>
                    p.toLowerCase().includes(q) || (store[p] ?? "").toLowerCase().includes(q),
                )
                .map((p) => ({
                  path: p,
                  pathMatched: p.toLowerCase().includes(q),
                  lines: (store[p] ?? "")
                    .split("\n")
                    .filter((l) => l.toLowerCase().includes(q))
                    .slice(0, 3)
                    .map((l) => l.trim()),
                })),
            );
          }
          default:
            return Promise.reject(new Error(`unexpected command ${cmd}`));
        }
      },
    };
  }, files);
}

const calls = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __WIKI_CALLS__: { cmd: string }[] }).__WIKI_CALLS__,
  );

const fileOnDisk = (page: Page, path: string) =>
  page.evaluate(
    (p) => (window as unknown as { __WIKI_FILES__: Record<string, string> }).__WIKI_FILES__[p],
    path,
  );

test("lists the wiki's pages, grouped by folder", async ({ page }) => {
  await installWikiStub(page);
  await page.goto("/wiki");

  await expect(page.getByRole("heading", { name: "Local wiki" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(page.getByText("/Users/dev/Documents/exponential-wiki")).toBeVisible();

  // The spine sorts first, ahead of the alphabetically-earlier folder pages.
  await expect(page.getByText("index.md", { exact: true })).toBeVisible();
  await expect(page.getByText("schema.md", { exact: true })).toBeVisible();
  await expect(page.getByText("people", { exact: true })).toBeVisible();
  await expect(page.getByText("people/ada.md", { exact: true })).toBeVisible();

  await test.info().attach("wiki-list", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("searching asks the shell, not the browser", async ({ page }) => {
  await installWikiStub(page);
  await page.goto("/wiki");
  await expect(page.getByRole("heading", { name: "Local wiki" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await page.getByPlaceholder("Search the wiki…").fill("algorithm");

  // "algorithm" appears in no filename — only inside a page's text.
  await expect(page.getByText("Wrote the first algorithm intended for a machine.")).toBeVisible();
  expect((await calls(page)).some((c) => c.cmd === "wiki_search")).toBe(true);
});

test("wikilinks navigate, and unwritten ones are marked", async ({ page }) => {
  await installWikiStub(page);
  await page.goto("/wiki/index");

  await expect(page.getByRole("heading", { name: "Index" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  // A link to a page that exists is an ordinary link; one to a page nobody has
  // written carries the "missing" class the wiki styles as a red link.
  const ada = page.locator("a.wiki-link", { hasText: "people/ada" });
  const hopper = page.locator("a.wiki-link", { hasText: "people/hopper" });
  await expect(ada).toBeVisible();
  await expect(ada).not.toHaveClass(/wiki-link--missing/);
  await expect(hopper).toHaveClass(/wiki-link--missing/);

  // The syntax documented inside a code span on schema.md is not a link.
  await page.goto("/wiki/schema");
  await expect(page.getByRole("heading", { name: "How this wiki works" })).toBeVisible();
  await expect(page.locator("code", { hasText: "[[wikilinks]]" })).toBeVisible();
  await expect(page.locator("a.wiki-link")).toHaveCount(0);

  await test.info().attach("wiki-page", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("following an unwritten link offers to write it", async ({ page }) => {
  await installWikiStub(page);
  await page.goto("/wiki/index");
  await expect(page.getByRole("heading", { name: "Index" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await page.locator("a.wiki-link--missing", { hasText: "people/hopper" }).click();

  await expect(page).toHaveURL(/\/wiki\/people\/hopper$/);
  await expect(page.getByText("Nobody has written this page yet")).toBeVisible();

  await page.getByRole("button", { name: "Write it" }).click();
  // Seeded from the filename so the page starts with a heading, per schema.md.
  await expect(page.getByRole("textbox")).toHaveValue("# hopper\n\n");

  await test.info().attach("wiki-missing-page", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("editing writes the exact bytes back and commits", async ({ page }) => {
  await installWikiStub(page);
  await page.goto("/wiki/people/ada");
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await page.getByRole("button", { name: "Edit" }).click();

  const editor = page.getByRole("textbox");
  // What you edit is the file — not a re-serialisation of it.
  await expect(editor).toHaveValue(FILES["people/ada.md"]!);

  const edited = `${FILES["people/ada.md"]!}\nAlso see [[decisions/why-postgres]].\n`;
  await editor.fill(edited);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

  // The whole point: the wiki's own syntax survives a save untouched. A
  // ProseMirror round trip escapes these into \[\[…\]\] and reflows the
  // paragraphs, which is why this surface edits raw Markdown.
  expect(await fileOnDisk(page, "people/ada.md")).toBe(edited);

  const cmds = (await calls(page)).map((c) => c.cmd);
  expect(cmds).toContain("wiki_write_page");
  // Every write lands in git the same way a librarian turn does.
  expect(cmds.indexOf("wiki_commit_turn")).toBeGreaterThan(cmds.indexOf("wiki_write_page"));

  // The saved link now resolves in the rendered page.
  await expect(page.locator("a.wiki-link", { hasText: "decisions/why-postgres" })).toBeVisible();
});

test("a page changed on disk mid-edit is not silently overwritten", async ({ page }) => {
  await installWikiStub(page);
  await page.goto("/wiki/people/ada");
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("textbox").fill("# Ada\n\nMy version.\n");

  // The librarian files something to the same page while the editor is open.
  await page.evaluate(() => {
    (window as unknown as { __WIKI_FILES__: Record<string, string> }).__WIKI_FILES__[
      "people/ada.md"
    ] = "# Ada Lovelace\n\nThe librarian's version.\n";
  });

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("This page changed on disk")).toBeVisible();

  // Backing out leaves the librarian's copy intact.
  await page.getByRole("button", { name: "Keep what's on disk" }).click();
  expect(await fileOnDisk(page, "people/ada.md")).toBe(
    "# Ada Lovelace\n\nThe librarian's version.\n",
  );
});

test("navigating away from an open editor does not carry the draft to the next page", async ({
  page,
}) => {
  await installWikiStub(page);
  await page.goto("/wiki/index");
  await expect(page.getByRole("heading", { name: "Index" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  // Straight from one page to another — no trip through the list, which would
  // unmount the view and hide the problem.
  await page.locator("a.wiki-link", { hasText: "people/ada" }).click();
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("textbox").fill("# Ada\n\nUnsaved edits to Ada.\n");

  // Both pages are the same route with different params, so the view is
  // reused rather than remounted. An editor left open must not follow.
  await page.goBack();

  await expect(page).toHaveURL(/\/wiki\/index$/);
  await expect(page.getByRole("heading", { name: "Index" })).toBeVisible();
  // Reading index.md, not editing it with Ada's text.
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);

  // And Ada's unsaved draft never reached index.md.
  expect(await fileOnDisk(page, "index.md")).toBe(FILES["index.md"]!);
});

/**
 * Opening the palette. Mantine's `mod+k` accepts either modifier, and
 * `ControlOrMeta` lets this pass on a Linux CI runner and a Mac alike.
 */
async function openPalette(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  return page.getByRole("dialog");
}

test("the command palette can reach the wiki, and its pages", async ({ page }) => {
  await installWikiStub(page);
  await page.goto("/wiki");
  await expect(page.getByRole("heading", { name: "Local wiki" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  const palette = await openPalette(page);
  // Scoped to the dialog throughout: the page behind it is the wiki, so
  // "Local wiki" appears in its heading too.
  await expect(palette.getByText("Local wiki", { exact: true })).toBeVisible();

  // A word that appears in no filename and in no server-side entity — only
  // inside a wiki page's body.
  await palette.getByPlaceholder("Search, command, or ask Zoe…").fill("algorithm");

  // Titled by the page's own heading rather than its filename.
  await expect(palette.getByText("Ada Lovelace")).toBeVisible();
  await expect(palette.getByText("Wrote the first algorithm intended for a machine.")).toBeVisible();

  // The hits came off the disk, not out of the server's search.
  expect((await calls(page)).some((c) => c.cmd === "wiki_search")).toBe(true);

  await palette.getByText("Ada Lovelace").click();
  await expect(page).toHaveURL(/\/wiki\/people\/ada$/);

  await test.info().attach("wiki-command-palette", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("without a desktop shell the palette offers no wiki at all", async ({ page }) => {
  // No stub: in a browser (and in the Electron shell) there is no wiki to
  // reach, so neither the entry nor a local search may appear.
  await page.goto("/wiki");
  await expect(page.getByText("The local wiki lives on your machine")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  const palette = await openPalette(page);
  await expect(palette.getByPlaceholder("Search, command, or ask Zoe…")).toBeVisible();
  await expect(palette.getByText("Local wiki", { exact: true })).toHaveCount(0);
});

test("renaming a page moves it, repoints what linked to it, and says how many", async ({
  page,
}) => {
  await installWikiStub(page);
  await page.goto("/wiki/people/ada");
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await page.getByRole("button", { name: "Page actions" }).click();
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  await page.getByLabel("New path").fill("people/lovelace.md");
  await page.getByRole("button", { name: "Rename", exact: true }).click();

  // Followed to the new path, and the notification names the collateral: a
  // rename edits other pages, and finding that out later from `git log` would
  // be a nasty surprise.
  await expect(page).toHaveURL(/\/wiki\/people\/lovelace$/);
  await expect(page.getByText(/Repointed links on 1 other page/)).toBeVisible();

  expect(await fileOnDisk(page, "people/ada.md")).toBeUndefined();
  expect(await fileOnDisk(page, "people/lovelace.md")).toContain("Ada Lovelace");
  // index.md now points at where the page actually is.
  expect(await fileOnDisk(page, "index.md")).toContain("[[people/lovelace]]");

  // And it went into git the same way every other write does.
  const cmds = (await calls(page)).map((c) => c.cmd);
  expect(cmds.indexOf("wiki_commit_turn")).toBeGreaterThan(cmds.indexOf("wiki_rename_page"));
});

test("deleting a page asks first, and backing out changes nothing", async ({ page }) => {
  await installWikiStub(page);
  await page.goto("/wiki/people/ada");
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await page.getByRole("button", { name: "Page actions" }).click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();

  // The librarian may have written this page and gets no say, so the person
  // does — and the dialog says what happens to the links.
  await expect(page.getByText("Delete this page?")).toBeVisible();
  await expect(page.getByText(/not written.*yet/s)).toBeVisible();

  await page.getByRole("button", { name: "Keep it" }).click();
  expect(await fileOnDisk(page, "people/ada.md")).toBe(FILES["people/ada.md"]!);
  expect((await calls(page)).some((c) => c.cmd === "wiki_delete_page")).toBe(false);

  // Confirming does delete it, and lands back on the list.
  await page.getByRole("button", { name: "Page actions" }).click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page).toHaveURL(/\/wiki$/);
  expect(await fileOnDisk(page, "people/ada.md")).toBeUndefined();
});

test("a page shows its own history, and the wiki shows everyone's", async ({ page }) => {
  await installWikiStub(page);
  await page.goto("/wiki/people/ada");
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  // Only the commits that touched this page, with the short hash `git show`
  // takes and a readable age.
  await expect(page.getByText("History", { exact: true })).toBeVisible();
  await expect(page.getByText("File Ada and link her from the index")).toBeVisible();
  await expect(page.getByText("abc1234")).toBeVisible();
  await expect(page.getByText("3 hours ago")).toBeVisible();
  await expect(page.getByText("Wiki created")).toHaveCount(0);

  await test.info().attach("wiki-page-history", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  // The wiki-wide view carries the file list each commit touched, since there
  // you don't already know which page you're looking at.
  await page.goto("/wiki");
  await expect(page.getByRole("heading", { name: "Local wiki" })).toBeVisible();
  // The label, not the radio: Mantine's SegmentedControl keeps the input
  // visually hidden and puts the click target on the label.
  await page.getByText("Recent changes", { exact: true }).click();

  await expect(page.getByText("Wiki created")).toBeVisible();
  await expect(page.getByRole("link", { name: "people/ada.md" })).toBeVisible();
  // Search belongs to the page list, not to a commit log.
  await expect(page.getByPlaceholder("Search the wiki…")).toHaveCount(0);

  await test.info().attach("wiki-recent-changes", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("the list refreshes when the shell says the wiki changed", async ({ page }) => {
  await installWikiStub(page);
  await page.goto("/wiki");
  await expect(page.getByRole("heading", { name: "Local wiki" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(page.getByText("decisions/why-postgres.md", { exact: true })).toHaveCount(0);

  // The librarian files a page from the chat drawer, and the shell announces
  // it. Before this event existed you had to click away and back.
  await page.evaluate(() => {
    (window as unknown as { __WIKI_FILES__: Record<string, string> }).__WIKI_FILES__[
      "decisions/why-postgres.md"
    ] = "# Why Postgres\n";
    (window as unknown as { __WIKI_EMIT__: (p: unknown) => void }).__WIKI_EMIT__({
      kind: "write",
      path: "decisions/why-postgres.md",
    });
  });

  await expect(page.getByText("decisions/why-postgres.md", { exact: true })).toBeVisible();
});

test("in a browser, the wiki says where it actually lives", async ({ page }) => {
  // No stub: this is what a non-desktop visitor gets.
  await page.goto("/wiki");
  await expect(page.getByText("The local wiki lives on your machine")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
});

/**
 * A desktop shell whose wiki folder does not exist yet — what a first-time
 * user actually meets. `initFails` makes `wiki_init` reject, standing in for
 * the realistic failure: a folder the app may not write to.
 */
async function installUncreatedWikiStub(page: Page, { initFails = false } = {}) {
  await page.addInitScript((failing: boolean) => {
    const store: Record<string, string> = {};
    let exists = false;
    const calls: string[] = [];
    (window as unknown as { __WIKI_CALLS__: string[] }).__WIKI_CALLS__ = calls;
    const root = "/Users/dev/Documents/exponential-wiki";

    (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: Record<string, unknown>) => {
        calls.push(cmd);
        switch (cmd) {
          case "wiki_status":
            // pageCount derived, not hardcoded: the real command counts the
            // folder, and a stub that reports 0 pages while wiki_list_pages
            // returns three is a lie the next reader would have to discover.
            return Promise.resolve({
              root,
              exists,
              git: exists,
              pageCount: Object.keys(store).length,
            });
          case "wiki_init": {
            if (failing) {
              return Promise.reject(new Error("Permission denied (os error 13)"));
            }
            exists = true;
            // The three fixed files `init_at` seeds.
            store["index.md"] = "# Index\n";
            store["schema.md"] = "# How this wiki works\n";
            store["log.md"] = "# Log\n";
            return Promise.resolve({ root, created: true, git: true });
          }
          case "wiki_list_pages":
            return Promise.resolve(
              Object.keys(store)
                .sort()
                .map((path) => ({ path, bytes: (store[path] ?? "").length })),
            );
          case "wiki_read_page":
            return Promise.resolve(store[String(args?.path)] ?? "");
          case "wiki_get_root":
            return Promise.resolve(root);
          case "wiki_recent_changes":
            return Promise.resolve([]);
          default:
            return Promise.reject(new Error(`unexpected command ${cmd}`));
        }
      },
    };
  }, initFails);
}

const commandsCalled = (page: Page) =>
  page.evaluate(() => (window as unknown as { __WIKI_CALLS__: string[] }).__WIKI_CALLS__);

test("with no wiki yet, arriving at /wiki offers to create one — and creates nothing on its own", async ({
  page,
}) => {
  await installUncreatedWikiStub(page);
  await page.goto("/wiki");

  await expect(page.getByText("Create your local wiki")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  // It names the folder it would create before creating it.
  await expect(page.getByText("/Users/dev/Documents/exponential-wiki")).toBeVisible();

  // The guarantee worth protecting: a folder and a git repo appear in someone's
  // Documents because they chose it, never as a side effect of navigation.
  expect(await commandsCalled(page)).not.toContain("wiki_init");

  await page.getByRole("button", { name: "Create wiki" }).click();

  // Created, seeded, and listed. The visible result is asserted first: it's
  // what the reader cares about, and waiting on it means the call log below
  // is read after the handler has run rather than racing it.
  await expect(page.getByRole("heading", { name: "Local wiki" })).toBeVisible();
  // Asserted on the row's link target rather than its text: it pins that the
  // seed is listed *and* points at the right page, and it can't be made
  // ambiguous later by a breadcrumb or header repeating the filename.
  for (const seed of ["index", "schema", "log"]) {
    await expect(page.locator(`a[href="/wiki/${seed}"]`)).toBeVisible();
  }
  expect(await commandsCalled(page)).toContain("wiki_init");
});

test("a wiki that cannot be created says why", async ({ page }) => {
  await installUncreatedWikiStub(page, { initFails: true });
  await page.goto("/wiki");

  await expect(page.getByText("Create your local wiki")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await page.getByRole("button", { name: "Create wiki" }).click();

  // The reason, not a spinner that never resolves. Scoped to <main>, since
  // Next's route announcer is also a role="alert" living outside it.
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Permission denied");
  // And the button comes back, so a fixed permission can be retried.
  await expect(page.getByRole("button", { name: "Create wiki" })).toBeEnabled();
});
