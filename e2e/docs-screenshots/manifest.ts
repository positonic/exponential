import type { Page } from "@playwright/test";

/**
 * Every screenshot the docs use that can be taken from the dev-fixture
 * workspace. `npm run docs:screenshots` walks this list and writes
 * `public/doc-assets/<file>.png` (dark, what the pages embed) and
 * `<file>-light.png`. Hand-made images (the iOS shortcut, the Fireflies
 * diagram) are not listed and are never overwritten.
 *
 * `path` may contain `{ws}` (the fixture workspace slug) and `{product}`.
 * `prepare` runs after the page settles and before the capture, for screens
 * that need a click (a dialog, a tab, a filter).
 */
export interface DocShot {
  file: string;
  path: string;
  /** Extra settle time on top of network idle, for pages that stream in. */
  waitMs?: number;
  signedOut?: boolean;
  prepare?: (page: Page) => Promise<void>;
}

async function clickButton(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name }).first().click();
  await page.waitForTimeout(1_500);
}

async function openFirstLink(page: Page, hrefPart: RegExp) {
  const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  const href = hrefs.find((h) => hrefPart.test(h));
  if (!href) throw new Error(`docs:screenshots: no link matching ${hrefPart} on ${page.url()}`);
  await page.goto(href);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2_000);
}

export const DOC_SHOTS: DocShot[] = [
  // Get started
  { file: "signin", path: "/signin", signedOut: true },
  { file: "home", path: "/w/{ws}/home", waitMs: 6_000 },
  { file: "new-project", path: "/w/{ws}/projects", prepare: (p) => clickButton(p, "New project") },
  { file: "create-action", path: "/today", prepare: (p) => clickButton(p, "Create action") },
  // The floating button (ZoeDrawer's "Open Zoe"); headless ⌘J does not reach the app hotkey reliably.
  { file: "zoe-drawer", path: "/today", prepare: async (p) => { await p.getByRole("button", { name: "Open Zoe" }).click(); await p.waitForTimeout(2_500); } },
  { file: "command-palette", path: "/today", prepare: async (p) => { await p.keyboard.press("ControlOrMeta+k"); await p.waitForTimeout(1_500); } },
  // Plan
  { file: "goals", path: "/w/{ws}/goals" },
  { file: "okrs", path: "/w/{ws}/okrs" },
  { file: "wheel-of-life", path: "/wheel-of-life" },
  { file: "decisions", path: "/w/{ws}/decisions", waitMs: 6_000 },
  { file: "decision", path: "/w/{ws}/decisions", waitMs: 6_000, prepare: (p) => openFirstLink(p, /\/decisions\/d\//) },
  // Do
  { file: "inbox", path: "/inbox" },
  { file: "today", path: "/today" },
  { file: "time", path: "/time" },
  { file: "daily-plan", path: "/daily-plan" },
  { file: "actions", path: "/w/{ws}/actions" },
  { file: "projects", path: "/w/{ws}/projects" },
  { file: "pages", path: "/w/{ws}/pages", prepare: (p) => clickButton(p, /^Public/) },
  { file: "activity", path: "/w/{ws}/activity" },
  { file: "views", path: "/w/{ws}/views" },
  { file: "timeline", path: "/w/{ws}/timeline" },
  // Build
  { file: "product", path: "/w/{ws}/products/{product}" },
  { file: "product-tickets", path: "/w/{ws}/products/{product}/tickets" },
  // Ticket rows open on click rather than being links; FP-1 is always seeded.
  { file: "ticket", path: "/w/{ws}/products/{product}/tickets/1" },
  { file: "feature", path: "/w/{ws}/products/{product}/features" },
  { file: "product-cycles", path: "/w/{ws}/products/{product}/cycles" },
  { file: "product-settings", path: "/w/{ws}/products/{product}/settings" },
  { file: "product-insights", path: "/w/{ws}/products/{product}/insights" },
  { file: "retro-new", path: "/w/{ws}/products/{product}/retrospectives/new" },
  { file: "metrics", path: "/w/{ws}/metrics" },
  // Reflect
  { file: "journal", path: "/journal" },
  { file: "startup-routine", path: "/startup-routine" },
  { file: "wind-down", path: "/wind-down" },
  { file: "habits", path: "/habits" },
  { file: "weekly-plan", path: "/weekly-plan" },
  // Meet
  { file: "meetings", path: "/w/{ws}/meetings" },
  { file: "meeting-detail", path: "/w/{ws}/meetings", prepare: (p) => openFirstLink(p, /^\/recording\//) },
  { file: "calendar", path: "/calendar", waitMs: 6_000 },
  { file: "schedule-meeting", path: "/w/{ws}/meetings", prepare: (p) => clickButton(p, "Schedule meeting") },
  { file: "ceremonies-settings", path: "/w/{ws}/settings/ceremonies", waitMs: 6_000 },
  { file: "ceremony", path: "/w/{ws}/settings/ceremonies", waitMs: 6_000, prepare: (p) => openFirstLink(p, /\/ceremonies\/[^/]+$/) },
  { file: "occurrence", path: "/w/{ws}/settings/ceremonies", waitMs: 6_000, prepare: async (p) => { await openFirstLink(p, /\/ceremonies\/[^/]+$/); await openFirstLink(p, /\/ceremonies\/[^/]+\/[^/]+$/); } },
  // CRM
  { file: "crm", path: "/w/{ws}/crm" },
  { file: "crm-pipeline", path: "/w/{ws}/crm/pipeline", waitMs: 6_000 },
  { file: "crm-forms", path: "/w/{ws}/crm/forms" },
  { file: "crm-broadcasts", path: "/w/{ws}/crm/broadcasts" },
  // Collaborate
  { file: "workspaces", path: "/workspaces" },
  { file: "teams", path: "/teams" },
  { file: "notifications", path: "/settings/notifications" },
  { file: "workspace-settings", path: "/w/{ws}/settings", waitMs: 4_000 },
  { file: "ws-members", path: "/w/{ws}/settings", waitMs: 4_000, prepare: (p) => clickButton(p, /^Members/) },
  // Zoe & AI
  { file: "agent", path: "/w/{ws}/agent" },
  { file: "knowledge-base", path: "/w/{ws}/knowledge-base" },
  // Integrations, developers, reference
  { file: "integrations", path: "/settings/integrations" },
  { file: "google-access", path: "/google-access" },
  { file: "api-keys", path: "/settings/api-keys" },
  { file: "agents-settings", path: "/settings/agents" },
  { file: "your-settings", path: "/settings" },
  { file: "plugins", path: "/w/{ws}/settings/plugins" },
];
