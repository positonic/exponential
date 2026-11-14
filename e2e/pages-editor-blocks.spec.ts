/**
 * The `/` block menu and the bubble menu's marks (ticket inner.ant, "Pages
 * tour" V2).
 *
 * These live in the shared editor engine (RichDocEditor), so the Feature PRD
 * editor has every one of them too; a Page is the cheapest place to drive
 * them, and the last spec drives the Feature editor to prove it. What each
 * spec pins is the round-trip: a block typed into the editor has to survive
 * the autosave, the Markdown projection and a reload.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;
const SAVE_TIMEOUT = 30_000;

/** Where screenshots go: `SHOT_DIR` when set (for a reviewer), else the test's output dir. */
function shotPath(name: string): string {
  const dir = process.env.SHOT_DIR;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function trpcQuery<T>(page: Page, path: string, input: unknown): Promise<T> {
  const qs = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
  const response = await page.request.get(`/api/trpc/${path}?batch=1&input=${qs}`);
  expect(response.ok(), `${path} failed: ${response.status()}`).toBe(true);
  const [first] = (await response.json()) as [{ result: { data: { json: T } } }];
  return first.result.data.json;
}

async function trpcMutation<T>(page: Page, path: string, input: unknown): Promise<T> {
  const response = await page.request.post(`/api/trpc/${path}?batch=1`, {
    data: { "0": { json: input } },
  });
  expect(response.ok(), `${path} failed: ${response.status()}`).toBe(true);
  const [first] = (await response.json()) as [{ result: { data: { json: T } } }];
  return first.result.data.json;
}

/**
 * A throwaway page per spec, so specs that type into a body can run in
 * parallel and never disturb the seeded pages other specs assert on.
 */
async function openScratchPage(page: Page, title: string) {
  const workspace = await trpcQuery<{ id: string }>(page, "workspace.getBySlug", {
    slug: fixture.workspaceSlug,
  });
  const created = await trpcMutation<{ id: string }>(page, "page.create", {
    workspaceId: workspace.id,
    title: `${title} ${Date.now()}`,
  });
  await page.goto(`/w/${fixture.workspaceSlug}/pages/${created.id}`);
  const editor = page.locator(".prd-document .ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await editor.click();
  return { editor, pageId: created.id };
}

/** The page's stored Markdown projection, what every off-editor reader sees. */
async function storedBody(page: Page, pageId: string): Promise<string> {
  const stored = await trpcQuery<{ body: string | null }>(page, "page.get", { id: pageId });
  return stored.body ?? "";
}

/** The block menu: a tippy popup on <body>, not inside the editor. */
const menu = (page: Page) => page.locator("[data-tippy-root]").filter({ hasText: /./ }).last();
const menuItem = (page: Page, title: string) =>
  menu(page).getByRole("button", { name: new RegExp(`^${title}\\b`) });

/**
 * Type `/query` and wait until the filtered list has rendered. The suggestion
 * plugin pushes new items through a React render, and an Enter that lands
 * first runs whatever sat at index 0 of the previous list.
 */
async function typeSlash(page: Page, query: string, expectFirst: string) {
  await page.keyboard.type(`/${query}`);
  await expect(menu(page).getByRole("button").first()).toContainText(expectFirst);
  await expect(menuItem(page, "Bullet list")).toHaveCount(0);
}

/** Select the whole current line, which opens the formatting bubble menu. */
async function selectLine(page: Page) {
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
}

test("the block menu offers Text, Divider and Image", async ({ page }) => {
  await openScratchPage(page, "Blocks offered");
  await page.keyboard.type("/");
  for (const title of ["Text", "Divider", "Image"]) {
    await expect(menuItem(page, title)).toBeVisible();
  }
});

test("/text turns a heading back into a paragraph", async ({ page }) => {
  const { editor } = await openScratchPage(page, "Text block");
  await page.keyboard.type("# Shouting");
  await expect(editor.locator("h1")).toHaveText("Shouting");

  await page.keyboard.type(" ");
  await typeSlash(page, "text", "Text");
  await page.keyboard.press("Enter");

  await expect(editor.locator("h1")).toHaveCount(0);
  await expect(editor.locator("p").first()).toContainText("Shouting");
});

test("the block menu filters mid-title and says so when nothing matches", async ({ page }) => {
  await openScratchPage(page, "Filter");
  // Mid-title: a prefix filter found neither of these.
  await page.keyboard.type("/list");
  await expect(menuItem(page, "Bullet list")).toBeVisible();
  await expect(menuItem(page, "Numbered list")).toBeVisible();
  await expect(menuItem(page, "Task list")).toBeVisible();
  await expect(menuItem(page, "Heading 1")).toHaveCount(0);
  await page.screenshot({ path: shotPath("slash-filter-list.png") });

  // No match keeps the menu open and says so, rather than vanishing.
  await page.keyboard.type("zzz");
  await expect(menu(page).getByText("No matches")).toBeVisible();
  await page.screenshot({ path: shotPath("slash-no-matches.png") });

  // Enter under "No matches" runs nothing and breaks no line.
  await page.keyboard.press("Enter");
  await expect(menu(page).getByText("No matches")).toBeVisible();

  // Escape closes it; the typed text stays in the doc.
  await page.keyboard.press("Escape");
  await expect(page.getByText("No matches")).toBeHidden();
  await expect(page.locator(".prd-document .ProseMirror")).toContainText("/listzzz");
});

test("underline, strike and highlight from the bubble menu persist", async ({ page }) => {
  const { editor, pageId } = await openScratchPage(page, "Marks");
  await page.keyboard.type("Mark me");
  await selectLine(page);

  for (const label of ["Underline", "Strikethrough", "Highlight text"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await expect(editor.locator("u")).toHaveCount(1);
  await expect(editor.locator("s")).toHaveCount(1);
  await expect(editor.locator("mark")).toHaveCount(1);

  // The projection: strike is native, underline and highlight are tags.
  await expect.poll(() => storedBody(page, pageId), { timeout: SAVE_TIMEOUT }).toMatch(/~~/);
  const body = await storedBody(page, pageId);
  expect(body).toContain("<u>");
  expect(body).toContain("<mark>");
  expect(body).toContain("Mark me");

  await page.reload();
  const reloaded = page.locator(".prd-document .ProseMirror").first();
  await expect(reloaded.locator("u")).toHaveCount(1, { timeout: FIRST_PAINT_TIMEOUT });
  await expect(reloaded.locator("s")).toHaveCount(1);
  await expect(reloaded.locator("mark")).toHaveText("Mark me");
});

test("highlight stays readable in dark and light mode", async ({ page }) => {
  const { editor } = await openScratchPage(page, "Highlight theme");
  await page.keyboard.type("Plain words, then a highlighted phrase, then plain again.");
  await page.keyboard.press("Home");
  for (let i = 0; i < 13; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 26; i++) await page.keyboard.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Highlight text", exact: true }).click();
  const mark = editor.locator("mark");
  await expect(mark).toHaveText("then a highlighted phrase,");
  // Collapse the selection so the bubble menu does not cover the text.
  await page.keyboard.press("ArrowRight");

  for (const scheme of ["dark", "light"] as const) {
    await page.evaluate((s) => {
      document.documentElement.setAttribute("data-mantine-color-scheme", s);
    }, scheme);
    // The wash is derived from a token, never the UA yellow, and the text
    // keeps the theme's own colour.
    const { background, color, textColor } = await mark.evaluate((el) => {
      const style = getComputedStyle(el);
      const parent = getComputedStyle(el.parentElement ?? el);
      return { background: style.backgroundColor, color: style.color, textColor: parent.color };
    });
    expect(background).not.toBe("rgb(255, 255, 0)");
    expect(color).toBe(textColor);
    await editor.screenshot({ path: shotPath(`highlight-${scheme}.png`) });
  }
});

test("the block-type dropdown names the current block and changes it", async ({ page }) => {
  const { editor } = await openScratchPage(page, "Block type");
  await page.keyboard.type("Some prose");
  await selectLine(page);

  const trigger = page.getByRole("button", { name: "Block type" });
  const dropdown = page.getByRole("menu");
  const item = (label: string) => page.getByRole("menuitem", { name: label, exact: true });
  // Each step waits for the last dropdown to finish closing and for the
  // bubble menu to be back, so a click never lands on a fading menu.
  const open = async () => {
    await expect(dropdown).toHaveCount(0);
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(dropdown).toBeVisible();
  };
  const choose = async (label: string) => {
    await item(label).click();
    await expect(dropdown).toHaveCount(0);
  };

  await expect(trigger).toHaveText(/Text/);
  // The H1/H2/H3 icon buttons it replaced are gone.
  await expect(page.getByRole("button", { name: "Heading 1", exact: true })).toHaveCount(0);

  await open();
  await expect(item("Text")).toHaveAttribute("aria-current", "true");
  await page.waitForTimeout(600); // Mantine's menu fade, for the screenshot
  await page.screenshot({ path: shotPath("bubble-menu-block-type.png") });
  await choose("Heading 2");
  await expect(editor.locator("h2")).toHaveText("Some prose");

  // And back out of a heading, which the icon buttons could not do.
  await selectLine(page);
  await expect(trigger).toHaveText(/Heading 2/);
  await open();
  await expect(item("Heading 2")).toHaveAttribute("aria-current", "true");
  await choose("Quote");
  await expect(editor.locator("blockquote")).toContainText("Some prose");

  // A paragraph inside a quote makes both active; the dropdown names the
  // quote, and choosing Quote again leaves it as one quote.
  await selectLine(page);
  await expect(trigger).toHaveText(/Quote/);
  await open();
  await choose("Quote");
  await expect(editor.locator("blockquote")).toHaveCount(1);

  await selectLine(page);
  await open();
  await choose("Code block");
  await expect(editor.locator("pre")).toContainText("Some prose");

  await selectLine(page);
  await expect(trigger).toHaveText(/Code block/);
  await open();
  await choose("Text");
  await expect(editor.locator("pre")).toHaveCount(0);
  await expect(editor.locator("p").first()).toHaveText("Some prose");
});

/** The smallest valid PNG: 1x1, transparent. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("/image uploads the picked file and lands after the block being typed in", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { editor, pageId } = await openScratchPage(page, "Image");
  await typeSlash(page, "image", "Image");

  // The command builds a native <input type=file> and clicks it.
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  const picked = await chooser;

  // Carry on writing while the dialog is open, as a user would. `image` is a
  // block node, so an insert at the caret would split this paragraph.
  await page.keyboard.type("still writing");
  await picked.setFiles({ name: "tiny.png", mimeType: "image/png", buffer: TINY_PNG });

  // Through the real `page.uploadImage` mutation.
  await expect(editor.locator("img")).toHaveCount(1, { timeout: 60_000 });
  await expect(editor.locator("p").first()).toHaveText("still writing");
  await expect(editor).not.toContainText("/image");
  const src = await editor.locator("img").getAttribute("src");
  expect(src).toMatch(/^https:\/\//);

  await expect
    .poll(() => storedBody(page, pageId), { timeout: SAVE_TIMEOUT })
    .toContain(`![](${src})`);
});

test("/divider inserts a rule that survives a reload as ---", async ({ page }) => {
  const { editor, pageId } = await openScratchPage(page, "Divider");
  await page.keyboard.type("Above");
  await page.keyboard.press("Enter");
  await typeSlash(page, "div", "Divider");
  await page.keyboard.press("Enter");
  await expect(editor.locator("hr")).toHaveCount(1);
  await page.keyboard.type("Below");

  await expect
    .poll(() => storedBody(page, pageId), { timeout: SAVE_TIMEOUT })
    .toMatch(/Above\n\n-{3,}\n\nBelow/);

  await page.reload();
  await expect(page.locator(".prd-document .ProseMirror hr")).toHaveCount(1, {
    timeout: FIRST_PAINT_TIMEOUT,
  });
});

test("the Feature PRD editor gets the same blocks and marks, and still saves", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // A scratch feature on the fixture product, so the seeded feature's
  // description stays as the other specs expect it.
  const seeded = await trpcQuery<{ productId: string }>(page, "product.feature.getById", {
    id: fixture.featureId,
  });
  const feature = await trpcMutation<{ id: string }>(page, "product.feature.create", {
    productId: seeded.productId,
    name: `PRD editor blocks ${Date.now()}`,
  });
  await page.goto(
    `/w/${fixture.workspaceSlug}/products/${fixture.productSlug}/features/${feature.id}`,
  );
  const editor = page.locator(".prd-document .ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await editor.click();

  await page.keyboard.type("Shipped");
  await expect(editor).toContainText("Shipped");
  await page.keyboard.press("Enter");
  await typeSlash(page, "div", "Divider");
  await page.keyboard.press("Enter");
  await expect(editor.locator("hr")).toHaveCount(1);

  // Then underline the first line from the bubble menu.
  await editor.locator("p").first().click({ clickCount: 3 });
  await expect(page.getByRole("button", { name: "Block type" })).toHaveText(/Text/);
  await page.getByRole("button", { name: "Underline", exact: true }).click();
  await expect(editor.locator("u")).toHaveText("Shipped");

  const description = () =>
    trpcQuery<{ description: string | null }>(page, "product.feature.getById", {
      id: feature.id,
    }).then((f) => f.description ?? "");
  await expect.poll(description, { timeout: SAVE_TIMEOUT }).toMatch(/<u>Shipped<\/u>\n\n-{3,}/);

  await page.reload();
  const reloaded = page.locator(".prd-document .ProseMirror").first();
  await expect(reloaded.locator("u")).toHaveText("Shipped", { timeout: FIRST_PAINT_TIMEOUT });
  await expect(reloaded.locator("hr")).toHaveCount(1);
});
