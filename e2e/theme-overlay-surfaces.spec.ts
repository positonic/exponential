/**
 * Guards the theme's overlay surfaces against the `defaultProps.styles` merge
 * bug (PR 643 for inputs, and its overlay-family follow-up).
 *
 * Mantine merges `theme.components[X].defaultProps` with a shallow spread, so a
 * call site passing any `styles` prop used to replace the theme's object
 * wholesale and fall back to Mantine's stock dark surfaces - warm grey against
 * this app's navy. Root-level `theme.components[X].styles` merges per selector
 * key underneath the call site's, so both survive.
 *
 * The inverse failure is just as easy to reintroduce: a colour that has to
 * differ per state (an active tab, an active segment) must NOT be an inline
 * theme style, because inline beats the `[data-active]` rules in globals.css.
 *
 * See the comment block at the top of src/styles/mantineTheme.ts.
 */
import { test, expect } from "@playwright/test";

const TICKETS = "/w/dev-fixture/products/fixture/tickets";
const INSIGHTS = "/w/dev-fixture/products/fixture/insights";
const FIRST_PAINT = 60_000;

const NAVY_ELEVATED = "rgb(15, 23, 40)"; // --color-bg-elevated
const BORDER_PRIMARY = "rgb(26, 38, 62)"; // --color-border-primary
const BRAND = "rgb(31, 93, 224)"; // --color-brand-primary
const MODAL = "rgb(13, 20, 36)"; // --color-bg-modal

test("a Modal that overrides one style key keeps the themed surface", async ({
  page,
}) => {
  await page.goto("/settings/api-keys");
  await page
    .getByRole("button", { name: "Create API Key" })
    .click({ timeout: FIRST_PAINT });

  // This modal passes only `styles={{ header: { paddingTop: 24 } }}`. Before
  // the fix that one key discarded every themed token and the modal rendered
  // Mantine's stock rgb(36, 36, 36).
  await expect(page.locator(".mantine-Modal-content")).toHaveCSS(
    "background-color",
    NAVY_ELEVATED,
  );
  await expect(page.locator(".mantine-Modal-header")).toHaveCSS(
    "border-bottom-color",
    BORDER_PRIMARY,
  );
});

test("CommandPalette keeps its own darker content surface", async ({ page }) => {
  await page.goto(TICKETS);
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Meta+k");
  const content = page.locator(".mantine-Modal-content");
  await content.waitFor({ timeout: FIRST_PAINT });

  // The theme deliberately carries no `body` background: body sits inside
  // content, so painting it would cover this --color-bg-modal surface.
  await expect(content).toHaveCSS("background-color", MODAL);
  await expect(page.locator(".mantine-Modal-body")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
});

test("SegmentedControl keeps a themed indicator and an emphasised active label", async ({
  page,
}) => {
  await page.goto(INSIGHTS);
  const seg = page.locator(".mantine-SegmentedControl-root").first();
  await seg.waitFor({ timeout: FIRST_PAINT });

  // The list/board toggle overrides `root` only; the indicator used to fall
  // back to Mantine's rgb(59, 59, 59).
  await expect(seg.locator(".mantine-SegmentedControl-indicator")).toHaveCSS(
    "background-color",
    BORDER_PRIMARY,
  );
  // ...while the active label must stay --color-text-primary, which only works
  // because the base colour is a stylesheet rule rather than an inline style.
  await expect(
    page.locator(".mantine-SegmentedControl-label[data-active]").first(),
  ).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("the active tab is brand-coloured and inactive tabs are not", async ({
  page,
}) => {
  await page.goto(TICKETS);
  const tabs = page.locator(".mantine-Tabs-tab");
  await tabs.first().waitFor({ timeout: FIRST_PAINT });

  await expect(
    page.locator(".mantine-Tabs-tab[data-active]").first(),
  ).toHaveCSS("color", BRAND);
  await expect(
    page.locator(".mantine-Tabs-tab:not([data-active])").first(),
  ).toHaveCSS("color", "rgb(193, 194, 197)"); // --color-text-secondary
});

test("the pills-variant active tab keeps its inverse-on-brand label", async ({
  page,
}) => {
  // ViewSwitcher used to pass `styles={{}}` purely to discard the theme's
  // inline tab colour, which would otherwise have beaten this rule. The theme
  // no longer sets one, so the empty object is gone and the pill still reads
  // --color-text-inverse on --color-brand-primary.
  await page.goto("/w/dev-fixture/actions");
  const active = page.locator('.mantine-Tabs-tab[data-variant="pills"][data-active]');
  await active.first().waitFor({ timeout: FIRST_PAINT });
  await expect(active.first()).toHaveCSS("background-color", BRAND);
});
