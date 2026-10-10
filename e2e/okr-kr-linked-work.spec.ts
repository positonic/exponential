/**
 * Visual verification of the KR "executing work" accordion on the OKRs tab.
 * The seeded fixture KR carries BOTH a linked Project and a linked Feature
 * (ADR-0050), so this spec pins the regression it was written for: features
 * were saved by the Edit Key Result modal but never rendered under the KR.
 *
 * A full-page screenshot is attached for human review — see
 * dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";
import { FIXTURE } from "../scripts/dev-fixture/seed";

const fixture = loadFixture();

const FIRST_PAINT_TIMEOUT = 60_000;

async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test("KR accordion lists linked projects and linked features with type pills", async ({
  page,
}) => {
  await page.goto(fixture.okrUrl);

  const kr = page.getByText(FIXTURE.keyResultTitle).first();
  await expect(kr).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  // The objective card auto-expands; expand the KR row to reveal its work.
  await kr.click();

  const projectRow = page.getByRole("link", {
    name: new RegExp(FIXTURE.projectName),
  });
  const featureRow = page.getByRole("link", {
    name: new RegExp(FIXTURE.featureName),
  });

  await expect(projectRow).toBeVisible();
  await expect(featureRow).toBeVisible();

  // Each row is tagged with its kind, so the two edges stay distinguishable.
  await expect(projectRow).toContainText("Project");
  await expect(featureRow).toContainText("Feature");

  // The feature row deep-links into the products area and carries its
  // ticket-delivery signal (5 feature-linked tickets, 1 DONE).
  await expect(featureRow).toHaveAttribute(
    "href",
    `/w/${fixture.workspaceSlug}/products/${fixture.productSlug}/features/${fixture.featureId}`,
  );
  await expect(featureRow).toContainText(`/${fixture.featureTicketCount} tickets`);

  await attachScreenshot(page, "kr-linked-work.png");
});
