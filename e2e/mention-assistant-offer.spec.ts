/**
 * Mentioning an Assistant never starts a run; assigning it does (decided
 * 2026-10-11). The @ dropdown labels the Assistant an agent, the comment
 * posts, and the author is told nothing started and offered the assignment.
 * Taking the offer assigns the Assistant.
 *
 * Fixture: `mentionActionUrl` is reset to unassigned with no runs on every
 * seed; `assistantName` is the fixture user's own Assistant. A run the
 * assignment starts dispatches to the e2e Mastra stub port, where nothing
 * listens for this spec, and fails quietly; this spec asserts only the
 * assignment. See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile + client fetch cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

test("mentioning an unassigned Assistant starts nothing and offers the assignment", async ({ page }) => {
  await page.goto(fixture.mentionActionUrl);
  await expect(page.getByText(fixture.mentionActionName).first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  const box = page.getByPlaceholder(/^Leave a comment/);
  await box.click();
  await box.pressSequentially(`@${fixture.assistantName.slice(0, 3)}`);

  // The Assistant is a workspace member, but reads as an agent in the dropdown.
  const option = page.getByRole("paragraph").filter({ hasText: new RegExp(`^@${fixture.assistantName}$`) });
  await expect(option).toBeVisible();
  const optionRow = page.locator("div").filter({ has: option }).filter({ hasText: /^@\S+(Agent|Member)$/ }).last();
  await expect(optionRow).toContainText("Agent");
  await page.keyboard.press("Enter");
  await box.pressSequentially("please find a restaurant");
  await page.getByRole("button", { name: "Send comment" }).click();

  // The comment posts; nothing started, so the author is offered the assignment.
  await expect(
    page.getByText(`${fixture.assistantName} isn't assigned to this action, so mentioning it didn't start anything.`),
  ).toBeVisible({ timeout: 15_000 });
  await test.info().attach("assignment-offer", { body: await page.screenshot(), contentType: "image/png" });
  await expect(page.getByTestId("agent-run-pill")).toHaveCount(0);

  await page.getByRole("button", { name: `Assign ${fixture.assistantName}` }).click();
  await expect(page.getByText(new RegExp(`^(${fixture.assistantName} is on it|Assigned)$`))).toBeVisible({
    timeout: 15_000,
  });
});
