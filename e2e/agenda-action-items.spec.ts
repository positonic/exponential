/**
 * Agenda items are records (ADR-0059, V9) on the seeded dev fixture: add an
 * Action with an owner from a section's add box, see it carry its owner and
 * live status, complete the Action elsewhere (directly in the database, as
 * the actions page would), and see the agenda line ticked as done on reload
 * with no regeneration.
 *
 * Runs authenticated via the storageState minted in global-setup. Needs the
 * `Action.occurrenceId` migration applied to the local database.
 */
import { test, expect } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;
const occurrenceUrl = `/w/${fixture.workspaceSlug}/ceremonies/${fixture.ceremonyId}/${fixture.occurrenceId}`;

let db: PrismaClient;
const createdActionIds: string[] = [];

test.beforeAll(async () => {
  loadDevEnvOrThrow();
  const { PrismaClient: Client } = await import("@prisma/client");
  db = new Client();
});

test.afterAll(async () => {
  // Leave the fixture as seeded: drop the Action and its agenda line.
  if (createdActionIds.length) {
    const occ = await db.ceremonyOccurrence.findUniqueOrThrow({ where: { id: fixture.occurrenceId }, select: { agenda: true } });
    const agenda = occ.agenda as { sections: Array<{ items: Array<{ refId: string }> }> } | null;
    if (agenda) {
      for (const section of agenda.sections) section.items = section.items.filter((i) => !createdActionIds.includes(i.refId));
      await db.ceremonyOccurrence.update({ where: { id: fixture.occurrenceId }, data: { agenda } });
    }
    await db.action.deleteMany({ where: { id: { in: createdActionIds } } });
  }
  await db.$disconnect();
});

test("an Action added from the agenda is ticked once it is completed elsewhere", async ({ page }) => {
  const title = `Respond to stakeholders ${Date.now()}`;
  await page.goto(occurrenceUrl);

  const view = page.getByTestId("agenda-view");
  if (!(await view.isVisible({ timeout: FIRST_PAINT_TIMEOUT }).catch(() => false))) {
    await page.getByTestId("generate-agenda").click();
  }
  await expect(view).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  const box = page.locator('[data-testid^="agenda-add-box-"]').first();
  await box.getByText("+ Action").click();
  await box.locator('[data-testid^="agenda-add-title-"]').fill(title);
  await box.getByText("Owner", { exact: true }).click();
  await page.getByRole("option", { name: /Dev Fixture/ }).first().click();
  await box.locator('[data-testid^="agenda-add-submit-"]').click();

  const line = page.locator('[data-testid^="agenda-item-"]', { hasText: title }).first();
  await expect(line).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(line.locator('[data-testid^="agenda-item-live-"]')).toContainText("Dev Fixture");
  await expect(line.locator('[data-testid^="agenda-item-state-"]')).toHaveText("open");

  const action = await db.action.findFirstOrThrow({ where: { name: title, occurrenceId: fixture.occurrenceId } });
  createdActionIds.push(action.id);
  expect(action.source).toBe("ceremony");

  // Completed elsewhere.
  await db.action.update({ where: { id: action.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  await page.reload();
  const after = page.locator('[data-testid^="agenda-item-"]', { hasText: title }).first();
  await expect(after.locator('[data-testid^="agenda-item-state-"]')).toHaveText("done", { timeout: FIRST_PAINT_TIMEOUT });
  await expect(after.locator('[data-testid^="agenda-item-resolve-"]')).toBeChecked();
});
