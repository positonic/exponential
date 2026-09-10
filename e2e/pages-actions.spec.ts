import { test, expect } from "@playwright/test";

const FIRST_PAINT_TIMEOUT = 60_000;

/**
 * The Page actions menu (the `•••` on a page) and its Delete confirmation.
 *
 * Delete is a hard delete with no archive behind it, so the dialog has to do
 * two jobs: say what breaks, and refuse the reflex click. Both are asserted on
 * visible text and ARIA labels only — never CSS classes.
 */

/** Create a throwaway page from the list so a destructive test never touches
 * the seeded fixture pages other specs assert on. Returns its title and URL. */
async function createScratchPage(
  page: import("@playwright/test").Page,
  title: string,
) {
  await page.goto("/w/dev-fixture/pages");
  await expect(page.getByRole("button", { name: "New page" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await page.getByRole("button", { name: "New page" }).click();
  // The editor route opens on the new page; rename it so the title gate has
  // something unambiguous to match.
  const titleInput = page.getByLabel("Page title");
  await expect(titleInput).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await titleInput.fill(title);
  // Wait for the rename round-trip: the menu reads the title from the cached
  // `page.get` entry, which the mutation patches on success.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/trpc/") && r.url().includes("page.update"),
    ),
    titleInput.blur(),
  ]);
  await expect(titleInput).toHaveValue(title);
  return { title, url: page.url() };
}

test("the menu lists every action in the documented order", async ({ page }) => {
  await page.goto("/w/dev-fixture/pages");
  await page.getByRole("link", { name: /Cycle 12 retro notes/ }).first().click();
  await expect(page.getByLabel("Page actions")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await page.getByLabel("Page actions").click();
  const labels = await page.getByRole("menuitem").allInnerTexts();
  // The seeded page has no sub-pages, so "Duplicate with sub-pages" is absent.
  expect(labels.map((l) => l.trim())).toEqual([
    "Full width",
    "Copy link",
    "Open in new tab",
    "Copy markdown",
    "Markdown",
    "Print / Save as PDF",
    "Move to project…",
    "Include in search",
    "Duplicate",
    "Delete",
  ]);
});

// `pages:full-width` is per-browser, so a failure mid-test would otherwise
// leak a widened column into every later test in this worker.
test.afterEach(async ({ page }) => {
  await page
    .evaluate(() => localStorage.removeItem("pages:full-width"))
    .catch(() => undefined);
});

test("Full width widens the reading column and persists", async ({ page }) => {
  await page.goto("/w/dev-fixture/pages");
  await page.getByRole("link", { name: /Cycle 12 retro notes/ }).first().click();
  const column = page.locator('[data-print="column"]');
  await expect(page.getByLabel("Page actions")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  const narrow = (await column.boundingBox())!.width;

  await page.getByLabel("Page actions").click();
  await page.getByRole("menuitem", { name: "Full width" }).click();
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await column.boundingBox())!.width)
    .toBeGreaterThan(narrow);

  // Stored per browser, so it survives a reload.
  await page.reload();
  await expect(page.getByLabel("Page actions")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  expect((await column.boundingBox())!.width).toBeGreaterThan(narrow);

});

test("Copy link copies the internal editor URL, not the public one", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/w/dev-fixture/pages");
  await page.getByRole("link", { name: /Cycle 12 retro notes/ }).first().click();
  await expect(page.getByLabel("Page actions")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  const pageUrl = page.url();

  await page.getByLabel("Page actions").click();
  await page.getByRole("menuitem", { name: "Copy link" }).click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(pageUrl);
  expect(copied).toContain("/w/dev-fixture/pages/");
  // The public render lives under /p/<slug>-<publicId>; Copy link never points
  // there, published or not.
  expect(copied).not.toContain("/p/");
});

test("Copy markdown serialises the live editor, unsaved edits included", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const marker = `Unsaved heading ${Date.now()}`;
  await createScratchPage(page, `Scratch markdown ${Date.now()}`);

  // Type straight into the body and copy immediately — well inside the
  // autosave debounce, so this is the live doc, not the stored one.
  const body = page.locator(".ProseMirror").first();
  await body.click();
  await page.keyboard.type(`## ${marker}`);

  await page.getByLabel("Page actions").click();
  await page.getByRole("menuitem", { name: "Copy markdown" }).click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`## ${marker}`);
});

test("Export > Markdown downloads a .md file named after the page", async ({
  page,
}) => {
  const { title } = await createScratchPage(page, `Scratch export ${Date.now()}`);

  await page.getByLabel("Page actions").click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Markdown", exact: true })
    .click();
  const file = await download;

  // slugifyPageTitle turns "Scratch export 1234" into "scratch-export-1234".
  expect(file.suggestedFilename()).toBe(
    `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`,
  );
});

test("Print hides the app chrome and lets the column run full width", async ({
  page,
}) => {
  await page.goto("/w/dev-fixture/pages");
  await page.getByRole("link", { name: /Cycle 12 retro notes/ }).first().click();
  await expect(page.getByLabel("Page actions")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  const column = page.locator('[data-print="column"]');
  const onScreen = (await column.boundingBox())!.width;

  // The menu item calls window.print(); Playwright can't drive the native
  // dialog, so assert on what the dialog would render — the print stylesheet.
  await page.emulateMedia({ media: "print" });

  await expect(page.locator("aside").first()).toBeHidden();
  // The page's own action row (full width, favourite, Share, the menu itself).
  await expect(page.locator('[data-print="hide"]').first()).toBeHidden();

  // On screen the column is capped at max-w-3xl (768px); on paper the cap is
  // lifted. Compared against itself rather than against <main>, so a
  // scrollbar or a collapsed sidebar can't move the goalposts.
  const onPaper = (await column.boundingBox())!.width;
  expect(onScreen).toBeLessThanOrEqual(768);
  expect(onPaper).toBeGreaterThan(768);

  await test.info().attach("print-layout", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
  await page.emulateMedia({ media: "screen" });
});

test("Move to project lists only projects the user can edit", async ({ page }) => {
  await createScratchPage(page, `Scratch move ${Date.now()}`);

  await page.getByLabel("Page actions").click();
  await page.getByRole("menuitem", { name: "Move to project…" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project").click();
  // "No project" is always offered; the rest are the fixture's own projects.
  await expect(page.getByRole("option", { name: "No project" })).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Fixture Linked Project" }),
  ).toBeVisible();
});

test("Include in search toggles and survives a reload", async ({ page }) => {
  await createScratchPage(page, `Scratch search ${Date.now()}`);

  await page.getByLabel("Page actions").click();
  const toggle = page.getByLabel("Include in search");
  // Pages are indexed by default.
  await expect(toggle).toBeChecked();

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/trpc/") && r.url().includes("page.update"),
    ),
    page.getByRole("menuitem", { name: "Include in search" }).click(),
  ]);
  await expect(toggle).not.toBeChecked();

  await page.reload();
  await page.getByLabel("Page actions").click();
  await expect(page.getByLabel("Include in search")).not.toBeChecked();
});

test("the reverse-link scan runs, and a pasted URL is not a link", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { url: targetUrl } = await createScratchPage(
    page,
    `Scratch target ${Date.now()}`,
  );
  const targetId = targetUrl.split("/").pop()!;

  // Copy the target's own link, then paste it into a second page's body. That
  // is a `link` mark whose href ends in the target's id, not a `pageLink`
  // node — exactly the thing a `::text LIKE '%<id>%'` pre-filter would count.
  // (Pasting rather than typing: a typed "/" opens the block menu.)
  await page.getByLabel("Page actions").click();
  await page.getByRole("menuitem", { name: "Copy link" }).click();

  await createScratchPage(page, `Scratch mentioner ${Date.now()}`);
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("see ");
  await page.keyboard.press("ControlOrMeta+v");
  await page.keyboard.type(" ");
  await page.waitForResponse(
    (r) => r.url().includes("/api/trpc/") && r.url().includes("page.update"),
  );

  await page.goto(`/w/dev-fixture/pages/${targetId}`);
  await expect(page.getByLabel("Page actions")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await page.getByLabel("Page actions").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(page.getByRole("dialog").getByText("0 pages link here")).toBeVisible();
});

test("Delete states the impact and requires the title to be typed", async ({
  page,
}) => {
  const { title } = await createScratchPage(page, `Scratch delete ${Date.now()}`);

  await page.getByLabel("Page actions").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("What this breaks")).toBeVisible();
  await expect(dialog.getByText("0 pages link here")).toBeVisible();
  await expect(dialog.getByText("Counted across the pages you can see.")).toBeVisible();
  await expect(dialog.getByText("0 sub-pages become top-level")).toBeVisible();
  await expect(dialog.getByText("No public URL is affected")).toBeVisible();

  // The reflex click is refused until the exact title is typed.
  const confirm = dialog.getByRole("button", { name: "Delete page" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type the page title to confirm").fill("wrong");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type the page title to confirm").fill(title);
  await expect(confirm).toBeEnabled();

  await test.info().attach("delete-dialog", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await confirm.click();

  // Back on the list, and the page is gone from it.
  await expect(page).toHaveURL(/\/w\/dev-fixture\/pages$/);
  await expect(page.getByRole("button", { name: "New page" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(page.getByText(title)).toHaveCount(0);
});
