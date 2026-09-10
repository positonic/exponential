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

test("Review extracted draft decisions: confirm publishes to the log, reject keeps it out", async ({ page }) => {
  const { confirm, reject, resolve } = fixture.draftDecisionStatements;
  await page.goto(fixture.meetingUrl);
  await expect(page.getByRole("heading", { name: "Daily Standup" }).first()).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  // Both seeded drafts sit in the review block; neither is a logged decision yet.
  // The summary tab's block, not the drawer card (which may hold a card from
  // an earlier run of the persisted Zoe thread).
  const drafts = page.getByTestId("summary-draft-decisions");
  await expect(drafts).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  const cardWith = (text: string) =>
    drafts.getByTestId("draft-decision").filter({ has: page.getByText(text, { exact: true }) });
  const confirmCard = cardWith(confirm);
  const rejectCard = cardWith(reject);
  const resolveCard = cardWith(resolve);
  await expect(confirmCard).toBeVisible();
  await expect(rejectCard).toBeVisible();
  await expect(resolveCard).toBeVisible();
  await expect(page.locator(".mp-dec__item", { hasText: confirm })).toHaveCount(0);
  // The open question sits in the Open questions column until it is resolved.
  const openItem = page.locator(".mp-dec__item", { hasText: fixture.openQuestionStatement });
  await expect(openItem).toBeVisible();
  await expect(openItem.locator(".mp-dec__dot")).toHaveAttribute("data-status", "OPEN");
  await expect(resolveCard).toContainText("Resolves");
  await attachScreenshot(page, "meeting-draft-decisions");

  // With drafts pending, the chip opens the same drafts as a review card in
  // the Zoe drawer (no model call: extraction short-circuits on existing drafts).
  await page.getByRole("button", { name: "Review drafts with Zoe" }).click();
  const drawerCard = page.getByTestId("draft-decisions-card");
  await expect(drawerCard).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(drawerCard.getByTestId("draft-decision")).toHaveCount(3);
  await attachScreenshot(page, "zoe-drawer-draft-decisions");

  // Edit from the card: the new statement shows in the drawer and the tab.
  const edited = `${confirm} (edited ${Date.now()})`;
  await drawerCard
    .getByTestId("draft-decision")
    .filter({ has: page.getByText(confirm, { exact: true }) })
    .getByRole("button", { name: "Edit" })
    .click();
  const editModal = page.getByRole("dialog").filter({ has: page.getByText("Edit draft decision", { exact: true }) });
  await expect(editModal).toBeVisible();
  await editModal.getByLabel("Decision").fill(edited);
  await editModal.getByRole("button", { name: "Save draft" }).click();
  await expect(editModal).toHaveCount(0);
  await expect(drawerCard.getByTestId("draft-decision").filter({ hasText: edited })).toBeVisible();
  // The summary tab's own block reflects the edit too (shared query). Close
  // the drawer first: it overlays the tab and would intercept the clicks.
  await page.getByRole("dialog", { name: "Zoe assistant" }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(cardWith(edited)).toBeVisible();

  // Reject: the card goes, nothing is logged.
  await rejectCard.getByRole("button", { name: "Reject" }).click();
  await expect(rejectCard).toHaveCount(0);
  await expect(page.locator(".mp-dec__item", { hasText: reject })).toHaveCount(0);

  // Confirm: the toast names the label and the draft becomes a listed decision.
  await cardWith(edited).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/D-\d{4} logged/)).toBeVisible();
  await expect(cardWith(edited)).toHaveCount(0);
  const item = page.locator(".mp-dec__item", { hasText: edited });
  await expect(item).toBeVisible();
  await expect(item).toContainText("1 transcript turn quoted");
  // Resolve: accepting the resolution draft changes the open question's
  // status instead of adding a row — it moves to Decisions, keeps its label,
  // and the draft is gone.
  const openLabel = (await openItem.locator(".mp-dec__label").textContent())?.trim() ?? "";
  expect(openLabel).toMatch(/^D-\d{4}$/);
  await resolveCard.getByRole("button", { name: /^Accept D-\d{4}$/ }).click();
  await expect(page.getByText(`${openLabel} logged`)).toBeVisible();
  await expect(drafts).toHaveCount(0);
  await expect(openItem.locator(".mp-dec__dot")).toHaveAttribute("data-status", "ACCEPTED");
  await expect(openItem.locator(".mp-dec__label")).toHaveText(openLabel);
  await expect(page.locator(".mp-dec__item", { hasText: resolve })).toHaveCount(0);
  // Drafts reviewed: the chip is an extraction entry point again.
  await expect(page.getByRole("button", { name: "Extract decisions" })).toBeVisible();

  // It now lists in the Decision Log under Source = Meeting.
  await page.goto(fixture.decisionsUrl);
  const decisionRows = page.locator('a.dec-row[data-kind="decision"]');
  await expect(decisionRows.filter({ hasText: edited })).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(decisionRows.filter({ hasText: reject })).toHaveCount(0);
  await expect(decisionRows.filter({ hasText: resolve })).toHaveCount(0);
  await attachScreenshot(page, "decision-log-after-confirm");
});
