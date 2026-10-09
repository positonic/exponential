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
import { test, expect, type Page } from "@playwright/test";

const TICKETS = "/w/dev-fixture/products/fixture/tickets";
const INSIGHTS = "/w/dev-fixture/products/fixture/insights";
const FIRST_PAINT = 60_000;

/**
 * Resolves a CSS colour value - usually a design token such as
 * `var(--color-brand-primary)` - to the computed form `toHaveCSS` compares
 * against. Read from the live page, so the expectations follow the tokens
 * instead of duplicating their values here.
 */
async function resolveColor(page: Page, value: string): Promise<string> {
  return page.evaluate((cssValue) => {
    const probe = document.createElement("div");
    probe.style.color = cssValue;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return computed;
  }, value);
}

async function token(page: Page, name: string): Promise<string> {
  // Read, validate and resolve in one evaluation. A token that is undefined -
  // or defined as something that isn't a colour - leaves the probe's `color`
  // declaration invalid, so the probe silently inherits body's colour and the
  // assertion compares against the wrong thing. Checking definedness alone
  // doesn't catch the second case, and splitting read from resolve lets the
  // page restyle between the two. Both are closed here.
  //
  // Resolving against `document.body` is sound because every --color-* token
  // is defined on `:root` / `[data-mantine-color-scheme]`, which body
  // inherits. The two narrower scopes that redefine them, `.auth-surface` and
  // `.dec-surface`, wrap pages this spec never visits - a test added inside
  // either must resolve against the element under assertion instead.
  const { raw, computed } = await page.evaluate((prop) => {
    const value = getComputedStyle(document.body).getPropertyValue(prop).trim();
    if (value === "" || !CSS.supports("color", value)) {
      return { raw: value, computed: null };
    }
    const probe = document.createElement("div");
    probe.style.color = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return { raw: value, computed: resolved };
  }, name);

  if (computed === null) {
    throw new Error(
      raw === ""
        ? `${name} is not defined on this page`
        : `${name} is "${raw}", which is not a colour`,
    );
  }
  return computed;
}

test("a Modal that overrides one style key keeps the themed surface", async ({
  page,
}) => {
  await page.goto("/settings/api-keys");
  await page
    .getByRole("button", { name: "Create API Key" })
    .click({ timeout: FIRST_PAINT });

  // This modal passes only `styles={{ header: { paddingTop: 24 } }}`. Before
  // the fix that one key discarded every themed token and the modal rendered
  // Mantine's stock dark grey.
  await expect(page.locator(".mantine-Modal-content")).toHaveCSS(
    "background-color",
    await token(page, "--color-bg-elevated"),
  );
  await expect(page.locator(".mantine-Modal-header")).toHaveCSS(
    "border-bottom-color",
    await token(page, "--color-border-primary"),
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
  await expect(content).toHaveCSS(
    "background-color",
    await token(page, "--color-bg-modal"),
  );
  await expect(page.locator(".mantine-Modal-body")).toHaveCSS(
    "background-color",
    await resolveColor(page, "transparent"),
  );
});

test("SegmentedControl keeps a themed indicator and an emphasised active label", async ({
  page,
}) => {
  await page.goto(INSIGHTS);
  const seg = page.locator(".mantine-SegmentedControl-root").first();
  await seg.waitFor({ timeout: FIRST_PAINT });

  // The list/board toggle overrides `root` only; the indicator used to fall
  // back to Mantine's stock grey.
  await expect(seg.locator(".mantine-SegmentedControl-indicator")).toHaveCSS(
    "background-color",
    await token(page, "--color-border-primary"),
  );
  // ...while the active label must stay --color-text-primary, which only works
  // because the base colour is a stylesheet rule rather than an inline style.
  await expect(
    page.locator(".mantine-SegmentedControl-label[data-active]").first(),
  ).toHaveCSS("color", await token(page, "--color-text-primary"));
});

test("the active tab is brand-coloured and inactive tabs are not", async ({
  page,
}) => {
  await page.goto(TICKETS);
  const tabs = page.locator(".mantine-Tabs-tab");
  await tabs.first().waitFor({ timeout: FIRST_PAINT });

  await expect(
    page.locator(".mantine-Tabs-tab[data-active]").first(),
  ).toHaveCSS("color", await token(page, "--color-brand-primary"));
  await expect(
    page.locator(".mantine-Tabs-tab:not([data-active])").first(),
  ).toHaveCSS("color", await token(page, "--color-text-secondary"));
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
  await expect(active.first()).toHaveCSS(
    "background-color",
    await token(page, "--color-brand-primary"),
  );
  await expect(active.first()).toHaveCSS(
    "color",
    await token(page, "--color-text-inverse"),
  );
});
