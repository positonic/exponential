/**
 * Decisions V1 (ADR-0060, ticket royal.ram): "Log a decision" on the fixture
 * meeting and the Source facet on the Decision Log. Runs authenticated via
 * the storageState minted in global-setup, against the seeded dev-fixture
 * data: a Daily Standup recording with one confirmed decision (D-0001 on a
 * fresh workspace) already logged against it.
 *
 * Assertions are functional (rows, labels, facet counts); a full-page
 * screenshot is attached to every test for human review rather than
 * pixel-diffed — see dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

/** First hit on a `next dev` route pays compile + fetch; anchor once, generously. */
const FIRST_PAINT_TIMEOUT = 60_000;

/** The Mantine modal titled "Log a decision" (the Zoe drawer is also a dialog). */
function logDecisionModal(page: Page) {
  return page.getByRole("dialog").filter({ has: page.getByText("Log a decision", { exact: true }) });
}

test("Log a decision from the fixture meeting, with a transcript turn as evidence", async ({ page }) => {
  await page.goto(fixture.meetingUrl);
  await expect(page.getByRole("heading", { name: "Daily Standup" }).first()).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  // The summary tab's Decisions block lists the seeded decision by label.
  await expect(page.locator(".mp-dec__item", { hasText: fixture.decisionLabel })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  // Mark one transcript turn as evidence: the per-turn action is hover-revealed.
  await page.getByRole("tab", { name: /^Transcript/ }).click();
  const firstTurn = page.locator(".mp-turn").first();
  await expect(firstTurn).toBeVisible();
  await firstTurn.hover();
  await firstTurn.getByRole("button", { name: "Use as evidence" }).click();
  await expect(page.getByRole("status")).toContainText("1 turn marked as evidence");

  // Log it. The statement is unique per run so re-runs against the same DB stay unambiguous.
  const statement = `E2E: ship the peek drawer first (${Date.now()})`;
  await page.getByRole("status").getByRole("button", { name: "Log a decision" }).click();
  const modal = logDecisionModal(page);
  await expect(modal).toBeVisible();
  await expect(modal.getByText("1 transcript turn")).toBeVisible();
  await modal.getByLabel("Decision").fill(statement);
  await modal.getByRole("button", { name: "Log decision" }).click();

  // Success toast carries the new label; the summary tab now lists the decision.
  await expect(page.getByText(/D-\d{4} logged/)).toBeVisible();
  await page.getByRole("tab", { name: /^Summary/ }).click();
  const newItem = page.locator(".mp-dec__item", { hasText: statement });
  await expect(newItem).toBeVisible();
  await expect(newItem).toContainText("1 transcript turn quoted");
  await attachScreenshot(page, "meeting-summary-decisions");

  // The detail page deep-links the evidence quote back to its transcript turn.
  await newItem.getByRole("link").click();
  await expect(page.getByRole("heading", { name: statement })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  const evidenceLink = page.locator('a[href*="?tab=transcript#turn-"]').first();
  await expect(evidenceLink).toBeVisible();
  await expect(page.getByText("Decided in")).toBeVisible();
  await attachScreenshot(page, "decision-detail-evidence");
});

test("Decision Log: Source facet separates meeting decisions from manual ones", async ({ page }) => {
  await page.goto(fixture.decisionsUrl);
  await expect(page.getByRole("heading", { name: "Decisions", exact: true })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  const decisionRows = page.locator('a.dec-row[data-kind="decision"]');
  const adrRows = page.locator('a.dec-row:not([data-kind="decision"])');
  const sourceFacet = page.getByRole("group", { name: "Filter by source" });

  // The seeded meeting decision is there, grouped under its ceremony.
  await expect(decisionRows.filter({ hasText: fixture.decisionLabel })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(page.locator(".dec-group__head", { hasText: "Daily Standup" })).toContainText("Ceremony");

  // Meeting facet: only meeting-sourced decisions, never an ADR row.
  await sourceFacet.getByRole("button", { name: /^Meeting/ }).click();
  await expect(decisionRows.filter({ hasText: fixture.decisionLabel })).toBeVisible();
  await expect(adrRows).toHaveCount(0);
  await expect(decisionRows.filter({ hasText: "Logged by hand" })).toHaveCount(0);

  // Manual create from the log itself. Unique per run, as above.
  const statement = `E2E: one workspace-wide D- sequence (${Date.now()})`;
  await page.getByRole("button", { name: "New decision" }).click();
  const modal = logDecisionModal(page);
  await expect(modal).toBeVisible();
  await modal.getByLabel("Decision").fill(statement);
  await modal.getByRole("button", { name: "Log decision" }).click();
  await expect(page.getByText(/D-\d{4} logged/)).toBeVisible();

  // Manual facet: the new row, marked as logged by hand and workspace-wide; the meeting one is gone.
  await sourceFacet.getByRole("button", { name: /^Manual/ }).click();
  const manualRow = decisionRows.filter({ hasText: statement });
  await expect(manualRow).toBeVisible();
  await expect(manualRow).toContainText("Logged by hand");
  await expect(manualRow).toContainText("Workspace-wide");
  await expect(decisionRows.filter({ hasText: fixture.decisionLabel })).toHaveCount(0);
  await expect(page.locator(".dec-group__head", { hasText: "Workspace" })).toBeVisible();

  // Back to all sources: both are listed.
  await sourceFacet.getByRole("button", { name: "All sources" }).click();
  await expect(decisionRows.filter({ hasText: fixture.decisionLabel })).toBeVisible();
  await expect(manualRow).toBeVisible();
  await attachScreenshot(page, "decision-log-source-facet");
});
