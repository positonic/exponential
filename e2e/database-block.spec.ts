/**
 * The database block end to end (ADR-0078, royal.cocoa V2): on a fixture
 * page, `/database` inserts a block; a select property is added from the
 * header; a row is added and two cells typed; a reload shows the values; the
 * row opens as a page with its property header and a crumb back.
 *
 * The first spec to drive `RichDocEditor`; kept to the tracer path.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;

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
  const editorPopover = page.locator(".mantine-Popover-dropdown").last();
  await editorPopover.getByLabel("Name").first().fill("Status");
  await editorPopover.getByLabel("Type").first().click();
  await page.getByRole("option", { name: "Select" }).click();
  await editorPopover.getByLabel("New option").first().fill("Tracked");
  await editorPopover.getByRole("button", { name: "Add option" }).click();
  await editorPopover.getByRole("button", { name: "Add" }).click();
  await expect(block.getByRole("columnheader", { name: /Status/ })).toBeVisible();

  // Add a row and type its title.
  await block.getByRole("button", { name: "+ New" }).click();
  const titleInput = block.getByRole("textbox", { name: "Name" });
  await expect(titleInput).toBeVisible();
  await titleInput.fill("Alert latency");
  await titleInput.press("Enter");
  await expect(block.getByRole("link", { name: "Alert latency" })).toBeVisible();

  // Pick the select value.
  await block.getByRole("button", { name: "Status" }).first().click();
  await page.getByRole("option", { name: "Tracked" }).click();
  await expect(block.getByText("Tracked", { exact: true })).toBeVisible();

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
