/**
 * "Add my Assistant" on a workspace's Members page (ADR-0072, Agent PRD V2).
 *
 * A person's Assistant joins a workspace only when they add it. In a
 * workspace it is not in, Members offers "Add my Assistant" beside "Invite
 * member"; clicking it makes the Assistant a `member`, and its row appears
 * with the agent badge. The button then goes away.
 *
 * Fixture: the fixture user owns the second workspace (`otherWorkspaceSlug`),
 * and the seed takes their Assistant (`assistantName`) out of it on every run.
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile + client fetch cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

test("Members offers Add my Assistant, and the Assistant joins as an agent member", async ({ page }) => {
  await page.goto(`/w/${fixture.otherWorkspaceSlug}/settings?section=members`);

  const addButton = page.getByTestId("add-my-assistant");
  await expect(addButton).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  const assistantRow = page.getByTestId("member-row").filter({ hasText: fixture.assistantName });
  await expect(assistantRow).toHaveCount(0);

  await addButton.click();

  await expect(assistantRow).toHaveCount(1, { timeout: FIRST_PAINT_TIMEOUT });
  await expect(assistantRow).toContainText("agent");
  await expect(assistantRow).toContainText("member");
  await expect(addButton).toHaveCount(0);

  await test.info().attach("add-my-assistant", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});
