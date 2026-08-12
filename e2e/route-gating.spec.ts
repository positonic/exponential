/**
 * Middleware route gating (ticket foggy.carp).
 *
 * The middleware is default-deny: every page requires a session except the
 * enumerated public surfaces. These specs pin the two behaviours that rotted
 * under the old protected-prefix allowlist — a logged-out visitor on a
 * workspace URL must be redirected to /signin (not left on a broken shell),
 * and genuinely public routes must keep rendering logged-out — so the next
 * route addition cannot silently regress either.
 */

import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

test.describe("logged out", () => {
  // Every other spec runs with the seeded storageState; these must not.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a workspace URL redirects to /signin with a callbackUrl back to it", async ({
    page,
  }) => {
    const target = `/w/${fixture.workspaceSlug}/projects`;
    await page.goto(target);

    await page.waitForURL((url) => url.pathname === "/signin");
    const callbackUrl = new URL(page.url()).searchParams.get("callbackUrl");
    expect(callbackUrl).toBe(target);

    // The point of the bug: the visitor gets the sign-in page, not a broken
    // app shell full of failing queries.
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
  });

  test("a workspace URL keeps its query string through the redirect", async ({
    page,
  }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/projects?tab=tasks`);
    await page.waitForURL((url) => url.pathname === "/signin");
    expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe(
      `/w/${fixture.workspaceSlug}/projects?tab=tasks`,
    );
  });

  test("an arbitrary unknown path is gated too (default-deny)", async ({
    page,
  }) => {
    await page.goto("/definitely-not-a-public-route");
    await page.waitForURL((url) => url.pathname === "/signin");
  });

  for (const path of ["/", "/signin", "/auth/verify-request", "/privacy"]) {
    test(`public route ${path} renders logged out`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      expect(new URL(page.url()).pathname).toBe(path);
    });
  }
});

test("a signed-in member still reaches their workspace", async ({ page }) => {
  await page.goto(`/w/${fixture.workspaceSlug}/projects`);
  await expect(page).toHaveURL(new RegExp(`/w/${fixture.workspaceSlug}/projects`));
});
