/**
 * The database block end to end (ADR-0078, royal.cocoa V2): on a fixture
 * page, `/database` inserts a block; a select property is added from the
 * header; a row is added and two cells typed; a reload shows the values; the
 * row opens as a page with its property header and a crumb back.
 *
 * The first spec to drive `RichDocEditor`; kept to the tracer path.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;

/**
 * Wait for the block's pending cell write to land. The block sets `aria-busy`
 * while `database.updateRow` is in flight; a reload during that window
 * aborts the request, so the spec waits for it to clear before reloading.
 * (Network events are no use here: the tRPC link streams the response.)
 */
async function rowWriteSettled(block: Locator) {
  // A quick write may already have landed before the first poll; that is fine.
  await expect(block).toHaveAttribute("aria-busy", "true", { timeout: 2_000 }).catch(() => undefined);
  await expect(block).toHaveAttribute("aria-busy", "false");
}

async function openEditor(page: Page) {
  await page.goto(fixture.databasePageUrl);
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  return editor;
}

test("/database inserts a block; cells persist; the row is a page", async ({ page }) => {
  test.setTimeout(180_000);
  const editor = await openEditor(page);

  // Insert the block from the slash menu at the end of the body.
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/database");
  await page.getByRole("button", { name: /A typed table/ }).click();

  const block = page.locator('[data-type="database"]');
  await expect(block).toBeVisible();
  await expect(block).toContainText("New database");

  // Add a select property from the header.
  await block.getByRole("button", { name: "Add a property" }).click();
  const editorPopover = page.getByRole("dialog", { name: "Add a property" });
  await expect(editorPopover).toBeVisible();
  await editorPopover.getByLabel("Name").first().fill("Status");
  await editorPopover.getByLabel("Type").first().click();
  await page.getByRole("option", { name: "Select", exact: true }).click();
  await editorPopover.getByLabel("New option").first().fill("Tracked");
  await editorPopover.getByRole("button", { name: "Add option" }).click();
  await editorPopover.getByRole("button", { name: "Add", exact: true }).click();
  await expect(block.getByRole("columnheader", { name: /Status/ })).toBeVisible();

  // Add a row and type its title.
  await block.getByRole("button", { name: "+ New" }).click();
  const titleInput = block.getByRole("textbox", { name: "Name" });
  await expect(titleInput).toBeVisible();
  await titleInput.fill("Alert latency");
  await titleInput.press("Enter");
  await expect(block.getByRole("link", { name: "Alert latency" })).toBeVisible();
  await rowWriteSettled(block);

  // Pick the select value. The cell shows it at once (optimistically).
  await block.getByRole("button", { name: "Status", exact: true }).first().click();
  await page.getByRole("option", { name: "Tracked", exact: true }).click();
  await expect(block.getByText("Tracked", { exact: true })).toBeVisible();
  await rowWriteSettled(block);

  // The values are on the server: a fresh load shows them.
  await page.reload();
  const reloaded = page.locator('[data-type="database"]');
  await expect(reloaded).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(reloaded.getByRole("link", { name: "Alert latency" })).toBeVisible();
  await expect(reloaded.getByText("Tracked", { exact: true })).toBeVisible();

  // The row is a page: its properties above the body, a crumb to the holder.
  await reloaded.getByRole("link", { name: "Alert latency" }).click();
  await expect(page).toHaveURL(/\/pages\/[a-z0-9]+$/);
  const header = page.getByTestId("row-properties");
  await expect(header).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(header).toContainText("Status");
  await expect(header).toContainText("Tracked");
  await expect(page.getByTestId("page-database-crumb")).toBeVisible();
});
