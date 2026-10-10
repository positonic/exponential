/**
 * Visual verification of the Metrics page headline (ticket macro.eel): the
 * Delivery flow tier - throughput, cycle time and the completed-per-week
 * chart - renders above the cycle tiers, with honest empty/insufficient
 * states for a workspace that has no cycles and no points.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;

async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test("metrics page headlines delivery flow, then the cycle tiers", async ({ page }) => {
  await page.goto(`/w/${fixture.workspaceSlug}/metrics`);
  await expect(page.getByText("Delivery flow", { exact: true })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await expect(page.getByText("Throughput", { exact: true })).toBeVisible();
  await expect(page.getByText("tickets / week")).toBeVisible();
  await expect(page.getByText("Cycle time", { exact: true })).toBeVisible();
  await expect(page.getByText("Completed per week")).toBeVisible();

  // The flow tier precedes the cycle tiers in document order.
  const flowY = (await page.getByText("Delivery flow", { exact: true }).boundingBox())?.y ?? 0;
  const cycleY = (await page.getByText("Cycle breakdown", { exact: true }).boundingBox())?.y ?? 0;
  expect(flowY).toBeLessThan(cycleY);

  await attachScreenshot(page, "metrics-delivery-flow");
});
