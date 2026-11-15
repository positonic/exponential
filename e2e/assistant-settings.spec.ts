/**
 * Settings → Assistant shows the person's one Assistant (ADR-0072): no
 * workspace picker, and a warning that its persona text travels into every
 * workspace it works in, shared ones included.
 *
 * Fixture: the fixture user's Assistant is `assistantName`. See
 * dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile + client fetch cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

test("Settings → Assistant shows one Assistant and warns that its persona travels", async ({ page }) => {
  await page.goto("/settings/assistant");

  const name = page.getByLabel("Name");
  await expect(name).toHaveValue(fixture.assistantName, { timeout: FIRST_PAINT_TIMEOUT });

  await expect(page.getByTestId("assistant-persona-warning")).toContainText(
    "the same in every workspace it works in",
  );
  // One per person: nothing to pick a workspace with.
  await expect(page.getByRole("textbox", { name: "Workspace" })).toHaveCount(0);
  await expect(page.getByText("Each workspace has its own assistant.")).toHaveCount(0);

  await test.info().attach("assistant-settings", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});
