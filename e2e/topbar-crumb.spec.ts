import { test, expect } from "@playwright/test";

const FIRST_PAINT_TIMEOUT = 60_000;

/**
 * Collapsed, the sidebar's re-open button is fixed in the top-left corner and
 * the workspace crumb starts in that same gutter. With the topbar's default
 * 40px padding the two overlapped (the folder icon began 4px *inside* the
 * button's box); the crumb has to give it room.
 */
test("collapsed sidebar: the crumb clears the re-open button", async ({ page }) => {
  await page.goto("/w/dev-fixture/projects");
  await expect(page.getByText("Dev Fixture").first()).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await page.getByLabel("Collapse menu").click();
  const toggle = page.getByLabel("Open sidebar");
  await toggle.waitFor();
  // The crumb slides across on the same 300ms transition as the collapse.
  await page.waitForTimeout(600);

  // The crumb's leading folder icon is the left-most thing in the topbar.
  const toggleBox = await toggle.boundingBox();
  const crumbBox = await page.locator("svg.tabler-icon-folder").first().boundingBox();
  expect(toggleBox).not.toBeNull();
  expect(crumbBox).not.toBeNull();
  expect(crumbBox!.x).toBeGreaterThanOrEqual(toggleBox!.x + toggleBox!.width);

  await test.info().attach("collapsed-topbar", {
    body: await page.screenshot({ clip: { x: 0, y: 0, width: 640, height: 120 } }),
    contentType: "image/png",
  });
});
