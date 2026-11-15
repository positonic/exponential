/**
 * Searching for a ticket by its fun short ID (snappy.thunder) finds it: in the
 * Cmd+K palette (search.global) and in the product Tickets list's search box,
 * which filters the loaded list on the client.
 *
 * The fixture product shows Linear-style ids, but one seeded ticket carries a
 * shortId (`fixture.shortIdTicket`), so the id is searched without being on
 * screen — the case the list's title-only filter used to miss.
 *
 * Runs serially: the list test clears the fixture user's saved Backlog view
 * (a leftover status filter would hide the row) and puts it back afterwards.
 */
import { test, expect, type Page } from "@playwright/test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { loadFixture } from "./fixture-data";

loadDevEnvOrThrow();

test.describe.configure({ mode: "serial" });

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;
const { shortId, title } = fixture.shortIdTicket;
/** The words typed back to front, upper-cased, padded: all tolerated. */
const typedShortId = `  ${shortId.split(".").reverse().join(" ").toUpperCase()} `;
const BACKLOG_PREFS_KEY = fixture.productSlug;

let db: PrismaClient;
let configKey: { pluginId: string; workspaceId: string; userId: string };
let savedBacklogPrefs: unknown;

async function setBacklogPrefs(value: unknown) {
  const config = await db.pluginConfig.findUnique({
    where: { pluginId_workspaceId_userId: configKey },
    select: { settings: true },
  });
  const settings = (config?.settings ?? {}) as Record<string, unknown>;
  const viewPrefs = (settings.viewPrefs ?? {}) as Record<string, unknown>;
  const next = {
    ...settings,
    viewPrefs: { ...viewPrefs, [BACKLOG_PREFS_KEY]: value ?? {} },
  } as Prisma.InputJsonObject;
  await db.pluginConfig.upsert({
    where: { pluginId_workspaceId_userId: configKey },
    create: { ...configKey, settings: next },
    update: { settings: next },
  });
  return viewPrefs[BACKLOG_PREFS_KEY];
}

test.beforeAll(async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  db = new Client();
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { slug: fixture.workspaceSlug },
    select: { id: true },
  });
  configKey = { pluginId: "product", workspaceId: workspace.id, userId: fixture.userId };
  savedBacklogPrefs = await setBacklogPrefs({});
});

test.afterAll(async () => {
  await setBacklogPrefs(savedBacklogPrefs);
  await db.$disconnect();
});

async function openPalette(page: Page) {
  // From Projects rather than home: home's own search box steals focus on
  // hydration (see command-palette.spec.ts).
  await page.goto(`/w/${fixture.workspaceSlug}/projects`);
  await page.waitForLoadState("networkidle", { timeout: FIRST_PAINT_TIMEOUT });
  await page.keyboard.press("Meta+k");
  const modal = page.locator(".mantine-Modal-content");
  const input = modal.getByPlaceholder("Search, command, or ask Zoe");
  await expect(input).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  return { input, modal };
}

test("the command palette finds a ticket by its short ID", async ({ page }) => {
  const { input, modal } = await openPalette(page);
  await input.fill(typedShortId);

  const row = modal.locator("[data-palette-index]").filter({ hasText: title });
  await expect(row).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(row).toContainText(shortId);

  await page.screenshot({ path: test.info().outputPath("palette-short-id.png") });
});

test("the Tickets list search box finds a ticket by its short ID", async ({ page }) => {
  await page.goto(`/w/${fixture.workspaceSlug}/products/${fixture.productSlug}/tickets`);
  const search = page.getByPlaceholder("Search  ⌘F");
  await expect(search).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  await search.fill(shortId.toUpperCase());
  await expect(page.getByText(title).first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  // Every other fixture ticket is filtered out.
  await expect(page.getByText("Ticket row hover affordances")).toHaveCount(0);

  await page.screenshot({ path: test.info().outputPath("tickets-list-short-id.png") });
});
