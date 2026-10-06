/**
 * Visual verification of the meeting Screenshots tab's two views: the default
 * "With transcript" narrative (each capture beside what was said before it,
 * paired through the transcript's `[SCREENSHOT]` markers) and the
 * "Screenshots only" grid. Runs against the seeded dev-fixture standup, which
 * carries two markers and two Screenshot rows.
 *
 * Assertions are functional; screenshots are attached for human review (see
 * dev-docs/AGENT_VISUAL_TESTING.md).
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

async function openScreenshotsTab(page: Page) {
  await page.goto(`${fixture.meetingUrl}?tab=screenshots`);
  await expect(page.getByTestId("screenshots-drop-target")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
}

test("defaults to the narrative: each capture beside what was said before it", async ({ page }) => {
  await openScreenshotsTab(page);

  const rows = page.getByTestId("screenshots-narrative-row");
  await expect(rows).toHaveCount(2, { timeout: FIRST_PAINT_TIMEOUT });

  // Row 1 = first marker: Pat's blocker line, attributed to the speaker.
  const first = rows.nth(0);
  await expect(first.getByText("Said before this capture")).toBeVisible();
  await expect(first.getByText("Pat Reviewer", { exact: true })).toBeVisible();
  await expect(first.getByText("The accordion PR is waiting on a review")).toBeVisible();
  await expect(first.getByText("00:42")).toBeVisible();
  await expect(first.getByRole("img", { name: /Screen capture 1/ })).toBeVisible();

  // Row 2 = second marker: only the text since the first marker, not before it.
  const second = rows.nth(1);
  await expect(second.getByText("peek drawer should ship before the hover affordances")).toBeVisible();
  await expect(second.getByText("The accordion PR is waiting on a review")).toHaveCount(0);
  await expect(second.getByText("01:58")).toBeVisible();

  // Markers never leak into the rendered passage.
  await expect(page.getByTestId("screenshots-narrative")).not.toContainText("[SCREENSHOT]");
  await expect(page.getByTestId("screenshots-grid")).toHaveCount(0);

  await attachScreenshot(page, "screenshots-with-transcript");
});

test("'Screenshots only' hides the transcript and shows the image grid", async ({ page }) => {
  await openScreenshotsTab(page);
  await expect(page.getByTestId("screenshots-narrative-row")).toHaveCount(2, {
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await page.getByTestId("screenshots-view-toggle").getByText("Screenshots only").click();

  await expect(page.getByTestId("screenshots-grid")).toBeVisible();
  await expect(page.getByTestId("screenshots-narrative")).toHaveCount(0);
  await expect(page.getByText("The accordion PR is waiting on a review")).toHaveCount(0);
  await expect(page.getByTestId("screenshots-grid").getByRole("img")).toHaveCount(2);
  await attachScreenshot(page, "screenshots-only");

  // The choice survives a reload.
  await page.reload();
  await expect(page.getByTestId("screenshots-grid")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.getByTestId("screenshots-narrative")).toHaveCount(0);

  await page.getByTestId("screenshots-view-toggle").getByText("With transcript").click();
  await expect(page.getByTestId("screenshots-narrative-row")).toHaveCount(2);
});

test("narrative stacks image above text on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 1100 });
  await openScreenshotsTab(page);
  const rows = page.getByTestId("screenshots-narrative-row");
  await expect(rows).toHaveCount(2, { timeout: FIRST_PAINT_TIMEOUT });

  const img = rows.nth(0).getByRole("img").first();
  const text = rows.nth(0).getByText("Said before this capture");
  const imgBox = await img.boundingBox();
  const textBox = await text.boundingBox();
  expect(imgBox && textBox && textBox.y > imgBox.y + imgBox.height - 1).toBe(true);

  await attachScreenshot(page, "screenshots-with-transcript-narrow");
});
