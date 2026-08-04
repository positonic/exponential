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
    (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: Record<string, unknown>) => {
        calls.push({ cmd, args });
        const bytes = (s: string) => new TextEncoder().encode(s).length;
        switch (cmd) {
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

test("in a browser, the wiki says where it actually lives", async ({ page }) => {
  // No stub: this is what a non-desktop visitor gets.
  await page.goto("/wiki");
  await expect(page.getByText("The local wiki lives on your machine")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
});
