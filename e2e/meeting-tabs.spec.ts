/**
 * The meeting page's tabs live in the URL (`?tab=<name>`, Summary when
 * absent) so each section is linkable. A tab click pushes a history entry,
 * so Back/Forward walk the tabs, and the selected panel follows the URL
 * rather than the last click. Runs against the seeded dev-fixture standup.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays compile + fetch; anchor once, generously. */
const FIRST_PAINT_TIMEOUT = 60_000;

function tab(page: Page, name: RegExp) {
  return page.getByRole("tab", { name });
}

test("tab clicks write the URL, and Back/Forward walk the tabs", async ({ page }) => {
  await page.goto(fixture.meetingUrl);
  await expect(page.getByRole("heading", { name: "Daily Standup" }).first()).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(tab(page, /^Summary/)).toHaveAttribute("aria-selected", "true");
  await expect(page).not.toHaveURL(/[?&]tab=/);

  await tab(page, /^Transcript/).click();
  await expect(tab(page, /^Transcript/)).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\?tab=transcript$/);

  await tab(page, /^Outputs/).click();
  await expect(tab(page, /^Outputs/)).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\?tab=outputs$/);

  // Back steps to the previous tab: the panel follows the URL, not the last click.
  await page.goBack();
  await expect(page).toHaveURL(/\?tab=transcript$/);
  await expect(tab(page, /^Transcript/)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".mp-turn").first()).toBeVisible();

  // Summary is the default tab, so its entry is the bare meeting URL.
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]tab=/);
  await expect(tab(page, /^Summary/)).toHaveAttribute("aria-selected", "true");

  await page.goForward();
  await expect(page).toHaveURL(/\?tab=transcript$/);
  await expect(tab(page, /^Transcript/)).toHaveAttribute("aria-selected", "true");
});

test("a shared tab link opens on that tab", async ({ page }) => {
  await page.goto(`${fixture.meetingUrl}?tab=outputs`);
  await expect(tab(page, /^Outputs/)).toHaveAttribute("aria-selected", "true", {
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(tab(page, /^Summary/)).toHaveAttribute("aria-selected", "false");
});

test("a link to the former Decisions tab opens Outputs", async ({ page }) => {
  await page.goto(`${fixture.meetingUrl}?tab=decisions`);
  await expect(tab(page, /^Outputs/)).toHaveAttribute("aria-selected", "true", {
    timeout: FIRST_PAINT_TIMEOUT,
  });
});
