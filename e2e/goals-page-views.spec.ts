/**
 * The Goals page is one period-scoped list of objectives with several
 * renderings. These specs pin the page's contract from the outside — URL
 * grammar, which rows are listed, header text — never component internals.
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";
import { FIXTURE } from "../scripts/dev-fixture/seed";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;

const goalsPath = `/w/${fixture.workspaceSlug}/goals`;
const [okrPeriod, okrYear] = FIXTURE.okrPeriod.split("-") as [string, string];

function params(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

/** Click one segment of a Mantine SegmentedControl by its label text. */
async function pickSegment(page: Page, label: string) {
  await page.locator("label.mantine-SegmentedControl-label", { hasText: new RegExp(`^${label}$`) }).click();
}

test("the Table and OKRs views list the same objectives for the same period", async ({ page }) => {
  await page.goto(`${goalsPath}?view=okrs&period=${okrPeriod}&year=${okrYear}`);

  // OKRs view: the seeded objective renders as a card with its key result.
  await expect(page.getByText(FIXTURE.objectiveTitle).first()).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(page.getByText(FIXTURE.keyResultTitle).first()).toBeVisible();

  // Switching view keeps the period and year; `view` drops to its default.
  await pickSegment(page, "Table");
  await expect.poll(() => params(page).get("view")).toBeNull();
  expect(params(page).get("period")).toBe(okrPeriod);

  // Table view: the same objective, as a row; the period-less goals from the
  // goal hierarchy fixture are not in this period.
  const objectiveRow = page.locator("tr", { hasText: FIXTURE.objectiveTitle }).first();
  await expect(objectiveRow).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.locator("tr", { hasText: FIXTURE.parentGoalTitle })).toHaveCount(0);

  await test.info().attach("goals-table-view", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("All is the only period that lists a period-less objective", async ({ page }) => {
  await page.goto(`${goalsPath}?period=all`);

  const periodless = page.locator("tr", { hasText: FIXTURE.parentGoalTitle }).first();
  await expect(periodless).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  // The period-bound objective is there too: All drops the clause entirely.
  await expect(page.locator("tr", { hasText: FIXTURE.objectiveTitle }).first()).toBeVisible();

  await pickSegment(page, okrPeriod);
  await expect.poll(() => params(page).get("period")).toBe(okrPeriod);
  await expect(page.locator("tr", { hasText: FIXTURE.parentGoalTitle })).toHaveCount(0);
});

test("switching view keeps a non-default period, year and Mine in the URL", async ({ page }) => {
  await page.goto(`${goalsPath}?period=${okrPeriod}&year=2027&mine=1`);
  await expect(page.locator("label.mantine-SegmentedControl-label", { hasText: /^OKRs$/ })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await pickSegment(page, "OKRs");
  await expect.poll(() => params(page).get("view")).toBe("okrs");
  const after = params(page);
  expect(after.get("period")).toBe(okrPeriod);
  expect(after.get("year")).toBe("2027");
  expect(after.get("mine")).toBe("1");
});
