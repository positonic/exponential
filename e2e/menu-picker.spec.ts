/**
 * The menu picker: the first screen of the Welcome flow, where a new person
 * says what they are here for and chooses what their sidebar shows.
 *
 * Runs as the fixture COLLEAGUE, never the main fixture user, so the sidebar
 * every other spec navigates by is left alone. The spec makes the colleague a
 * fresh invitee (welcome not completed, an accepted invitation, no saved
 * sidebar) and puts every row back in `afterAll`.
 *
 * Covers what unit tests cannot: the real sidebar following each choice, the
 * choice surviving a reload, keyboard-only use, measured text contrast in both
 * colour schemes, and the hand-off into the workspace.
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { Prisma as PrismaNamespace, PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";

const FIRST_PAINT_TIMEOUT = 90_000;
const COLLEAGUE_EMAIL = "fixture-colleague@exponential.test";
const OWNER_EMAIL = "dev-fixture@exponential.test";
const WORKSPACE_SLUG = "dev-fixture";

/** WCAG contrast of an element's text against what is actually painted behind it. */
async function contrast(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return -1;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // The canvas normalises any CSS colour (oklch, color-mix) to RGBA bytes.
    const rgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    };
    const over = (
      top: [number, number, number, number],
      under: [number, number, number],
    ): [number, number, number] => [
      top[0] * top[3] + under[0] * (1 - top[3]),
      top[1] * top[3] + under[1] * (1 - top[3]),
      top[2] * top[3] + under[2] * (1 - top[3]),
    ];
    const chain: Element[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) chain.unshift(n);
    let bg: [number, number, number] = [255, 255, 255];
    for (const n of chain) bg = over(rgba(getComputedStyle(n).backgroundColor), bg);
    const fg = over(rgba(getComputedStyle(el).color), bg);
    const lum = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  }, selector);
}

/** Every line of supporting text on the picker; all of it is small, so all of it needs 4.5:1. */
const SMALL_TEXT = [
  '[class*="MenuPicker"][class*="hint"]',
  '[class*="cardDesc"]',
  '[class*="cardStarts"]',
  '[class*="featureDesc"]',
  'label:not([class*="featureOn"]) > [class*="switchWord"]',
  '[class*="MenuPicker"][class*="status"]',
  '[class*="afterList"]',
  '[class*="footnote"]',
  '[class*="exploreLink"]',
];

test.describe("Menu picker", () => {
  // One person's sidebar is the thing under test: the steps build on each other.
  test.describe.configure({ mode: "serial" });

  let db: PrismaClient;
  let Prisma: typeof PrismaNamespace;
  let context: BrowserContext;
  let page: Page;
  let restore: () => Promise<void> = () => Promise.resolve();

  test.beforeAll(async ({ browser, baseURL }) => {
    loadDevEnvOrThrow();
    const prisma = await import("@prisma/client");
    const { mintSessionCookie } = await import("../scripts/dev-fixture/session");
    Prisma = prisma.Prisma;
    db = new prisma.PrismaClient();

    const colleague = await db.user.findUniqueOrThrow({ where: { email: COLLEAGUE_EMAIL } });
    const owner = await db.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
    const workspace = await db.workspace.findUniqueOrThrow({ where: { slug: WORKSPACE_SLUG } });
    const invitationKey = { workspaceId_email: { workspaceId: workspace.id, email: COLLEAGUE_EMAIL } };
    const [priorPreference, priorLayouts, priorInvitation] = await Promise.all([
      db.navigationPreference.findUnique({ where: { userId: colleague.id } }),
      db.workspaceNavLayout.findMany({ where: { userId: colleague.id } }),
      db.workspaceInvitation.findUnique({ where: invitationKey }),
    ]);

    const clearSidebar = async () => {
      await db.navigationPreference.deleteMany({ where: { userId: colleague.id } });
      await db.workspaceNavLayout.deleteMany({ where: { userId: colleague.id } });
    };

    restore = async () => {
      await db.user.update({
        where: { id: colleague.id },
        data: {
          welcomeCompletedAt: colleague.welcomeCompletedAt,
          welcomeSetupState: colleague.welcomeSetupState ?? Prisma.DbNull,
        },
      });
      await clearSidebar();
      if (priorPreference) {
        await db.navigationPreference.create({
          data: { ...priorPreference, navLayout: priorPreference.navLayout ?? Prisma.DbNull },
        });
      }
      for (const row of priorLayouts) {
        await db.workspaceNavLayout.create({ data: { ...row, navLayout: row.navLayout ?? [] } });
      }
      await db.workspaceInvitation.deleteMany({ where: { workspaceId: workspace.id, email: COLLEAGUE_EMAIL } });
      if (priorInvitation) await db.workspaceInvitation.create({ data: priorInvitation });
    };

    // A fresh invitee: welcome not done, an accepted invitation, no saved sidebar.
    await db.user.update({
      where: { id: colleague.id },
      data: { welcomeCompletedAt: null, welcomeSetupState: Prisma.DbNull },
    });
    await clearSidebar();
    await db.workspaceInvitation.upsert({
      where: invitationKey,
      update: { status: "accepted", acceptedAt: new Date() },
      create: {
        workspaceId: workspace.id,
        email: COLLEAGUE_EMAIL,
        token: "e2e-menu-picker-invitation",
        status: "accepted",
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdById: owner.id,
      },
    });

    const session = await mintSessionCookie(db, { email: COLLEAGUE_EMAIL });
    context = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 900 },
      storageState: {
        cookies: [
          {
            name: session.cookieName,
            value: session.cookieValue,
            domain: "localhost",
            path: "/",
            expires: Math.floor(session.expiresAt.getTime() / 1000),
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
          },
        ],
        origins: [],
      },
    });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
    try {
      await restore();
    } finally {
      await db?.$disconnect();
    }
  });

  const sidebar = () => page.locator("aside.app-sidebar nav");
  const sidebarLink = (name: string) => sidebar().getByRole("link", { name, exact: true });
  const saved = () => expect(page.getByRole("status")).toContainText("Saved", { timeout: FIRST_PAINT_TIMEOUT });

  async function openPicker() {
    await page.goto("/welcome");
    await expect(page.getByRole("switch", { name: "Goals" })).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  }

  test("an invitee lands on the picker with the short default menu", async () => {
    await openPicker();
    await expect(page.getByRole("heading", { level: 1, name: /^You've joined/ })).toBeVisible();
    // Calendar connect is no longer the first thing a new member is asked for.
    await expect(page.getByText("Connect your calendar")).toHaveCount(0);

    for (const name of ["Goals", "Decisions", "Projects", "Pages", "Meetings"]) {
      await expect(sidebarLink(name)).toBeVisible();
    }
    for (const name of ["Actions", "Shipped", "CRM", "Agents", "Knowledge"]) {
      await expect(sidebarLink(name)).toHaveCount(0);
      await expect(page.getByRole("switch", { name })).not.toBeChecked();
    }
    // No answer is required to carry on.
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Take me to/ })).toBeEnabled();
  });

  test("supporting text meets 4.5:1 in the dark and light schemes", async () => {
    for (const scheme of ["dark", "light"] as const) {
      await page.evaluate((s) => localStorage.setItem("mantine-color-scheme-value", s), scheme);
      await openPicker();
      for (const selector of SMALL_TEXT) {
        expect(await contrast(page, selector), `${scheme}: ${selector}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    await page.evaluate(() => localStorage.setItem("mantine-color-scheme-value", "dark"));
  });

  test("an answer sets the whole menu and the real sidebar follows", async () => {
    await openPicker();
    await page.getByText("My own to-do list", { exact: true }).click();
    await saved();

    await expect(page.getByRole("radio", { name: "My own to-do list" })).toBeChecked();
    await expect(sidebarLink("Actions")).toBeVisible();
    await expect(sidebarLink("Decisions")).toHaveCount(0);
    await expect(sidebarLink("Meetings")).toHaveCount(0);
  });

  test("a single switch adds one page, by clicking anywhere on its row", async () => {
    await page.getByText("The people and organisations you work with.", { exact: true }).click();
    await expect(page.getByRole("switch", { name: "CRM" })).toBeChecked();
    await expect(sidebarLink("CRM")).toBeVisible();
    await saved();
  });

  test("the whole picker works from the keyboard", async () => {
    await page.locator("h1").click();
    let onRadio = false;
    for (let i = 0; i < 40 && !onRadio; i++) {
      await page.keyboard.press("Tab");
      onRadio = await page.evaluate(
        () => (document.activeElement as HTMLInputElement | null)?.type === "radio",
      );
    }
    expect(onRadio).toBe(true);

    // Arrow keys move through the answers, as in any radio group.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Working with a team" })).toBeChecked();
    await expect(sidebarLink("Decisions")).toBeVisible();

    // The next stop is the first switch; Space flips it.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("switch", { name: "Goals" })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.getByRole("switch", { name: "Goals" })).not.toBeChecked();
    await expect(sidebarLink("Goals")).toHaveCount(0);
    await page.keyboard.press("Space");
    await expect(page.getByRole("switch", { name: "Goals" })).toBeChecked();
    await saved();
  });

  test("choices survive a reload", async () => {
    await page.reload();
    await expect(page.getByRole("switch", { name: "Goals" })).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await expect(page.getByRole("radio", { name: "Working with a team" })).toBeChecked();
    await expect(page.getByRole("switch", { name: "Actions" })).not.toBeChecked();
    await expect(sidebarLink("Decisions")).toBeVisible();
    await expect(sidebarLink("Actions")).toHaveCount(0);
  });

  test("More keeps every hidden page one click away and leads back to the picker", async () => {
    await sidebar().getByRole("button", { name: "More" }).click();
    for (const name of ["Actions", "Shipped", "CRM", "Agents", "Knowledge"]) {
      await expect(page.getByRole("menuitem", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("menuitem", { name: "Goals", exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Choose what's in my menu" })).toHaveAttribute(
      "href",
      "/welcome/menu",
    );
    await page.keyboard.press("Escape");
  });

  test("the picker fits a phone without sideways scrolling", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPicker();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
    // The way out sits on its own line, not on top of the heading.
    const exit = await page.getByRole("button", { name: "I'll explore on my own" }).boundingBox();
    const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(exit!.y + exit!.height).toBeLessThanOrEqual(heading!.y);
    // The way forward stays on screen while the list scrolls.
    await expect(page.getByRole("button", { name: /^Take me to/ })).toBeInViewport();
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("continuing lands in the workspace, and the picker stays reachable afterwards", async () => {
    await openPicker();
    await page.getByRole("button", { name: /^Take me to/ }).click();
    await page.waitForURL(`**/w/${WORKSPACE_SLUG}/home`, { timeout: FIRST_PAINT_TIMEOUT });
    await expect(sidebarLink("Decisions")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    // Welcome is complete, so /welcome would redirect; /welcome/menu does not.
    await sidebar().getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Choose what's in my menu" }).click();
    await page.waitForURL("**/welcome/menu", { timeout: FIRST_PAINT_TIMEOUT });
    await expect(page.getByRole("heading", { level: 1, name: "Set up your menu" })).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
    await expect(page.getByRole("radio", { name: "Working with a team" })).toBeChecked();
  });

  test("More opens the customiser without a right-click", async () => {
    await sidebar().getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Rearrange my menu" }).click();
    await expect(page.getByTestId("sidebar-customize-panel")).toBeVisible();
    await page.getByTestId("sidebar-customize-panel").getByRole("button", { name: "Done" }).click();
    await expect(sidebar().getByRole("button", { name: "More" })).toBeVisible();
  });
});
