/**
 * An Assistant is an assignable principal (ADR-0067).
 *
 * The Assign Action modal lists the viewer's own Assistant first, then
 * teammates' Assistants labelled by owner, then people — one roster from the
 * server, grouped in the picker. The two hardcoded fake agents it used to
 * carry are gone, so saving with an Assistant selected is a real assignment:
 * the Assistant's shadow user lands in `ActionAssignee` like any member.
 *
 * Fixture: `Aria` (the fixture user's Assistant), `Max` (the colleague's), and
 * an unassigned action. See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile + client fetch cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

test.describe("Assign to your Assistant", () => {
  test("lists your Assistant first, teammates' Assistants by owner, then people; no fake agents", async ({
    page,
  }) => {
    await page.goto(fixture.assistantActionUrl);
    await expect(page.getByText(fixture.assistantActionName).first()).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    await page.getByText("Unassigned").click();
    const modal = page.getByRole("dialog", { name: "Assign Action" });
    await expect(modal).toBeVisible();

    const roster = modal.getByTestId("assign-roster");
    await expect(roster.getByTestId("assign-group-own")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    // Group order is the product rule, not an accident of sort keys.
    const groupIds = await roster
      .locator('[data-testid^="assign-group-"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    expect(groupIds).toEqual(["assign-group-own", "assign-group-agents", "assign-group-people"]);

    const own = roster.getByTestId("assign-group-own");
    await expect(own.getByText(fixture.assistantName, { exact: true })).toBeVisible();
    await expect(own.getByText("your assistant")).toBeVisible();

    const agents = roster.getByTestId("assign-group-agents");
    await expect(agents.getByText(fixture.colleagueAssistantName, { exact: true })).toBeVisible();
    await expect(agents.getByText(`${fixture.colleagueName}'s assistant`)).toBeVisible();

    const people = roster.getByTestId("assign-group-people");
    await expect(people.getByText(fixture.colleagueName, { exact: true })).toBeVisible();

    // The retired demo entries never render.
    await expect(modal.getByText("AI Assistant", { exact: true })).toHaveCount(0);
    await expect(modal.getByText("AI Code Reviewer")).toHaveCount(0);
  });

  test("saving with your Assistant selected assigns it for real", async ({ page }) => {
    await page.goto(fixture.assistantActionUrl);
    await expect(page.getByText(fixture.assistantActionName).first()).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    await page.getByText("Unassigned").click();
    const modal = page.getByRole("dialog", { name: "Assign Action" });
    const ownRow = modal
      .getByTestId("assign-group-own")
      .getByText(fixture.assistantName, { exact: true });
    await expect(ownRow).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    const assignRequest = page.waitForRequest("**/api/trpc/action.assign**");
    await ownRow.click();
    await modal.getByRole("button", { name: "Save Changes" }).click();
    await assignRequest;

    await expect(modal).toBeHidden();
    // The Assistant now sits in the Assignees row like any member.
    await expect(page.getByText("Unassigned")).toHaveCount(0);
    await expect(page.getByLabel(fixture.assistantName).or(page.getByText(fixture.assistantName)).first()).toBeVisible();
  });
});
