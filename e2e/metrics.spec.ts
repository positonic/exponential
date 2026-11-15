/**
 * Visual verification of the Metrics page's Delivery flow tier (ticket
 * macro.eel): throughput, cycle time and the completed-per-week chart, with
 * honest empty/insufficient states for a workspace that has no cycles and no
 * points. Since PR 988 the page leads with the selected cycle, then Delivery
 * flow, then Trends and People (see MetricsDashboard).
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

test("metrics page shows delivery flow above the per-cycle trends and people", async ({ page }) => {
  await page.goto(`/w/${fixture.workspaceSlug}/metrics`);
  await expect(page.getByText("Delivery flow", { exact: true })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await expect(page.getByText("Throughput", { exact: true })).toBeVisible();
  await expect(page.getByText("tickets / week")).toBeVisible();
  await expect(page.getByText("Cycle time", { exact: true })).toBeVisible();
  await expect(page.getByText("Completed per week")).toBeVisible();

  // The flow tier precedes the per-cycle tiers in document order. Both always
  // render, with or without cycles.
  const main = page.getByRole("main");
  const trends = main.getByText("Trends", { exact: true });
  const people = main.getByText("People", { exact: true });
  await expect(trends).toBeVisible();
  await expect(people).toBeVisible();
  const flowY = (await page.getByText("Delivery flow", { exact: true }).boundingBox())!.y;
  const trendsY = (await trends.boundingBox())!.y;
  const peopleY = (await people.boundingBox())!.y;
  expect(flowY).toBeLessThan(trendsY);
  expect(trendsY).toBeLessThan(peopleY);

  await attachScreenshot(page, "metrics-delivery-flow");
});
