/**
 * The Page actions menu (the `•••` on a page) and its Delete confirmation.
 *
 * Delete is a hard delete with no archive behind it, so the dialog has two
 * jobs: say what breaks, and refuse the reflex click. Assertions are on visible
 * text and ARIA labels, never CSS classes.
 *
 * The pages under test are made here, straight in the database, and removed
 * afterwards, so a destructive spec never touches the seeded fixture pages
 * other specs assert on. `PageLink` rows are written by hand because that is
 * what the app's body writes derive; a prose mention gets no row, exactly as
 * `syncPageLinks` would leave it.
 *
 * Set SHOT_DIR to keep the screenshots somewhere other than the test output.
 */
import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { FIXTURE } from "../scripts/dev-fixture/seed";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;
const RUN = Date.now().toString(36);

let db: PrismaClient;
let workspaceId: string;
const created: string[] = [];

/** A ProseMirror doc of one paragraph per line, plus optional sub-page links. */
function doc(lines: string[], links: { id: string; title: string }[] = []) {
  return {
    type: "doc",
    content: [
      ...lines.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
      ...links.map((l) => ({
        type: "pageLink",
        attrs: { pageId: l.id, title: l.title, href: `/w/${fixture.workspaceSlug}/pages/${l.id}` },
      })),
    ],
  };
}

async function makePage(data: {
  title: string;
  lines?: string[];
  links?: { id: string; title: string }[];
  createdById?: string;
  isInviteOnly?: boolean;
  isPublic?: boolean;
}) {
  const lines = data.lines ?? [`Body of ${data.title}.`];
  const row = await db.knowledgePage.create({
    data: {
      title: data.title,
      workspaceId,
      createdById: data.createdById ?? fixture.userId,
      isInviteOnly: data.isInviteOnly ?? false,
      bodyDoc: doc(lines, data.links),
      body: lines.join("\n\n"),
      ...(data.isPublic
        ? { isPublic: true, publicId: `e2e${RUN}${Math.random().toString(36).slice(2, 10)}`, publicSlug: "e2e-page", publishedAt: new Date() }
        : {}),
    },
    select: { id: true, title: true },
  });
  created.push(row.id);
  if (data.links?.length) {
    await db.pageLink.createMany({
      data: data.links.map((l, position) => ({ fromPageId: row.id, toPageId: l.id, position, workspaceId })),
    });
  }
  return { ...row, url: `/w/${fixture.workspaceSlug}/pages/${row.id}` };
}

async function shot(page: Page, name: string, options: Parameters<Page["screenshot"]>[0] = {}) {
  const dir = process.env.SHOT_DIR ?? test.info().outputPath();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ ...options, path: file });
  await test.info().attach(name, { path: file, contentType: "image/png" });
}

async function openPage(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByLabel("Page actions")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  // The editor mounts after the header; Copy markdown / Export read it.
  await expect(page.locator(".ProseMirror").first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
}

async function openMenu(page: Page) {
  await page.getByLabel("Page actions").click();
  await expect(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
}

const menuLabels = async (page: Page) =>
  (await page.getByRole("menuitem").allInnerTexts()).map((l) => l.trim());

test.beforeAll(async () => {
  loadDevEnvOrThrow();
  const { PrismaClient: Client } = await import("@prisma/client");
  db = new Client();
  workspaceId = (
    await db.workspace.findUniqueOrThrow({ where: { slug: fixture.workspaceSlug }, select: { id: true } })
  ).id;
});

test.afterAll(async () => {
  if (created.length) await db.knowledgePage.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

// `pages:full-width` is per browser: a failure mid-test must not leak a
// widened column into every later test in this worker.
test.afterEach(async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem("pages:full-width")).catch(() => undefined);
});

test("an editor gets every action, in the documented order", async ({ page }) => {
  const child = await makePage({ title: `Child ${RUN}` });
  const parent = await makePage({ title: `Parent ${RUN}`, links: [child] });
  await openPage(page, parent.url);
  await openMenu(page);
  // The sub-page check is its own query; wait for it rather than race it.
  await expect(page.getByRole("menuitem", { name: "Duplicate with sub-pages" })).toBeVisible();

  expect(await menuLabels(page)).toEqual([
    "Full width",
    "Copy link",
    "Open in new tab",
    "Copy markdown",
    "Markdown",
    "Print / Save as PDF",
    "History",
    "Move to project…",
    "Include in search",
    "Duplicate",
    "Duplicate with sub-pages",
    "Delete",
  ]);
  // Let the dropdown finish its fade before the screenshot.
  await page.waitForTimeout(600);
  await shot(page, "menu-editor");
});

test("a viewer gets the read-only items and nothing else", async ({ page }) => {
  // Someone else's restricted page, shared with the fixture user as a viewer.
  const viewed = await makePage({
    title: `Shared read-only ${RUN}`,
    createdById: fixture.colleagueUserId,
    isInviteOnly: true,
  });
  await db.knowledgePageMember.create({
    data: { pageId: viewed.id, userId: fixture.userId, role: "viewer", invitedById: fixture.colleagueUserId },
  });
  await openPage(page, viewed.url);
  await openMenu(page);

  expect(await menuLabels(page)).toEqual([
    "Full width",
    "Copy link",
    "Open in new tab",
    "Copy markdown",
    "Markdown",
    "Print / Save as PDF",
    "History",
  ]);
  await page.waitForTimeout(600);
  await shot(page, "menu-viewer");
});

test("Full width widens the reading column and persists", async ({ page }) => {
  const target = await makePage({ title: `Width ${RUN}` });
  await openPage(page, target.url);
  const column = page.locator('[data-print="column"]');
  const narrow = (await column.boundingBox())!.width;

  await openMenu(page);
  await page.getByRole("menuitem", { name: "Full width" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await column.boundingBox())!.width).toBeGreaterThan(narrow);

  await page.reload();
  await expect(page.getByLabel("Page actions")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  expect((await column.boundingBox())!.width).toBeGreaterThan(narrow);
});

test("Copy link copies the internal editor URL; Open in new tab points at it too", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const target = await makePage({ title: `Link ${RUN}`, isPublic: true });
  await openPage(page, target.url);

  await openMenu(page);
  await expect(page.getByRole("menuitem", { name: "Open in new tab" })).toHaveAttribute(
    "href",
    target.url,
  );
  await page.getByRole("menuitem", { name: "Copy link" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // Published or not, Copy link never points at the public /p/... render.
  expect(copied).toBe(new URL(target.url, page.url()).toString());
});

test("Copy markdown serialises the live editor, unsaved edits included", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const target = await makePage({ title: `Markdown ${RUN}` });
  await openPage(page, target.url);

  // Type and copy at once — well inside the autosave debounce, so this is the
  // live doc, not the stored one.
  const marker = `Unsaved line ${RUN}`;
  await page.locator(".ProseMirror p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(marker);

  await openMenu(page);
  await page.getByRole("menuitem", { name: "Copy markdown" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.startsWith(`# ${target.title}\n`)).toBe(true);
  expect(copied).toContain(marker);
});

test("Export ▸ Markdown downloads a .md file named after the page", async ({ page }) => {
  const target = await makePage({ title: `Export ${RUN}` });
  await openPage(page, target.url);

  await openMenu(page);
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Markdown", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${target.title}.md`);
  const text = fs.readFileSync(await file.path(), "utf8");
  expect(text).toContain(`# ${target.title}`);
  expect(text).toContain(`Body of ${target.title}.`);
});

test("Print hides the app chrome and lets the column run full width", async ({ page }) => {
  const target = await makePage({
    title: `Print ${RUN}`,
    // Long enough to need more than one sheet, so a clipped scroll container
    // would show up as a one-page PDF.
    lines: Array.from({ length: 90 }, (_, i) => `Paragraph ${i + 1} of the printed page.`),
  });
  await openPage(page, target.url);
  const column = page.locator('[data-print="column"]');
  const onScreen = (await column.boundingBox())!.width;

  // The menu item calls window.print(); Playwright can't drive the native
  // dialog, so assert on what it renders: the print stylesheet.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("page-topbar")).toBeHidden();
  await expect(page.getByLabel("Page actions")).toBeHidden();
  await expect(page.locator(".app-sidebar")).toBeHidden();
  await expect(page.getByText("Activity", { exact: true })).toBeHidden();
  await expect(page.getByText("Paragraph 1 of the printed page.", { exact: true })).toBeVisible();
  // On screen the column is capped at max-w-3xl (768px); on paper the cap
  // goes. Compared against itself, so a scrollbar can't move the goalposts.
  expect(onScreen).toBeLessThanOrEqual(768);
  expect((await column.boundingBox())!.width).toBeGreaterThan(onScreen);
  // …and the sidebar's gutter is gone, not just the sidebar.
  expect((await column.boundingBox())!.x).toBeLessThan(50);
  await shot(page, "print-preview");

  // The real thing: Chromium's print-to-PDF renders the same stylesheet.
  const pdfDir = process.env.SHOT_DIR ?? test.info().outputPath();
  const pdf = await page.pdf({ path: path.join(pdfDir, "print-preview.pdf"), format: "A4" });
  const sheets = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  expect(sheets).toBeGreaterThan(1);
  test.info().annotations.push({ type: "pdf-pages", description: String(sheets) });
  await page.emulateMedia({ media: "screen" });
});

test("Move to project lists editable projects and re-places the page", async ({ page }) => {
  const target = await makePage({ title: `Move ${RUN}` });
  await openPage(page, target.url);

  await openMenu(page);
  await page.getByRole("menuitem", { name: "Move to project…" }).click();
  const dialog = page.getByRole("dialog", { name: "Move to project" });
  await dialog.getByLabel("Project").click();
  await expect(page.getByRole("option", { name: "No project" })).toBeVisible();
  await page.getByRole("option", { name: FIXTURE.projectName }).click();
  await dialog.getByRole("button", { name: "Move" }).click();
  await expect(dialog).toBeHidden();

  // The picker under the title reads the same page.
  await expect(page.getByTestId("page-project-picker")).toContainText(FIXTURE.projectName);
  const stored = await db.knowledgePage.findUniqueOrThrow({
    where: { id: target.id },
    select: { project: { select: { name: true } } },
  });
  expect(stored.project?.name).toBe(FIXTURE.projectName);
});

test("Include in search toggles and survives a reload", async ({ page }) => {
  const target = await makePage({ title: `Search ${RUN}` });
  await openPage(page, target.url);

  await openMenu(page);
  const row = page.getByRole("menuitem", { name: "Include in search" });
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/trpc/") && r.url().includes("page.update")),
    row.click(),
  ]);
  await expect(row).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await openPage(page, target.url);
  await openMenu(page);
  await expect(page.getByRole("menuitem", { name: "Include in search" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("Delete states what breaks and requires the exact title", async ({ page }) => {
  const child = await makePage({ title: `Orphan-to-be ${RUN}` });
  const target = await makePage({ title: `Delete me ${RUN}`, links: [child], isPublic: true });
  // One real linker, and one page that only mentions the id in prose (no
  // PageLink row, as the indexer leaves it): only the first counts.
  await makePage({ title: `Linker ${RUN}`, links: [target] });
  await makePage({ title: `Mentioner ${RUN}`, lines: [`See ${target.id} for details.`] });

  await openPage(page, target.url);
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Delete" }).click();

  const dialog = page.getByRole("dialog", { name: "Delete page" });
  await expect(dialog.getByText("What this breaks")).toBeVisible();
  await expect(dialog.getByText("1 page links here")).toBeVisible();
  await expect(dialog.getByText("1 sub-page becomes top-level")).toBeVisible();
  await expect(dialog.getByText("Its public URL stops resolving")).toBeVisible();
  await expect(dialog.getByText("Counted across the pages you can see.")).toBeVisible();

  // The reflex click is refused until the exact title is typed.
  const confirm = dialog.getByRole("button", { name: "Delete page" });
  const input = dialog.getByLabel("Type the page title to confirm");
  await expect(confirm).toBeDisabled();
  await input.fill(target.title.toLowerCase());
  await expect(confirm).toBeDisabled();
  await input.fill(target.title);
  await expect(confirm).toBeEnabled();
  await shot(page, "delete-dialog");

  await confirm.click();
  await expect(page).toHaveURL(new RegExp(`/w/${fixture.workspaceSlug}/pages$`), {
    timeout: FIRST_PAINT_TIMEOUT,
  });
  expect(await db.knowledgePage.findUnique({ where: { id: target.id } })).toBeNull();
  // The sub-page survives, now top-level.
  expect(await db.pageLink.count({ where: { toPageId: child.id } })).toBe(0);
});

test("a rename reaches the delete gate without a reload", async ({ page }) => {
  const target = await makePage({ title: `Before rename ${RUN}` });
  await openPage(page, target.url);

  const renamed = `After rename ${RUN}`;
  const title = page.getByLabel("Page title");
  await title.fill(renamed);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/trpc/") && r.url().includes("page.update")),
    title.blur(),
  ]);
  // The breadcrumb reads the patched cache entry.
  await expect(page.getByTestId("page-topbar").getByText(renamed)).toBeVisible();

  await openMenu(page);
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete page" });
  await dialog.getByLabel("Type the page title to confirm").fill(renamed);
  await expect(dialog.getByRole("button", { name: "Delete page" })).toBeEnabled();
});
