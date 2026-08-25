import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const FIRST_PAINT_TIMEOUT = 60_000;

// The fixture workspace is a `team` workspace, so useTerminology renders goals
// as "Objectives" — the nesting labels follow that vocabulary.
const SUB_GOAL = "Sub-objective";

/**
 * The project Goals tab is a flat table, so a sub-goal used to be
 * indistinguishable from its parent. It now nests: children indent under
 * whichever parent is on screen, and a child whose parent is NOT on this
 * project stays at the root and names its parent instead.
 */
test("project Goals tab nests a sub-goal under its parent", async ({ page }) => {
  const fixture = loadFixture();
  await page.goto(fixture.projectGoalsUrl);

  const parentRow = page.locator("tr", { hasText: "Grow the fixture business" }).first();
  await expect(parentRow).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  const childRow = page.locator("tr", { hasText: "Ship the goal hierarchy affordance" }).first();
  await expect(childRow).toHaveAttribute("data-goal-depth", "1");
  await expect(parentRow).toHaveAttribute("data-goal-depth", "0");
  // Sighted users get the indent + ↳; the relationship is spelled out for
  // assistive tech.
  await expect(
    childRow.getByText(`${SUB_GOAL} of Grow the fixture business`),
  ).toBeAttached();

  // The child is indented past its parent's title.
  const parentTitle = await parentRow.getByText("Grow the fixture business").boundingBox();
  const childTitle = await childRow.getByText("Ship the goal hierarchy affordance").boundingBox();
  expect(parentTitle).not.toBeNull();
  expect(childTitle).not.toBeNull();
  expect(childTitle!.x).toBeGreaterThan(parentTitle!.x);

  // A sub-goal whose parent isn't on this project can't be nested under
  // anything visible, so it names the parent rather than silently flattening.
  const detachedRow = page.locator("tr", { hasText: "Sub-goal whose parent is off-project" }).first();
  await expect(detachedRow).toHaveAttribute("data-goal-depth", "0");
  await expect(
    detachedRow.getByText(`${SUB_GOAL} of Company-wide alignment (not on this project)`),
  ).toBeVisible();

  // Connected projects nest under their goal with the same treatment: the
  // parent's project sits at depth 1, the child goal's project one deeper.
  const projectRows = page.locator("tr", { hasText: "Goal hierarchy fixture" });
  await expect(projectRows.first()).toBeVisible();
  await expect(
    page.locator('tr[data-goal-depth="2"]', { hasText: "Goal hierarchy fixture" }),
  ).toHaveCount(1);

  await test.info().attach("goals-tab-hierarchy", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });

  // Collapsing the parent hides its sub-goal AND its connected project, and
  // surfaces both counts instead.
  const projectRowsBefore = await projectRows.count();
  await parentRow.getByLabel("Collapse nested rows").click();
  await expect(childRow).toHaveCount(0);
  await expect(projectRows).toHaveCount(projectRowsBefore - 2);
  await expect(parentRow.getByText(`1 ${SUB_GOAL.toLowerCase()}`)).toBeVisible();
  await expect(parentRow.getByText("1 project")).toBeVisible();

  await test.info().attach("goals-tab-collapsed", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});
