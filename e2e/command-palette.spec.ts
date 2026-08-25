/**
 * Visual + functional verification of the ⌘K command palette: the
 * "All workspaces" scope toggle, and the results list's horizontal overflow.
 *
 * Runs authenticated via the storageState minted in global-setup, against the
 * seeded `dev-fixture` workspace plus the second workspace the fixture seeds
 * alongside it (the toggle hides itself for people in only one workspace, so
 * that second workspace is load-bearing here).
 *
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

// One worker for this file. Every test here opens the palette from a fresh
// page load, and five of those landing at once alongside the rest of the suite
// puts enough load on the single `next dev` server to time out other specs'
// navigations. Sequential costs ~10s and keeps the suite honest.
test.describe.configure({ mode: "serial" });

/**
 * First hit on a `next dev` route pays the compile + client fetch cost, which
 * routinely exceeds the default 5s expect timeout.
 */
const FIRST_PAINT_TIMEOUT = 60_000;

/**
 * Opens the palette from the Projects page rather than the workspace home.
 * Home renders its own always-present search box that takes focus on
 * hydration, which can land after the palette is already open and steal focus
 * out of it — a race that has nothing to do with what these tests assert.
 */
async function openPalette(page: Page) {
  await page.goto(`/w/${fixture.workspaceSlug}/projects`);
  await page.waitForLoadState("networkidle", { timeout: FIRST_PAINT_TIMEOUT });
  await page.keyboard.press("Meta+k");
  const modal = page.locator(".mantine-Modal-content");
  await expect(modal).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  const input = modal.getByPlaceholder("Search, command, or ask Zoe");
  await expect(input).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  return { input, modal };
}

/**
 * Measures the nearest scrolling ancestor of a result row. Returned from the
 * page rather than asserted there so a failure reports both numbers.
 */
function measureScrollContainer(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector("[data-palette-index]");
    let el = row?.parentElement ?? null;
    while (el) {
      const { overflowY } = getComputedStyle(el);
      if (overflowY === "auto" || overflowY === "scroll") {
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      }
      el = el.parentElement;
    }
    return null;
  });
}

test("results list does not overflow horizontally", async ({ page }) => {
  const { input, modal } = await openPalette(page);
  // Any rendered row will do: `.resultRow` is unconditionally 16px wider than
  // its container, so the overflow never depended on how many results landed.
  await input.fill("g");
  await input.fill("goal");
  await expect(modal.locator("[data-palette-index]").first()).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  const box = await measureScrollContainer(page);
  expect(box, "no scrolling ancestor found for the result rows").not.toBeNull();
  expect(box!.scrollWidth).toBeLessThanOrEqual(box!.clientWidth);
});

test("All workspaces widens the search past the current workspace", async ({ page }) => {
  const { input, modal } = await openPalette(page);
  const checkbox = modal.getByRole("checkbox", { name: "All workspaces" });
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();

  // Scoped to dev-fixture, the other workspace's action is out of reach.
  await input.fill(fixture.otherWorkspaceActionName);
  await expect(modal.getByText("No matches")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  await checkbox.check();
  await expect(modal.getByText(fixture.otherWorkspaceActionName)).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  // Results from elsewhere are labelled with the workspace they live in.
  await expect(modal.getByText(fixture.otherWorkspaceName)).toBeVisible();

  // Unticking must put the scope back, not leave the wider results stranded.
  await checkbox.uncheck();
  await expect(modal.getByText("No matches")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
});

test("toggling scope does not leave the previous scope's results on screen", async ({ page }) => {
  const { input, modal } = await openPalette(page);
  // "accordion" matches seeded data but no navigation label — navigation rows
  // are built client-side and rightly survive a scope change, so a query that
  // produced any would make the assertion below untestable.
  await input.fill("a");
  await input.fill("accordion");
  const rows = modal.locator("[data-palette-index]");
  await expect(rows.first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  // Hold the next search open so the in-flight window is observable. The query
  // string doesn't change across this toggle, so the staleness guard has to key
  // on scope too — otherwise `placeholderData` rides the scoped results through
  // the refetch and the list contradicts the box that was just ticked.
  await page.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes("search.global")) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    await route.continue();
  });

  await modal.getByRole("checkbox", { name: "All workspaces" }).check();
  // Must clear well inside the 5s the response is held for.
  await expect(rows).toHaveCount(0, { timeout: 2_000 });
});

test("clicking the toggle returns focus to the search input", async ({ page }) => {
  const { input, modal } = await openPalette(page);
  await modal.getByRole("checkbox", { name: "All workspaces" }).check();
  // Arrow keys and Enter are handled on the input, so a mouse toggle must not
  // strand focus on the checkbox.
  await expect(input).toBeFocused();
});

test("toggling by keyboard keeps focus on the checkbox", async ({ page }) => {
  const { modal } = await openPalette(page);
  const checkbox = modal.getByRole("checkbox", { name: "All workspaces" });

  // Tab across the filter chips to reach it, rather than focusing it
  // programmatically: the behaviour under test turns on how focus actually
  // arrived, so a synthetic `.focus()` would not exercise it.
  let reached = false;
  for (let i = 0; i < 12 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await checkbox.evaluate((el) => el === document.activeElement);
  }
  expect(reached, "never tabbed onto the All workspaces checkbox").toBe(true);

  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  // Someone who tabbed here meant to be here: yanking focus back to the input
  // would cost them a full re-tab before every toggle.
  await expect(checkbox).toBeFocused();
});
