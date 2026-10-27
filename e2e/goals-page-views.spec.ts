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

  // The period narrative header sits above the view, not inside it.
  const header = page.getByTestId("goals-period-header");
  await expect(header).toContainText(`Objectives · ${okrPeriod} ${okrYear}`);
  await expect(header).toContainText("of its KR targets");

  // Switching view keeps the period and year; `view` drops to its default.
  await pickSegment(page, "Table");
  await expect.poll(() => params(page).get("view")).toBeNull();
  expect(params(page).get("period")).toBe(okrPeriod);
  await expect(header).toContainText(`Objectives · ${okrPeriod} ${okrYear}`);

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

  // All narrates the selected year and shows no countdown.
  const header = page.getByTestId("goals-period-header");
  const year = new Date().getFullYear();
  await expect(header).toContainText(`Objectives · ${year}`);
  await expect(header).toContainText(`What we're betting on in ${year}`);
  await expect(header).not.toContainText(/\d+d left/);
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

test("the Status filter removes a completed objective and survives a view switch", async ({ page }) => {
  await page.goto(`${goalsPath}?period=${okrPeriod}&year=${okrYear}`);

  const completedRow = page.locator("tr", { hasText: FIXTURE.completedGoalTitle }).first();
  await expect(completedRow).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  // Filter → Status → Active: only active objectives remain.
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("button", { name: /^Filter$/ }).nth(1).click();
  await page.getByText("Status", { exact: true }).click();
  await page.getByText("Active", { exact: true }).click();
  await expect.poll(() => params(page).get("status")).toBe("active");
  await expect(page.locator("tr", { hasText: FIXTURE.completedGoalTitle })).toHaveCount(0);
  await expect(page.locator("tr", { hasText: FIXTURE.objectiveTitle }).first()).toBeVisible();

  // The filter is applied in the shell, so the OKRs view honours it too.
  await page.keyboard.press("Escape");
  await pickSegment(page, "OKRs");
  await expect.poll(() => params(page).get("view")).toBe("okrs");
  expect(params(page).get("status")).toBe("active");
  await expect(page.getByText(FIXTURE.objectiveTitle).first()).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(page.getByText(FIXTURE.completedGoalTitle)).toHaveCount(0);

  // Search narrows the same way on every view.
  await page.getByRole("textbox", { name: "Search" }).fill("zzz-no-such-objective");
  await expect(page.getByText("No objectives match your search or filters")).toBeVisible();
});

test("a retired tab= link rewrites once to the current grammar", async ({ page }) => {
  await page.goto(`${goalsPath}?tab=my-goals&year=${okrYear}&period=${okrPeriod}`);

  // The rewrite runs client-side after hydration, so on a cold `next dev`
  // it lands after the first compile.
  await expect.poll(() => params(page).get("tab"), { timeout: FIRST_PAINT_TIMEOUT }).toBeNull();
  const after = params(page);
  expect(after.get("view")).toBe("okrs");
  expect(after.get("mine")).toBe("1");
  expect(after.get("period")).toBe(okrPeriod);

  // Mine is on: the fixture user is the DRI on the seeded objective.
  await expect(page.getByText(FIXTURE.objectiveTitle).first()).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(page.getByRole("button", { name: "Mine" })).toHaveAttribute("aria-pressed", "true");
});

test("a drawer= deep link opens the OKR drawer on the Table view, fetching by id", async ({ page }) => {
  // The parent goal has no period, so on the default quarter it is outside
  // the Table's data: the drawer must open from an id stub and fetch it.
  await page.goto(`${goalsPath}?drawer=objective:${fixture.goalIds.parent}`);

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(drawer).toContainText(FIXTURE.parentGoalTitle, { timeout: FIRST_PAINT_TIMEOUT });
  // The Table view is still the one behind it.
  expect(params(page).get("view")).toBeNull();
  await expect(page.getByTestId("goals-period-header")).toBeVisible();

  await test.info().attach("drawer-on-table-view", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});

test("Timeline is a view of the same list, with a year axis on All", async ({ page }) => {
  await page.goto(`${goalsPath}?view=timeline&period=${okrPeriod}&year=${okrYear}`);

  const gantt = page.locator(".okrt").first();
  await expect(gantt).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(gantt).toContainText(FIXTURE.objectiveTitle);
  await expect(page.getByTestId("goals-period-header")).toContainText(
    `Objectives · ${okrPeriod} ${okrYear}`,
  );

  // All keeps the Timeline view and draws the selected year's axis.
  await pickSegment(page, "All");
  await expect.poll(() => params(page).get("period")).toBe("all");
  expect(params(page).get("view")).toBe("timeline");
  await expect(page.locator(".okrt").first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.locator(".okrt").first()).toContainText("Dec");

  await test.info().attach("timeline-on-all", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});

test("the Key results view lists the seeded KR with its objective, and a row opens the drawer", async ({ page }) => {
  await page.goto(`${goalsPath}?view=key-results&period=${okrPeriod}&year=${okrYear}`);

  const table = page.getByTestId("key-results-table");
  await expect(table).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  const row = table.locator("tr", { hasText: FIXTURE.keyResultTitle }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(FIXTURE.objectiveTitle);
  // Seeded at 40 of 100 percent.
  await expect(row).toContainText("40%");
  await expect(row).toContainText("40% / 100%");

  // The header and the rest of the control line are the same as on every view.
  await expect(page.getByTestId("goals-period-header")).toContainText(
    `Objectives · ${okrPeriod} ${okrYear}`,
  );

  // Column headers sort client-side: the URL does not change.
  const progressHeader = table.getByRole("columnheader", { name: /Progress/ });
  await progressHeader.getByRole("button").click();
  await expect(progressHeader).toHaveAttribute("aria-sort", "descending");
  await progressHeader.getByRole("button").click();
  await expect(progressHeader).toHaveAttribute("aria-sort", "ascending");
  expect(params(page).get("sort")).toBeNull();

  // The title is the keyboard target: focus it and press Enter.
  await row.getByRole("button", { name: `Open key result: ${FIXTURE.keyResultTitle}` }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => params(page).get("drawer")).toMatch(/^keyResult:/);
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(FIXTURE.keyResultTitle);

  await test.info().attach("key-results-view", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});

test("Key results rows honour the Status filter and search like the other views", async ({ page }) => {
  // Status is the parent objective's lifecycle: the completed objective's KR
  // is the only row under status=completed, and the active objective's KR is
  // not among them.
  await page.goto(`${goalsPath}?view=key-results&period=${okrPeriod}&year=${okrYear}&status=completed`);
  const completedRow = page
    .getByTestId("key-results-table")
    .locator("tr", { hasText: FIXTURE.completedKeyResultTitle });
  await expect(completedRow).toHaveCount(1, { timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.getByText(FIXTURE.keyResultTitle)).toHaveCount(0);

  await page.goto(`${goalsPath}?view=key-results&period=${okrPeriod}&year=${okrYear}&status=active`);
  const table = page.getByTestId("key-results-table");
  await expect(table.locator("tr", { hasText: FIXTURE.keyResultTitle })).toHaveCount(1, {
    timeout: FIRST_PAINT_TIMEOUT,
  });

  // Search matches the objective's title as well as the key result's.
  await page.getByRole("textbox", { name: "Search" }).fill(FIXTURE.objectiveTitle.slice(0, 20));
  await expect(table.locator("tr", { hasText: FIXTURE.keyResultTitle })).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search" }).fill("zzz-no-such-key-result");
  await expect(page.getByText("No key results match your search or filters.")).toBeVisible();
});

test("Key results view empty states: nothing in the period, and nothing of yours", async ({ page }) => {
  // No fixture data lives in 2027.
  await page.goto(`${goalsPath}?view=key-results&period=${okrPeriod}&year=2027`);
  await expect(page.getByText("No key results in this period yet.")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(page.getByTestId("key-results-table")).toHaveCount(0);

  await page.goto(`${goalsPath}?view=key-results&period=${okrPeriod}&year=2027&mine=1`);
  await expect(page.getByText("None of this period's key results are yours.")).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
});

test("a personal workspace offers Table and Timeline only, and ?view=okrs falls back to Table", async ({ page }) => {
  const personalPath = `/w/${fixture.personalWorkspaceSlug}/goals`;
  await page.goto(`${personalPath}?view=okrs&period=all`);

  // The view param is rewritten away; the period survives.
  await expect.poll(() => params(page).get("view"), { timeout: FIRST_PAINT_TIMEOUT }).toBeNull();
  expect(params(page).get("period")).toBe("all");

  const controls = page.getByTestId("goals-controls");
  await expect(controls).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(controls.locator("label.mantine-SegmentedControl-label", { hasText: /^Table$/ })).toBeVisible();
  await expect(controls.locator("label.mantine-SegmentedControl-label", { hasText: /^Timeline$/ })).toBeVisible();
  await expect(controls.locator("label.mantine-SegmentedControl-label", { hasText: /^OKRs$/ })).toHaveCount(0);
  await expect(controls.locator("label.mantine-SegmentedControl-label", { hasText: /^Key results$/ })).toHaveCount(0);

  // The Table view lists the personal goal.
  await expect(page.locator("tr", { hasText: FIXTURE.personalGoalTitle }).first()).toBeVisible();

  // The header speaks the workspace's language and narrates no KR attainment.
  const header = page.getByTestId("goals-period-header");
  const year = new Date().getFullYear();
  await expect(header).toContainText(`Goals · ${year}`);
  await expect(header).toContainText(`What we're betting on in ${year}`);
  await expect(header).not.toContainText("KR targets");
  await expect(header).not.toContainText("Objectives");
});

