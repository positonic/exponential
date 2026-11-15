/**
 * The Person page (`/people/<userId>`): one page per person, human or agent,
 * showing what they did across the workspaces the viewer belongs to.
 *
 * Covers the three ways in — an actor's name on an activity row, "Your page" in
 * the user menu, and a member in workspace settings — plus the header for an
 * agent, the not-found rule, and handles (`/people/<handle>`).
 *
 * Fixture: the colleague has two seeded activity events in `dev-fixture`;
 * `Aria` is the fixture user's Assistant and holds the seeded Position.
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;

function personHeading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name, exact: true });
}

// One worker, in order: the handle test changes the signed-in user's own URL,
// which the "Your page" test reads.
test.describe.configure({ mode: "default" });

test.describe("Person page", () => {
  test("an actor's name on the activity feed opens their Person page", async ({ page }) => {
    await page.goto("/activity");

    const actor = page
      .locator(".wsa-feed__actor-link", { hasText: fixture.colleagueName })
      .first();
    await expect(actor).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await actor.click();

    await page.waitForURL(`**/people/${fixture.colleagueUserId}`, {
      timeout: FIRST_PAINT_TIMEOUT,
    });
    await expect(personHeading(page, fixture.colleagueName)).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    // The feed is the colleague's own activity, grouped under a day heading.
    const feed = page.getByRole("region", { name: `${fixture.colleagueName}'s activity` });
    for (const title of fixture.colleagueActivityTitles) {
      await expect(feed.locator(".wsa-feed__row", { hasText: title })).toBeVisible();
    }
    await expect(feed.locator(".wsa-feed__day-label").first()).toHaveText("Today");
    // Every row is theirs: no other actor appears on the page.
    await expect(feed.locator(".wsa-feed__actor-link").first()).toHaveText(fixture.colleagueName);

    // A human: no Agent badge, no owner line, and no digest of someone else.
    await expect(page.getByText("Owned by")).toHaveCount(0);
    await expect(page.getByText("Your week in work")).toHaveCount(0);

    await page.screenshot({ path: test.info().outputPath("person-colleague.png") });
  });

  test("the workspace chips filter the feed", async ({ page }) => {
    await page.goto(`/people/${fixture.colleagueUserId}`);
    const feed = page.getByRole("region", { name: `${fixture.colleagueName}'s activity` });
    const firstTitle = fixture.colleagueActivityTitles[0]!;
    await expect(feed.locator(".wsa-feed__row", { hasText: firstTitle })).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    // The colleague's seeded activity is all in `dev-fixture`.
    const chips = page.getByRole("tablist", { name: "Filter activity by workspace" });
    await chips.getByRole("tab", { name: fixture.otherWorkspaceName, exact: true }).click();
    await page.waitForURL(/[?&]workspace=/);
    await expect(feed.locator(".wsa-feed__row", { hasText: firstTitle })).toHaveCount(0);

    await chips.getByRole("tab", { name: "All", exact: true }).click();
    await expect(feed.locator(".wsa-feed__row", { hasText: firstTitle })).toBeVisible();
    expect(new URL(page.url()).searchParams.has("workspace")).toBe(false);
  });

  test("a source filter in the URL always leaves a way back to All", async ({ page }) => {
    // Every row under ?source=internal is internal, so no provider chip can be
    // derived from them. The control must still be there.
    await page.goto(`/people/${fixture.colleagueUserId}?source=internal`);
    const feed = page.getByRole("region", { name: `${fixture.colleagueName}'s activity` });
    await expect(
      feed.locator(".wsa-feed__row", { hasText: fixture.colleagueActivityTitles[0]! }),
    ).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    const sources = page.getByRole("tablist", { name: "Filter by source" });
    await expect(sources.getByRole("tab", { name: "Exponential" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await sources.getByRole("tab", { name: "All", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.has("source")).toBe(false);
  });

  test("'Your page' in the user menu opens your own Person page", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/home`);

    const trigger = page.locator(".sb-user");
    await expect(trigger).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await trigger.click();
    await page.getByRole("menuitem", { name: "Your page" }).click();

    await page.waitForURL(`**/people/${fixture.userId}`, { timeout: FIRST_PAINT_TIMEOUT });
    await expect(page.getByText("Your workspaces")).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
    // Your own page never carries the summary written about other people.
    await expect(page.getByTestId("person-week-summary")).toHaveCount(0);
    await expect(
      page.getByRole("tablist", { name: "Filter activity by workspace" }).getByRole("tab", {
        name: fixture.otherWorkspaceName,
        exact: true,
      }),
    ).toBeVisible();
  });

  test("a member in workspace settings opens their Person page, with the agent header", async ({
    page,
  }) => {
    await page.goto(fixture.workspaceSettingsUrl);
    await page.getByRole("button", { name: /^Members/ }).click();

    const row = page.locator(
      `[data-testid="member-row"][data-user-id="${fixture.assistantUserId}"]`,
    );
    await expect(row).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await row.getByTestId("person-link").click();

    await page.waitForURL(`**/people/${fixture.assistantUserId}`, {
      timeout: FIRST_PAINT_TIMEOUT,
    });
    await expect(personHeading(page, fixture.assistantName)).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    const header = page.getByTestId("person-header");
    await expect(header.getByText("Agent", { exact: true })).toBeVisible();
    // The owner is named and links to their own Person page.
    await expect(header.getByRole("link", { name: "Dev Fixture" })).toHaveAttribute(
      "href",
      `/people/${fixture.userId}`,
    );
    await expect(header.getByText(fixture.positionTitle)).toBeVisible();

    await page.screenshot({ path: test.info().outputPath("person-agent.png") });
  });

  test("an unknown person is the ordinary not-found page", async ({ page }) => {
    await page.goto("/people/not-a-real-user-id");

    await expect(page.getByText("This page could not be found.")).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
  });

  test("a handle set in profile settings opens the page, and the id URL lands on it", async ({
    page,
  }) => {
    const handle = "dev-fixture-e2e";
    const field = () => page.getByTestId("handle-value");
    // "Your workspaces" is the header of your own page only.
    const ownHeader = () => page.getByTestId("person-header").getByText("Your workspaces");

    await page.goto("/settings/profile");
    await expect(field()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    try {
      // A reserved word is refused before anything is sent.
      await page.getByTestId("handle-edit").click();
      await page.getByTestId("handle-input").fill("admin");
      await expect(page.getByText("That handle is reserved. Pick another.")).toBeVisible();
      await expect(page.getByTestId("handle-save")).toBeDisabled();
      await page.screenshot({ path: test.info().outputPath("handle-refused.png") });

      // Typed in capitals, stored lowercase.
      await page.getByTestId("handle-input").fill(handle.toUpperCase());
      await page.getByTestId("handle-save").click();
      await expect(field()).toHaveText(`/people/${handle}`);
      await page.screenshot({ path: test.info().outputPath("handle-saved.png") });

      // The handle URL is the page.
      await page.goto(`/people/${handle}`);
      await expect(ownHeader()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
      expect(new URL(page.url()).pathname).toBe(`/people/${handle}`);

      // The id URL still works, and lands on the handle URL with its filters.
      await page.goto(`/people/${fixture.userId}?source=internal`);
      await page.waitForURL(`**/people/${handle}?source=internal`, {
        timeout: FIRST_PAINT_TIMEOUT,
      });
      await expect(ownHeader()).toBeVisible();

      // "Your page" now links by handle.
      await page.locator(".sb-user").click();
      await expect(page.getByRole("menuitem", { name: "Your page" })).toHaveAttribute(
        "href",
        `/people/${handle}`,
      );
      await page.keyboard.press("Escape");

      await page.screenshot({ path: test.info().outputPath("person-handle.png") });
    } finally {
      // Leave the fixture user without a handle, whatever happened above.
      await page.goto("/settings/profile");
      await expect(field()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
      const remove = page.getByTestId("handle-remove");
      if (await remove.isVisible()) {
        await remove.click();
        await expect(field()).toHaveText("Not set");
      }
    }

    // Freed at once: the old handle is nobody's page now.
    await page.goto(`/people/${handle}`);
    await expect(page.getByText("This page could not be found.")).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
  });
});
