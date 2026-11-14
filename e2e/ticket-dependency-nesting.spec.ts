/**
 * The Backlog's "Nest dependencies" display toggle (table and list views) and
 * the Graph tab sharing the Backlog's facet filters.
 *
 * Seeded data: ticket FP-2 (IN_PROGRESS) depends on FP-3 (BACKLOG), so with
 * nesting on FP-3 sits one level under FP-2 and never as a root of its own.
 *
 * Both features persist through the fixture user's saved view prefs, which
 * every spec shares, so this file runs serially and puts the toggle and the
 * filters back the way it found them.
 */
import { test, expect, type Page } from "@playwright/test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { loadFixture } from "./fixture-data";

// Specs run in their own worker process, so env loading (and its
// production/managed-DB guards) has to happen here as well as in global-setup.
loadDevEnvOrThrow();

test.describe.configure({ mode: "serial" });

const fixture = loadFixture();
/** First hit on a `next dev` route pays the compile cost. */
const FIRST_PAINT_TIMEOUT = 60_000;
const productUrl = `/w/${fixture.workspaceSlug}/products/${fixture.productSlug}`;
/** The Backlog and Graph tabs share this prefs key (filters, nesting, view). */
const BACKLOG_PREFS_KEY = fixture.productSlug;

let db: PrismaClient;
let workspaceId: string;
let prefsBeforeRun: Record<string, unknown> = {};

/** The fixture user's product-plugin settings row, where view prefs live. */
const configKey = () => ({ pluginId: "product", workspaceId, userId: fixture.userId });

async function readSettings() {
  const config = await db.pluginConfig.findUnique({
    where: { pluginId_workspaceId_userId: configKey() },
    select: { settings: true },
  });
  const settings = (config?.settings ?? {}) as Record<string, unknown>;
  const viewPrefs = (settings.viewPrefs ?? {}) as Record<string, unknown>;
  return { settings, viewPrefs };
}

async function readSavedPrefs(key: string) {
  return ((await readSettings()).viewPrefs[key] ?? {}) as Record<string, unknown>;
}

/** Overwrite the fixture user's saved prefs for the given prefs keys. */
async function writeSavedPrefs(byKey: Record<string, unknown>) {
  const { settings, viewPrefs } = await readSettings();
  const next = { ...settings, viewPrefs: { ...viewPrefs, ...byKey } } as Prisma.InputJsonObject;
  await db.pluginConfig.upsert({
    where: { pluginId_workspaceId_userId: configKey() },
    create: { ...configKey(), settings: next },
    update: { settings: next },
  });
}

test.beforeAll(async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  db = new Client();
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { slug: fixture.workspaceSlug },
    select: { id: true },
  });
  workspaceId = workspace.id;
  prefsBeforeRun = { [BACKLOG_PREFS_KEY]: await readSavedPrefs(BACKLOG_PREFS_KEY) };
});

// Start each test from the table view, unfiltered, with nesting off: a filter
// or toggle left by another run would hide the very rows asserted on.
test.beforeEach(async () => {
  await writeSavedPrefs({ [BACKLOG_PREFS_KEY]: { view: "table", entity: "tickets" } });
});

test.afterAll(async () => {
  await writeSavedPrefs(prefsBeforeRun);
  await db.$disconnect();
});

const PARENT_TITLE = "Wire blocked indicator through ticket.list"; // FP-2, IN_PROGRESS
const CHILD_TITLE = "Empty state copy for ticketless features"; // FP-3, BACKLOG

/**
 * Attached to the report and kept on disk under e2e/.results for review.
 * The Backlog shots are viewport-only, scrolled to the nested rows: a full
 * page of a large fixture backlog is tens of thousands of pixels tall.
 */
async function attachScreenshot(page: Page, name: string, { fullPage = true } = {}) {
  const file = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage });
  await test.info().attach(name, { path: file, contentType: "image/png" });
}

async function openBacklog(page: Page) {
  await page.goto(`${productUrl}/tickets`);
  await expect(page.getByText(PARENT_TITLE).first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
}

/** Flip the Display popover's "Nest dependencies" switch to `on`. */
async function setNesting(page: Page, on: boolean) {
  await page.getByRole("button", { name: "Display settings" }).click();
  // Mantine hides the switch's native input behind its track, so flip it
  // with a native click rather than a pointer click on the hidden element.
  const toggle = page.getByRole("switch", { name: "Nest dependencies" });
  await expect(toggle).toBeAttached();
  if ((await toggle.isChecked()) !== on) {
    await toggle.evaluate((el) => (el as HTMLInputElement).click());
  }
  await expect(toggle).toHaveJSProperty("checked", on);
  await page.keyboard.press("Escape");
}

/** A rendered ticket row (table `tr` or list `div`) carrying its nesting depth. */
const rowAtDepth = (page: Page, title: string, depth: number) =>
  page.locator(`[data-depth="${depth}"]`, { hasText: title });

test("table and list views nest a ticket's dependencies beneath it", async ({ page }) => {
  await openBacklog(page);
  await page.getByRole("button", { name: "Table" }).click();
  await setNesting(page, true);

  // FP-3 renders only under FP-2, never as a root.
  await expect(rowAtDepth(page, PARENT_TITLE, 0)).toHaveCount(1);
  await expect(rowAtDepth(page, CHILD_TITLE, 1)).toHaveCount(1);
  await expect(rowAtDepth(page, CHILD_TITLE, 0)).toHaveCount(0);
  await rowAtDepth(page, PARENT_TITLE, 0).scrollIntoViewIfNeeded();
  await attachScreenshot(page, "backlog-table-nested", { fullPage: false });

  // Folding the parent hides its dependency; unfolding brings it back.
  const parentRow = rowAtDepth(page, PARENT_TITLE, 0);
  await parentRow.getByRole("button", { name: "Collapse dependencies" }).click();
  await expect(page.locator("[data-depth]", { hasText: CHILD_TITLE })).toHaveCount(0);
  await parentRow.getByRole("button", { name: "Expand dependencies" }).click();
  await expect(rowAtDepth(page, CHILD_TITLE, 1)).toHaveCount(1);

  // The list view nests the same way.
  await page.getByRole("button", { name: "List" }).click();
  await expect(rowAtDepth(page, PARENT_TITLE, 0)).toHaveCount(1);
  await expect(rowAtDepth(page, CHILD_TITLE, 1)).toHaveCount(1);
  await rowAtDepth(page, PARENT_TITLE, 0).scrollIntoViewIfNeeded();
  await attachScreenshot(page, "backlog-list-nested", { fullPage: false });

  // Off again: flat rows, no depth markers.
  await setNesting(page, false);
  await expect(page.locator("[data-depth]")).toHaveCount(0);
  await expect(page.getByText(CHILD_TITLE).first()).toBeVisible();
});

test("the graph applies the Backlog's filters and clears them for both tabs", async ({ page }) => {
  await openBacklog(page);

  // Filter the Backlog to status "Backlog". FP-2 (In progress) drops out.
  await page.getByRole("button", { name: "Filter tickets" }).click();
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await page.keyboard.press("Escape");
  const backlogPills = page.getByRole("list", { name: "Active filters" });
  await expect(backlogPills.getByText("Backlog", { exact: true })).toBeVisible();
  await expect(page.getByText(PARENT_TITLE)).toHaveCount(0);

  // The Graph tab shows the same pill and the same narrowing: FP-3 is drawn,
  // FP-2 (a dependent, not a blocker, and not Backlog) is not.
  await page.goto(`${productUrl}/graph`);
  const graphPills = page.getByRole("list", { name: "Active filters" });
  await expect(graphPills.getByText("Backlog", { exact: true })).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.getByText(CHILD_TITLE)).toBeVisible();
  await expect(page.getByText(PARENT_TITLE)).toHaveCount(0);
  await attachScreenshot(page, "graph-filtered-by-backlog-status");

  // Removing the pill on the graph widens it to every ticket...
  await graphPills.getByRole("button", { name: "Remove Backlog filter" }).click();
  await expect(page.getByText(PARENT_TITLE)).toBeVisible();
  await expect(page.getByRole("list", { name: "Active filters" })).toHaveCount(0);
  await attachScreenshot(page, "graph-unfiltered");

  // ...and the Backlog, reading the same saved filters, is unfiltered too.
  await openBacklog(page);
  await expect(page.getByRole("list", { name: "Active filters" })).toHaveCount(0);
});
