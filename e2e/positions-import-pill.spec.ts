/**
 * The chat's "Import roles & responsibilities" pill (ADR-0068, V3).
 *
 * In a team workspace where fewer than half of the humans and Assistants hold
 * a Position, the pill sits above the chat composer. Clicking it prefills the
 * import ask; dismissing it hides it for that workspace, and it stays hidden
 * after a reload (localStorage, 30 days).
 *
 * Fixture: the second workspace (`otherWorkspaceSlug`) has two humans — the
 * fixture user and `Fixture Colleague` — and no Positions, so it qualifies on
 * every run. `dev-fixture` itself is avoided on purpose: the settings spec
 * adds a Position there, which can tip it to exactly half covered.
 * Each test gets a fresh browser context, so a dismissal never leaks between
 * tests. See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile + client fetch cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

async function openChat(page: Page) {
  await page.goto(`/w/${fixture.otherWorkspaceSlug}/agent`);
  await expect(page.getByPlaceholder("Ask anything")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
}

test.describe("Positions import pill in chat", () => {
  test("shows in a team workspace with no Positions and prefills the composer", async ({ page }) => {
    await openChat(page);

    const pill = page.getByTestId("positions-import-pill");
    await expect(pill).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    await pill.getByRole("button", { name: /Import roles & responsibilities/ }).click();

    const composer = page.getByPlaceholder("Ask anything");
    await expect(composer).toHaveValue(/^Import our roles & responsibilities into Positions/);
    await expect(composer).toBeFocused();
  });

  test("stays hidden after dismiss and reload", async ({ page }) => {
    await openChat(page);

    const pill = page.getByTestId("positions-import-pill");
    await expect(pill).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    await pill.getByRole("button", { name: "Dismiss import roles & responsibilities" }).click();
    await expect(pill).toBeHidden();

    await page.reload();
    await expect(page.getByPlaceholder("Ask anything")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    // Give the page time to settle so a late pill would have rendered by now.
    await page.waitForLoadState("networkidle", { timeout: FIRST_PAINT_TIMEOUT });
    await expect(pill).toHaveCount(0);
  });
});
