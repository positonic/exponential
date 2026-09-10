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
 * the seeded fixture pages other specs assert on. Returns its title. */
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
  return title;
}

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
  const title = await createScratchPage(page, `Scratch export ${Date.now()}`);

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

  // The menu item calls window.print(); Playwright can't drive the native
  // dialog, so assert on what the dialog would render — the print stylesheet.
  await expect(page.getByLabel("Page actions")).toBeVisible();
  await page.emulateMedia({ media: "print" });

  await expect(page.locator("aside").first()).toBeHidden();
  // The page's own action row (full width, favourite, Share, the menu itself).
  await expect(page.locator('[data-print="hide"]').first()).toBeHidden();

  const columnWidth = await page
    .locator('[data-print="column"]')
    .evaluate((el) => el.getBoundingClientRect().width);
  const mainWidth = await page
    .locator("main.sidebar-offset")
    .evaluate((el) => el.getBoundingClientRect().width);
  // On screen the column is capped at max-w-3xl (768px); on paper it fills
  // the sheet. A couple of px of slack for the sub-pixel layout.
  expect(columnWidth).toBeGreaterThan(768);
  expect(mainWidth - columnWidth).toBeLessThan(4);

  await test.info().attach("print-layout", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
  await page.emulateMedia({ media: "screen" });
});

test("Delete states the impact and requires the title to be typed", async ({
  page,
}) => {
  const title = await createScratchPage(page, `Scratch delete ${Date.now()}`);

  await page.getByLabel("Page actions").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("What this breaks")).toBeVisible();
  await expect(dialog.getByText("0 pages link here")).toBeVisible();
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
