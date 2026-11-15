/**
 * Withdrawing your Assistant from a Position, and vacancy (ADR-0068, Agent
 * PRD V3 / D9).
 *
 * A person is accountable for their Assistant in a Position, so they can take
 * it out of one themselves. The Position's row says "Your agent … holds this
 * Position" with a Withdraw button; withdrawing its only holder leaves it
 * "Vacant", and the section count says how many are.
 *
 * The spec creates its own Position held by the fixture user's Assistant
 * (`assistantName`) and deletes it at the end, so the seeded "Travel
 * researcher" holder that other specs rely on is never touched. See
 * dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile + client fetch cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

const TITLE = "Chief of Staff (withdraw spec)";

test("the owner of an agent holder withdraws it, and the Position reads Vacant", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(fixture.workspaceSettingsUrl);
  await page.getByRole("button", { name: /^Members/ }).click();
  const section = page.getByTestId("positions-section");
  await expect(section).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  // A Position held by the fixture user's own Assistant.
  await page.getByTestId("position-new").click();
  const modal = page.getByRole("dialog", { name: "New Position" });
  await modal.getByTestId("position-title").fill(TITLE);
  await modal
    .getByPlaceholder(/Research and shortlist travel options/)
    .fill("Prepares the weekly review and chases open decisions.");
  await modal.getByTestId("position-holders").click();
  await page.getByRole("option", { name: fixture.assistantName }).click();
  await modal.getByTestId("position-title").click();
  await modal.getByTestId("position-save").click();
  await expect(modal).toBeHidden();

  const row = section.getByTestId("position-row").filter({ hasText: TITLE });
  const mine = row.getByTestId("position-my-agent");
  await expect(mine).toContainText(`Your agent ${fixture.assistantName} holds this Position.`);
  await expect(row.getByTestId("position-vacant")).toHaveCount(0);

  await mine.getByTestId("position-withdraw").click();

  await expect(row.getByTestId("position-vacant")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(row.getByTestId("position-my-agent")).toHaveCount(0);
  await expect(page.getByText(/· 1 vacant/)).toBeVisible();

  await test.info().attach("position-vacant", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });

  // Leave the workspace as the seed made it.
  await row.getByRole("button", { name: `Delete ${TITLE}` }).click();
  await expect(row).toHaveCount(0);
});
