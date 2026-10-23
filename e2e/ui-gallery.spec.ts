/**
 * Visual regression target for the design system: /dev/ui renders every
 * shape token and every primitive variant. The assertions pin the wiring
 * (ADR-0073): the tokens resolve on :root, Tailwind, Mantine and the
 * primitives read the same numbers, and no variant has silently lost its
 * radius. Light and dark screenshots are attached for human review (see
 * dev-docs/AGENT_VISUAL_TESTING.md).
 */
import { test, expect, type Page } from "@playwright/test";

const FIRST_PAINT_TIMEOUT = 60_000;

const EXPECTED_RADIUS: Record<string, string> = {
  xs: "2px",
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
  "2xl": "16px",
  full: "9999px",
};

async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

async function radiusOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => getComputedStyle(el).borderRadius);
}

test("shape tokens resolve and every layer reads the same scale", async ({ page }) => {
  await page.goto("/dev/ui");
  await expect(page.getByTestId("ui-gallery")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  for (const [step, px] of Object.entries(EXPECTED_RADIUS)) {
    expect(await radiusOf(page, `[data-token="radius-${step}"]`), `--radius-${step}`).toBe(px);
  }

  const layers = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement("div");
    probe.className = "rounded-md";
    document.body.appendChild(probe);
    const out = {
      rootMd: root.getPropertyValue("--radius-md").trim(),
      mantineMd: root.getPropertyValue("--mantine-radius-md").trim(),
      mantineXl: root.getPropertyValue("--mantine-radius-xl").trim(),
      tailwindMd: getComputedStyle(probe).borderRadius,
    };
    probe.remove();
    return out;
  });
  expect(layers.rootMd).toBe("6px");
  expect(layers.mantineMd).toBe("6px");
  expect(layers.tailwindMd).toBe("6px");
  expect(layers.mantineXl).toBe("9999px");

  for (const s of ["sm", "md", "lg", "xl"]) {
    const shadow = await page
      .locator(`[data-token="shadow-${s}"]`)
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow, `--shadow-${s}`).not.toBe("none");
  }
});

test("Panel variants keep their radius and surface", async ({ page }) => {
  await page.goto("/dev/ui");
  await expect(page.getByTestId("ui-gallery")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  expect(await radiusOf(page, '[data-testid="panel-default"]')).toBe("8px");
  expect(await radiusOf(page, '[data-testid="panel-plain"]')).toBe("8px");
  expect(await radiusOf(page, '[data-testid="panel-muted"]')).toBe("8px");
  expect(
    await page.getByTestId("panel-plain").evaluate((el) => getComputedStyle(el).borderTopWidth),
  ).toBe("0px");
  expect(await radiusOf(page, '[data-testid="panel-elevated"]')).toBe("8px");
  expect(await radiusOf(page, '[data-testid="panel-md"]')).toBe("6px");
  expect(await radiusOf(page, '[data-testid="panel-xl"]')).toBe("12px");

  const elevatedShadow = await page
    .getByTestId("panel-elevated")
    .evaluate((el) => getComputedStyle(el).boxShadow);
  expect(elevatedShadow).not.toBe("none");

  const interactive = page.getByTestId("panel-interactive");
  await expect(interactive).toHaveAttribute("type", "button");
  const borderBefore = await interactive.evaluate((el) => getComputedStyle(el).borderColor);
  await interactive.hover();
  await expect
    .poll(() => interactive.evaluate((el) => getComputedStyle(el).borderColor))
    .not.toBe(borderBefore);
});

test("gallery renders in light and dark", async ({ page }) => {
  await page.goto("/dev/ui");
  await expect(page.getByTestId("ui-gallery")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await page.evaluate(() => document.documentElement.setAttribute("data-mantine-color-scheme", "light"));
  await page.waitForTimeout(300);
  await attachScreenshot(page, "ui-gallery-light");
  await page.evaluate(() => document.documentElement.setAttribute("data-mantine-color-scheme", "dark"));
  await page.waitForTimeout(300);
  await attachScreenshot(page, "ui-gallery-dark");
});
