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
 * The computed form of `transparent`. Fixed by CSS rather than by the theme,
 * so it is safe as a literal - the assertion it serves is "nothing painted
 * here", not "this particular token's value".
 */
const TRANSPARENT = "rgba(0, 0, 0, 0)";

/**
 * Resolves a --color-* design token to the computed form `toHaveCSS` compares
 * against, read from the live page so expectations follow the tokens instead
 * of duplicating their values here.
 *
 * Reads, validates and resolves in one evaluation. A token that is undefined,
 * that holds something which isn't a colour, or that holds a context-dependent
 * keyword leaves the probe's `color` declaration resolving against its parent -
 * so the probe silently takes body's colour and the assertion compares against
 * the wrong thing. That silent-inherit failure is the whole reason this helper
 * exists, so each case throws instead. Doing it in one round trip also stops a
 * restyle between read and resolve producing a mismatched expectation.
 *
 * Resolving against `document.body` is sound because every --color-* token is
 * defined on `:root` / `[data-mantine-color-scheme]`, which body inherits. The
 * two narrower scopes that redefine them, `.auth-surface` and `.dec-surface`,
 * wrap pages this spec never visits - a test added inside either must resolve
 * against the element under assertion instead.
 */
async function token(page: Page, name: string): Promise<string> {
  const { raw, reason, computed } = await page.evaluate((prop) => {
    const value = getComputedStyle(document.body).getPropertyValue(prop).trim();
    if (value === "") {
      return { raw: value, reason: "undefined", computed: null };
    }
    // CSS.supports accepts these, but they resolve against whatever element
    // they land on, which is exactly the silent inheritance we are guarding.
    if (/^(inherit|initial|unset|revert|revert-layer|currentcolor)$/i.test(value)) {
      return { raw: value, reason: "contextual", computed: null };
    }
    if (!CSS.supports("color", value)) {
      return { raw: value, reason: "not-a-colour", computed: null };
    }
    const probe = document.createElement("div");
    probe.style.color = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return { raw: value, reason: null, computed: resolved };
  }, name);

  if (computed === null) {
    const detail =
      reason === "undefined"
        ? "is not defined on this page"
        : reason === "contextual"
          ? `is "${raw}", which resolves against whatever element it is used on`
          : `is "${raw}", which is not a colour`;
    throw new Error(`${name} ${detail}`);
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
    TRANSPARENT,
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
