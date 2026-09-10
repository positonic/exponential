/**
 * Ceremonies V1 (ADR-0059) on the seeded dev fixture:
 *
 * - the recording page's Linked rail shows "Part of: Daily Standup" for the
 *   meeting attached to the seeded occurrence, and the picker can unlink and
 *   relink it;
 * - the Meetings list has a ceremony filter beside the tab strip that narrows
 *   the list to meetings attached to the chosen ceremony.
 *
 * Runs authenticated via the storageState minted in global-setup. See
 * dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

test.describe.configure({ mode: "serial" });

test("recording page shows the ceremony occurrence it captured, and can unlink and relink it", async ({ page }) => {
  await page.goto(fixture.meetingUrl);
  const partOf = page.getByTestId("meeting-part-of");
  await expect(partOf).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(partOf).toContainText("Part of: Daily Standup");
  // Locale-agnostic: Chromium renders "Sep 8, 09:00 AM", a British locale "8 Sept, 09:00".
  await expect(partOf).toContainText(/Sep/);
  await expect(partOf).toContainText(/\b8\b/);

  // Unlink through the picker …
  await partOf.click();
  await page.getByText("Not part of a ceremony").click();
  await expect(partOf).toContainText("Part of a ceremony?", { timeout: FIRST_PAINT_TIMEOUT });

  // … and relink to the same occurrence so the fixture is left as seeded.
  await partOf.click();
  await page.getByRole("option", { name: /Sep/ }).first().click();
  await expect(partOf).toContainText("Part of: Daily Standup", { timeout: FIRST_PAINT_TIMEOUT });
});

test("meetings list filters by ceremony", async ({ page }) => {
  await page.goto(`/w/${fixture.workspaceSlug}/meetings`);
  const filter = page.getByTestId("ceremony-filter");
  await expect(filter).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  const seededMeeting = page.locator(`a[href="${fixture.meetingUrl}"]`).first();
  await expect(seededMeeting).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  await filter.click();
  await page.getByRole("option", { name: "Daily Standup" }).click();
  await expect(filter).toHaveValue("Daily Standup");
  // The attached meeting survives the filter; the list is non-empty.
  await expect(seededMeeting).toBeVisible();
  const links = page.locator('a[href^="/recording/"]');
  await expect(links.first()).toBeVisible();
  const hrefs = await links.evaluateAll((els) => Array.from(new Set(els.map((e) => e.getAttribute("href")))));
  expect(hrefs).toEqual([fixture.meetingUrl]);
});
