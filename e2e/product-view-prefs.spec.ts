/**
 * Regression guard: a saved view pref must survive a client-side tab switch.
 *
 * The Backlog and Insights pages restore their view (filters, layout, sort...)
 * from the `product.product.getViewPrefs` query when they mount. Saving used
 * to reach the server only, so switching product tabs - which remounts the
 * page against the still-cached, pre-save prefs - silently undid the change
 * until a hard reload. The save now patches the query cache as well.
 *
 * Prefs are per user and every spec shares the fixture user, so this file
 * runs serially, starts each test from empty prefs, and puts back whatever
 * was saved before the run.
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
const BACKLOG_PREFS_KEY = fixture.productSlug;
const INSIGHTS_PREFS_KEY = `${fixture.productSlug}/insights`;

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

/** What the server holds for one prefs key - the value a hard reload restores. */
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
  prefsBeforeRun = {
    [BACKLOG_PREFS_KEY]: await readSavedPrefs(BACKLOG_PREFS_KEY),
    [INSIGHTS_PREFS_KEY]: await readSavedPrefs(INSIGHTS_PREFS_KEY),
  };
});

test.beforeEach(async () => {
  await writeSavedPrefs({ [BACKLOG_PREFS_KEY]: {}, [INSIGHTS_PREFS_KEY]: {} });
});

test.afterAll(async () => {
  await writeSavedPrefs(prefsBeforeRun);
  await db.$disconnect();
});

async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

/**
 * Waits for a (debounced) save to land in the database. Polled there rather
 * than on the network: the batch stream link aborts its own request once it
 * has read the result, so the response never reports as finished.
 */
async function expectSaved(key: string, read: (prefs: Record<string, unknown>) => unknown, expected: unknown) {
  await expect
    .poll(async () => read(await readSavedPrefs(key)), { timeout: FIRST_PAINT_TIMEOUT })
    .toEqual(expected);
}

/**
 * Leave for another product tab and come back, asserting it was a client-side
 * navigation - a full reload refetches the prefs and would pass regardless.
 */
async function switchTabAndBack(page: Page, home: { tab: string; path: string }) {
  await page.evaluate(() => {
    (window as Window & { __noReload?: boolean }).__noReload = true;
  });
  await page.getByRole("tab", { name: "Features", exact: true }).click();
  await expect(page).toHaveURL(/\/features$/, { timeout: FIRST_PAINT_TIMEOUT });
  await page.getByRole("tab", { name: home.tab, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${home.path}$`), { timeout: FIRST_PAINT_TIMEOUT });
  expect(
    await page.evaluate(() => (window as Window & { __noReload?: boolean }).__noReload),
    "the tab switch must be a client-side navigation",
  ).toBe(true);
}

const BACKLOG = { tab: "Backlog", path: "/tickets" };
/** A seeded ticket in status BACKLOG, so an "In progress" filter hides it. */
const backlogTicket = (page: Page) => page.getByText("Ticket row hover affordances");
const inProgressPill = (page: Page) =>
  page.getByRole("list", { name: "Active filters" }).getByRole("listitem").filter({ hasText: "In progress" });

async function openBacklog(page: Page) {
  await page.goto(`${productUrl}/tickets`);
  await expect(backlogTicket(page).first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
}

async function toggleInProgressFilter(page: Page) {
  await page.getByRole("button", { name: "Filter tickets" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "In progress", exact: true }).click();
}

async function expectInProgressFilterApplied(page: Page) {
  await expect(inProgressPill(page)).toBeVisible({ timeout: 15_000 });
  await expect(backlogTicket(page)).toHaveCount(0);
}

const expectStatusFilterSaved = () =>
  expectSaved(BACKLOG_PREFS_KEY, (prefs) => (prefs.filters as { status?: string[] } | undefined)?.status, ["IN_PROGRESS"]);

test("Backlog keeps a just-saved filter across a tab switch", async ({ page }) => {
  await openBacklog(page);

  await toggleInProgressFilter(page);
  await expectStatusFilterSaved();
  await page.keyboard.press("Escape");
  await expectInProgressFilterApplied(page);

  await switchTabAndBack(page, BACKLOG);

  await expectInProgressFilterApplied(page);
  await attachScreenshot(page, "backlog-filter-after-tab-switch");
});

test("Backlog keeps a filter when the tab switch lands inside the save debounce", async ({ page }) => {
  await openBacklog(page);

  // No wait between the toggle and the tab click: the pending save is flushed
  // by the debounce timer or the page's unmount, whichever comes first.
  await toggleInProgressFilter(page);
  await switchTabAndBack(page, BACKLOG);

  await expectInProgressFilterApplied(page);
  await expectStatusFilterSaved();
});

test("Backlog drops a filter whose save failed", async ({ page }) => {
  await openBacklog(page);
  const saveFailed = page.waitForEvent("requestfailed", (r) => r.url().includes("product.product.saveViewPrefs"));
  await page.route("**/api/trpc/product.product.saveViewPrefs**", (route) => route.abort());

  await toggleInProgressFilter(page);
  await saveFailed;
  await page.keyboard.press("Escape");
  await expect(inProgressPill(page)).toBeVisible();

  await switchTabAndBack(page, BACKLOG);

  // The server never got the filter, so the remounted page must not claim it.
  await expect(backlogTicket(page).first()).toBeVisible({ timeout: 15_000 });
  await expect(inProgressPill(page)).toHaveCount(0);
  expect((await readSavedPrefs(BACKLOG_PREFS_KEY)).filters).toBeUndefined();
});

test("Insights keeps a just-saved view across a tab switch", async ({ page }) => {
  // Insights renders before its prefs arrive, and the default view is the
  // list. Start from a saved board so the toggle flipping to it is the
  // visible signal that the prefs have loaded and the page can be driven.
  await writeSavedPrefs({ [INSIGHTS_PREFS_KEY]: { view: "board" } });
  // The view toggle is an icon-only segmented control: target its radios.
  const listRadio = page.locator('input[type="radio"][value="list"]');
  await page.goto(`${productUrl}/insights`);
  await expect(page.locator('input[type="radio"][value="board"]')).toBeChecked({ timeout: FIRST_PAINT_TIMEOUT });

  await page.locator('input[type="radio"][value="list"] + label').click();
  await expectSaved(INSIGHTS_PREFS_KEY, (prefs) => prefs.view, "list");
  await expect(listRadio).toBeChecked();

  await switchTabAndBack(page, { tab: "Insights", path: "/insights" });

  await expect(listRadio).toBeChecked();
  await attachScreenshot(page, "insights-view-after-tab-switch");
});
