/**
 * Visual verification of the feature Tickets accordion (PR 464) on both
 * surfaces: the feature detail page and the peek drawer. Runs authenticated
 * via the storageState minted in global-setup, against the seeded dev-fixture
 * data (5 feature tickets + 1 scope-only ticket that must stay hidden).
 *
 * Assertions are functional (rows, badges, exclusions); a full-page screenshot
 * is attached to every test for human review rather than pixel-diffed - see
 * dev-docs/AGENT_VISUAL_TESTING.md for the reasoning.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

/**
 * First hit on a `next dev` route pays the compile + client fetch cost, which
 * routinely exceeds the default 5s expect timeout. Anchor each test on content
 * with one generous wait, then assert normally.
 */
const FIRST_PAINT_TIMEOUT = 60_000;

test("feature detail page renders the Tickets accordion with the seeded tickets", async ({ page }) => {
  await page.goto(fixture.featureUrl);
  await expect(page.getByText("Tickets accordion fixture").first()).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await expect(page.getByRole("button", { name: `Tickets ${fixture.featureTicketCount}` })).toBeVisible();

  // Every feature-linked ticket renders as a row linking to its ticket page,
  // carrying its ID and status badge inside the row.
  for (const [id, title, status] of [
    ["FP-1", "Render ticket rows in the accordion", "Done"],
    ["FP-2", "Wire blocked indicator through ticket.list", "In progress"],
    ["FP-3", "Empty state copy for ticketless features", "Backlog"],
    ["FP-4", "Peek drawer keyboard navigation", "QA"],
    ["FP-5", "Ticket row hover affordances", "Backlog"],
  ] as const) {
    const row = page.locator(`a[href*="/products/${fixture.productSlug}/tickets/"]`, { hasText: title });
    await expect(row, `"${title}" should render as a ticket link`).toBeVisible();
    await expect(row.getByText(id), `row should show display ID ${id}`).toBeVisible();
    await expect(row.getByText(status, { exact: true }), `${id} should show status "${status}"`).toBeVisible();
  }

  // The scope-only ticket is excluded by design (accordion scopes by
  // featureId, matching feature._count.tickets). Assert "no ticket LINK with
  // that title" - plain getByText would also match the scope's description,
  // which mentions it.
  await expect(page.locator("a", { hasText: "Scope-only ticket" })).toHaveCount(0);

  await attachScreenshot(page, "feature-detail-tickets-accordion");
});

test("feature peek drawer renders the same Tickets accordion", async ({ page }) => {
  await page.goto(fixture.peekUrl);
  await expect(page.getByText("Tickets accordion fixture").first()).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await expect(page.getByRole("button", { name: `Tickets ${fixture.featureTicketCount}` })).toBeVisible();
  await expect(
    page.locator("a", { hasText: "Wire blocked indicator through ticket.list" }),
  ).toBeVisible();
  await expect(page.locator("a", { hasText: "Scope-only ticket" })).toHaveCount(0);

  await attachScreenshot(page, "feature-peek-tickets-accordion");
});
