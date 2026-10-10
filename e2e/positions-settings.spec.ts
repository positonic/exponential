/**
 * Positions on Settings → Members (ADR-0068, V1 tracer bullet).
 *
 * The Positions section lists the seeded "Travel researcher", held by Aria.
 * Each member row shows the Positions held, or a warning when a human has
 * none (or an agent has neither a Position nor a description). The owner
 * creates a Position and picks the colleague as its holder; the colleague's
 * warning goes away.
 *
 * Fixture: the fixture user (owner, no Position), `Fixture Colleague`
 * (member, no Position), `Aria` (holds the seeded Position). Re-seeding
 * removes any Position a previous run created. See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile + client fetch cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

const NEW_POSITION_TITLE = "Offsite planner";

async function openMembersSection(page: Page) {
  await page.goto(fixture.workspaceSettingsUrl);
  await page.getByRole("button", { name: /^Members/ }).click();
  await expect(page.getByTestId("positions-section")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
}

function memberRow(page: Page, name: string) {
  return page.locator('[data-testid="member-row"]', { hasText: name });
}

test.describe("Positions on workspace settings", () => {
  test("lists the seeded Position and warns on members with no stated remit", async ({ page }) => {
    await openMembersSection(page);

    const section = page.getByTestId("positions-section");
    await expect(section.getByTestId("position-row")).toHaveCount(1);
    await expect(section.getByText(fixture.positionTitle, { exact: true })).toBeVisible();

    // Aria holds the Position: her row shows its title and no warning.
    const aria = memberRow(page, fixture.assistantName);
    await expect(aria.getByTestId("member-positions")).toContainText(fixture.positionTitle);
    await expect(aria.getByTestId("remit-gap")).toHaveCount(0);

    // A human with no Position is flagged so the gap is visible.
    const colleague = memberRow(page, fixture.colleagueName);
    await expect(colleague.getByTestId("remit-gap")).toBeVisible();
  });

  test("owner creates a Position with a holder and the holder's warning disappears", async ({ page }) => {
    await openMembersSection(page);

    const colleague = memberRow(page, fixture.colleagueName);
    await expect(colleague.getByTestId("remit-gap")).toBeVisible();

    await page.getByTestId("position-new").click();
    const modal = page.getByRole("dialog", { name: "New Position" });
    await expect(modal).toBeVisible();

    await modal.getByTestId("position-title").fill(NEW_POSITION_TITLE);
    await modal
      .getByPlaceholder(/Research and shortlist travel options/)
      .fill("Plans the offsite: agenda, venue shortlist, logistics.");
    await modal.getByTestId("position-holders").click();
    await page.getByRole("option", { name: fixture.colleagueName }).click();
    // Close the picker's dropdown without Escape, which would close the modal.
    await modal.getByTestId("position-title").click();

    const createRequest = page.waitForRequest("**/api/trpc/position.create**");
    await modal.getByTestId("position-save").click();
    await createRequest;
    await expect(modal).toBeHidden();

    const section = page.getByTestId("positions-section");
    await expect(section.getByText(NEW_POSITION_TITLE, { exact: true })).toBeVisible();

    // The holder's row now shows the Position instead of the warning.
    await expect(colleague.getByTestId("member-positions")).toContainText(NEW_POSITION_TITLE);
    await expect(colleague.getByTestId("remit-gap")).toHaveCount(0);
  });
});
