/**
 * Sign-in codes end to end, over the real HTTP surface (ADR-0056).
 *
 * The interesting failures in this feature are integration failures - does the
 * typed code actually redeem against Auth.js's callback, and does redeeming it
 * still run the `events.createUser` bootstrap - so the test seeds a
 * `VerificationToken` exactly the way Auth.js hashes one and then drives the
 * browser the rest of the way. `src/lib/__tests__/signInCode.test.ts` covers
 * the pure functions; nothing here re-tests those.
 *
 * Deliberately unauthenticated: every other spec runs with the storageState
 * minted in global-setup, and this one is about not having a session yet.
 *
 * No test here triggers a real send: two seed the token directly, and the one
 * that submits /signin intercepts the request in the browser. A dev machine
 * usually does have a working Postmark key, and mailing synthetic addresses
 * from a test run earns real bounces.
 */
import { test, expect, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { FIXTURE } from "../scripts/dev-fixture/seed";
import { SESSION_COOKIE_NAME } from "../scripts/dev-fixture/session";
import {
  formatSignInCode,
  generateSignInCode,
  SIGN_IN_CALLBACK_KEY,
  SIGN_IN_EMAIL_KEY,
} from "../src/lib/signInCode";

// Specs run in their own worker process, so env loading (and its
// production/managed-DB guards) has to happen here as well as in global-setup.
loadDevEnvOrThrow();

test.use({ storageState: { cookies: [], origins: [] } });

/** First hit on a `next dev` route pays the compile cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

let db: PrismaClient;
const createdEmails: string[] = [];

test.beforeAll(async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  db = new Client();
});

test.afterAll(async () => {
  // Each test signs a brand-new address up, so clean the users (and the
  // Personal workspaces cascading off them) back out.
  for (const email of createdEmails) {
    try {
      await db.verificationToken.deleteMany({ where: { identifier: email } });
      await db.workspaceInvitation.deleteMany({ where: { email } });
      const user = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (user) {
        await db.workspaceUser.deleteMany({ where: { userId: user.id } });
        await db.workspace.deleteMany({ where: { ownerId: user.id, type: "personal" } });
        await db.user.delete({ where: { id: user.id } });
      }
    } catch (error) {
      // Best effort: a leftover fixture row is noise, not a test failure.
      console.warn(`[sign-in-code] could not clean up ${email}:`, error);
    }
  }
  await db.$disconnect();
});

function freshEmail(label: string): string {
  const email = `signin-code-${label}-${Date.now()}@exponential.test`;
  createdEmails.push(email);
  return email;
}

/**
 * Store a code the way Auth.js's `sendToken` would have: the row holds
 * `sha256(token + secret)` and never the code itself, so the test has to hash
 * it the same way to plant a redeemable one.
 */
async function seedSignInCode(email: string): Promise<string> {
  const code = generateSignInCode();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${code}${process.env.AUTH_SECRET}`),
  );
  const token = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await db.verificationToken.create({
    data: { identifier: email, token, expires: new Date(Date.now() + 10 * 60 * 1000) },
  });
  return code;
}

/** Replay what /signin puts in sessionStorage before sending someone here. */
async function handOffIdentifier(page: Page, email: string, callbackUrl: string) {
  await page.addInitScript(
    ([emailKey, callbackKey, emailValue, callbackValue]) => {
      window.sessionStorage.setItem(emailKey, emailValue);
      window.sessionStorage.setItem(callbackKey, callbackValue);
    },
    [SIGN_IN_EMAIL_KEY, SIGN_IN_CALLBACK_KEY, email, callbackUrl] as const,
  );
}

test("a typed code signs a brand-new user in and bootstraps their account", async ({ page, context }) => {
  const email = freshEmail("new-user");

  // A pending invitation to the fixture workspace, so the assertion covers the
  // whole `events.createUser` bootstrap and not just the Personal workspace.
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { slug: FIXTURE.workspaceSlug },
    select: { id: true },
  });
  const fixtureUser = await db.user.findUniqueOrThrow({
    where: { email: FIXTURE.userEmail },
    select: { id: true },
  });
  await db.workspaceInvitation.create({
    data: {
      workspaceId: workspace.id,
      email,
      role: "member",
      token: `e2e-signin-code-${Date.now()}`,
      createdById: fixtureUser.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const code = await seedSignInCode(email);
  await handOffIdentifier(page, email, "/home");

  await page.goto("/auth/verify-request");
  await expect(page.getByText("Check your email")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  // The identifier came through sessionStorage, so only the code is asked for.
  await expect(page.getByLabel("Email address")).toHaveCount(0);

  // Typed the way a person would read it off the email and get it slightly
  // wrong: lower case, with the display hyphen we render but don't require.
  await page.getByLabel("Sign-in code").fill(formatSignInCode(code).toLowerCase());
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/auth/verify-request"), {
    timeout: FIRST_PAINT_TIMEOUT,
  });

  const sessionCookie = (await context.cookies()).find((c) => c.name === SESSION_COOKIE_NAME);
  expect(sessionCookie?.value, "redeeming a code should set a session cookie").toBeTruthy();

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });
  expect(user, "redeeming a code should create the user").not.toBeNull();
  expect(user!.emailVerified, "the adapter should mark the address verified").not.toBeNull();

  const memberships = await db.workspaceUser.findMany({
    where: { userId: user!.id },
    select: { role: true, workspace: { select: { slug: true, type: true } } },
  });
  expect(
    memberships.some((m) => m.workspace.type === "personal" && m.role === "owner"),
    "sign-in should bootstrap a Personal workspace",
  ).toBe(true);
  expect(
    memberships.some((m) => m.workspace.slug === FIXTURE.workspaceSlug),
    "sign-in should accept the pending invitation",
  ).toBe(true);

  // Single-use: the adapter deletes the row on redemption.
  expect(await db.verificationToken.count({ where: { identifier: email } })).toBe(0);
});

test("a fresh tab asks for the address, and a wrong code says so", async ({ page }) => {
  const email = freshEmail("wrong-code");
  await seedSignInCode(email);

  // No sessionStorage: the code was requested in another tab or browser, so
  // the form has to ask for the address it should redeem against.
  await page.goto("/auth/verify-request");
  const emailField = page.getByLabel("Email address");
  await expect(emailField).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  await emailField.fill(email);
  await page.getByLabel("Sign-in code").fill("ZZZZZZZZ");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL(/\/signin/, { timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.locator(".auth-error")).toContainText("incorrect, has expired, or has already been used");

  expect(
    await db.user.count({ where: { email } }),
    "a wrong code must not create the account",
  ).toBe(0);
});

test("/signin hands the identifier over out of band and owns a failed send", async ({ page }) => {
  const email = freshEmail("send-failure");

  // Fail the send at the browser seam rather than by leaving Postmark
  // unconfigured. A dev machine usually HAS a Postmark key, so submitting for
  // real would both pass or fail depending on the environment and mail a
  // synthetic address. The shape here is what Auth.js's client actually
  // returns when `sendVerificationRequest` throws: a redirect URL carrying
  // ?error=, which `signIn(..., { redirect: false })` surfaces as `error`.
  await page.route("**/api/auth/signin/postmark*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "http://localhost:3100/signin?error=Configuration" }),
    });
  });

  await page.goto("/signin");
  const submit = page.getByRole("button", { name: /Send me a sign-in code/ });
  await expect(submit).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  // Mixed case on the way in; Auth.js stores the token against the lower-cased
  // identifier, so the handoff has to normalize or redemption silently fails.
  await page.getByPlaceholder("you@company.com").fill(email.toUpperCase());
  await submit.click();

  // The user must not be sent to "check your email" for a code that never left.
  await expect(page.locator(".auth-error")).toContainText("no code is on its way", {
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(page).toHaveURL(/\/signin/);

  const stashed = await page.evaluate((key) => window.sessionStorage.getItem(key), SIGN_IN_EMAIL_KEY);
  expect(stashed, "the identifier is handed over normalized").toBe(email.toLowerCase());
  // An email address is personal data and has no business in a URL - which is
  // why the handoff goes through sessionStorage at all.
  expect(decodeURIComponent(page.url()).toLowerCase()).not.toContain(email.toLowerCase());
});
