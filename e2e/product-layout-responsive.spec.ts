/**
 * Regression guard for the product pages' responsive layout. Before this
 * spec's fix the ticket detail page was a fixed two-column flex row with an
 * 18rem properties sidebar that never shrank, so on a phone the main column
 * measured ~24px and text rendered one letter per line, while the product
 * tab bar wrapped into four rows.
 *
 * Assertions are geometric (widths, stacking order, overflow) rather than
 * pixel diffs; a screenshot is attached to each test for human review - see
 * dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;

async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

/** Resolve a seeded ticket's detail URL via the feature accordion's row link. */
async function openSeededTicket(page: Page) {
  await page.goto(fixture.featureUrl);
  const row = page.locator(`a[href*="/products/${fixture.productSlug}/tickets/"]`, {
    hasText: "Render ticket rows in the accordion",
  });
  await expect(row).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  const href = await row.getAttribute("href");
  if (!href) throw new Error("seeded ticket row has no href");
  await page.goto(href);
  const title = page.locator("textarea").first();
  await expect(title).toHaveValue("Render ticket rows in the accordion", { timeout: FIRST_PAINT_TIMEOUT });
  return { title, properties: page.getByText("Properties", { exact: true }).first() };
}

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("ticket detail stacks body, properties, then activity with no sideways scroll", async ({ page }) => {
    const { title, properties } = await openSeededTicket(page);

    expect(await hasHorizontalOverflow(page), "page must not scroll sideways").toBe(false);

    const titleBox = await title.boundingBox();
    expect(titleBox, "title textarea should be laid out").not.toBeNull();
    expect(titleBox!.width, "main column should get the full width, not a sliver").toBeGreaterThan(250);

    await expect(properties).toBeVisible();
    const propsBox = (await properties.boundingBox())!;
    expect(propsBox.y, "properties should sit below the body, not beside it").toBeGreaterThan(titleBox!.y + titleBox!.height);

    const activity = page.getByText("Activity", { exact: true }).first();
    await expect(activity).toBeVisible();
    const activityBox = (await activity.boundingBox())!;
    expect(activityBox.y, "activity feed should come after the properties").toBeGreaterThan(propsBox.y);

    await attachScreenshot(page, "ticket-detail-phone");
  });

  test("product tab strip is a single scrollable row with the active tab in view", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/products/${fixture.productSlug}/retrospectives`);
    const retroTab = page.getByRole("tab", { name: "Retro" });
    await expect(retroTab).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    const listBox = (await page.getByRole("tablist").boundingBox())!;
    expect(listBox.height, "eight tabs should not wrap into several rows").toBeLessThan(60);

    // The active tab is the last one; the strip must have scrolled it into view.
    const tabBox = (await retroTab.boundingBox())!;
    expect(tabBox.x).toBeGreaterThanOrEqual(0);
    expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(375);
    expect(await hasHorizontalOverflow(page), "the strip scrolls, the page must not").toBe(false);

    await attachScreenshot(page, "product-tabs-phone");
  });
});

test.describe("laptop with the app sidebar open", () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test("product tabs wrap rather than clip when they don't fit on one row", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/products/${fixture.productSlug}/tickets`);
    const retroTab = page.getByRole("tab", { name: "Retro" });
    await expect(retroTab).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    const tabBox = (await retroTab.boundingBox())!;
    expect(tabBox.x + tabBox.width, "last tab must be fully inside the viewport").toBeLessThanOrEqual(1100);
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("ticket detail keeps the properties sidebar beside the body", async ({ page }) => {
    const { title, properties } = await openSeededTicket(page);
    const titleBox = (await title.boundingBox())!;
    await expect(properties).toBeVisible();
    const propsBox = (await properties.boundingBox())!;

    expect(propsBox.x, "sidebar should be to the right of the body").toBeGreaterThan(titleBox.x + titleBox.width);
    expect(Math.abs(propsBox.y - titleBox.y), "sidebar should start level with the body").toBeLessThan(80);
    expect(await hasHorizontalOverflow(page)).toBe(false);

    await attachScreenshot(page, "ticket-detail-desktop");
  });
});
