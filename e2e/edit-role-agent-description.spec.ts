/**
 * The workspace "Edit Role" modal shows an agent member's description.
 *
 * The description lives on the agent's `ExternalAgent` row — global to the
 * agent, not per workspace — so the modal renders it read-only with a link to
 * the Agents settings page, and shows nothing of the sort for a human member.
 *
 * Fixture: the fixture user owns `dev-fixture` (owners see the edit pencil);
 * `Max` is the colleague's Assistant with a seeded description; the colleague
 * is a human member. See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile + client fetch cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

test.describe("Edit Role modal — agent description", () => {
  test("shows the agent's description read-only, with a link to the Agents page", async ({
    page,
  }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/settings`);
    await page.getByRole("button", { name: /^Members/ }).click();
    // The agent's name and its "agent" badge share one line, so match on the prefix.
    const agentName = page.getByText(new RegExp(`^${fixture.colleagueAssistantName}`));
    await expect(agentName).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    const row = page.locator("div.group").filter({ has: agentName });
    await row.getByRole("button", { name: "Edit role" }).click();

    const modal = page.getByRole("dialog", { name: "Edit Role" });
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Agent description")).toBeVisible();
    // Markdown renders: the bold span carries the word on its own.
    await expect(modal.getByText("agendas", { exact: true })).toBeVisible();
    await expect(modal.getByText("summarises long threads")).toBeVisible();
    await expect(modal.getByRole("link", { name: "Edit on the Agents page" })).toHaveAttribute(
      "href",
      "/settings/agents",
    );
    await test.info().attach("edit-role-agent", {
      body: await modal.screenshot(),
      contentType: "image/png",
    });
    await modal.getByRole("button", { name: "Cancel" }).click();

    // A human member gets no description block.
    const humanRow = page
      .locator("div.group")
      .filter({ has: page.getByText(fixture.colleagueName, { exact: true }) });
    await humanRow.getByRole("button", { name: "Edit role" }).click();
    const humanModal = page.getByRole("dialog", { name: "Edit Role" });
    await expect(humanModal).toBeVisible();
    await expect(humanModal.getByText("Agent description")).toHaveCount(0);
  });
});
