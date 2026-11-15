/**
 * ArrowRight collapses a text selection before the next key acts on it
 * (ticket gentle.elk).
 *
 * ProseMirror lets the browser move the caret and only reads the result on the
 * asynchronous `selectionchange` event, so an Enter pressed before that event
 * used to act on the old selection and replace the selected words. The
 * Feature PRD editor showed it most; Pages share the engine and the fix
 * (DomSelectionSync), so both are pinned here. Keys are pressed back to back,
 * with no wait between ArrowRight and Enter: that gap is the window the bug
 * lived in.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;

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

/** A scratch feature on the fixture product, so the seeded one is untouched. */
async function openScratchFeature(page: Page): Promise<Locator> {
  const seeded = await trpcQuery<{ productId: string }>(page, "product.feature.getById", {
    id: fixture.featureId,
  });
  const feature = await trpcMutation<{ id: string }>(page, "product.feature.create", {
    productId: seeded.productId,
    name: `Arrow collapse ${Date.now()}`,
  });
  await page.goto(
    `/w/${fixture.workspaceSlug}/products/${fixture.productSlug}/features/${feature.id}`,
  );
  return focusEditor(page);
}

async function openScratchPage(page: Page): Promise<Locator> {
  const workspace = await trpcQuery<{ id: string }>(page, "workspace.getBySlug", {
    slug: fixture.workspaceSlug,
  });
  const created = await trpcMutation<{ id: string }>(page, "page.create", {
    workspaceId: workspace.id,
    title: `Arrow collapse ${Date.now()}`,
  });
  await page.goto(`/w/${fixture.workspaceSlug}/pages/${created.id}`);
  return focusEditor(page);
}

async function focusEditor(page: Page): Promise<Locator> {
  const editor = page.locator(".prd-document .ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await editor.click();
  return editor;
}

/**
 * Select the line and underline it from the bubble menu (the flow the bug was
 * found in), then ArrowRight + Enter back to back.
 */
async function selectLineThenArrowEnter(page: Page, editor: Locator, text: string) {
  await page.keyboard.type(text);
  // A triple-click rather than Shift+Home: it also refocuses the editor if a
  // cold first load re-rendered it under the typing.
  const line = editor.locator("p").first();
  await expect(line).toHaveText(text);
  await line.click({ clickCount: 3 });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(text);
  await page.getByRole("button", { name: "Underline", exact: true }).click();
  await expect(editor.locator("u")).toHaveText(text);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.type("next line");

  await expect(editor.locator("p").first()).toHaveText(text);
  await expect(editor.locator("p").nth(1)).toHaveText("next line");
  // The underline is still on the original words (Enter carries the mark on
  // to the new line too, which is Tiptap's keepMarks default).
  await expect(editor.locator("u").first()).toHaveText(text);
}

test.describe("ArrowRight collapses a selection before Enter", () => {
  test.setTimeout(180_000);

  test("Feature page: a selected line survives ArrowRight then Enter", async ({ page }) => {
    const editor = await openScratchFeature(page);
    await selectLineThenArrowEnter(page, editor, "Shipped the PRD body");
    await editor.screenshot({ path: shotPath("feature-arrow-collapse.png") });
  });

  test("Feature page: a double-clicked word survives ArrowRight then Enter", async ({ page }) => {
    const editor = await openScratchFeature(page);
    await page.keyboard.type("alpha beta gamma");
    await editor.getByText("alpha beta gamma").dblclick({ position: { x: 5, y: 5 } });
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("alpha");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");

    await expect(editor.locator("p").first()).toHaveText("alpha");
    await expect(editor.locator("p").nth(1)).toHaveText(/^\s?beta gamma$/);
  });

  test("Page: a selected line survives ArrowRight then Enter", async ({ page }) => {
    const editor = await openScratchPage(page);
    await selectLineThenArrowEnter(page, editor, "Pages share the engine");
    await editor.screenshot({ path: shotPath("page-arrow-collapse.png") });
  });
});
