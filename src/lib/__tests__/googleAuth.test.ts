/**
 * Unit tests for checkGoogleScopes — verifies the helper aggregates scopes
 * across MULTIPLE Google accounts. The motivating bug: a user connects a
 * second, calendar-only Google account and it must NOT hide the calendar/
 * contacts/Gmail scopes already granted on their first account.
 *
 * `~/server/db` is mocked so this stays a pure, DB-free unit test (per
 * CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
});

const findMany = vi.fn();
vi.mock("~/server/db", () => ({
  db: { account: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

import {
  checkGoogleScopes,
  isGoogleOAuthTester,
  GOOGLE_SCOPES,
} from "~/lib/googleAuth";

const CAL = GOOGLE_SCOPES.CALENDAR;
const CONTACTS = GOOGLE_SCOPES.CONTACTS;
const GMAIL = GOOGLE_SCOPES.GMAIL;

describe("checkGoogleScopes (multi-account)", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("returns false when the user has no Google accounts", async () => {
    findMany.mockResolvedValue([]);
    const result = await checkGoogleScopes("u1", [CAL]);
    expect(result.hasScopes).toBe(false);
    expect(result.currentScopes).toEqual([]);
  });

  it("finds the scope on the only account", async () => {
    findMany.mockResolvedValue([{ scope: `${CAL} ${CONTACTS}` }]);
    const result = await checkGoogleScopes("u1", [CONTACTS]);
    expect(result.hasScopes).toBe(true);
  });

  it("is satisfied when a SECOND account carries the required scope", async () => {
    // Account A is calendar-only; account B has the CRM scopes.
    findMany.mockResolvedValue([
      { scope: CAL },
      { scope: `${CAL} ${CONTACTS} ${GMAIL}` },
    ]);
    const result = await checkGoogleScopes("u1", [GMAIL]);
    expect(result.hasScopes).toBe(true);
    expect(result.currentScopes).toContain(GMAIL);
  });

  it("requires ALL requested scopes to live on a SINGLE account", async () => {
    // Gmail and contacts are split across two accounts — neither alone
    // satisfies a request for both, so it must report false.
    findMany.mockResolvedValue([
      { scope: `${CAL} ${CONTACTS}` },
      { scope: `${CAL} ${GMAIL}` },
    ]);
    const both = await checkGoogleScopes("u1", [CONTACTS, GMAIL]);
    expect(both.hasScopes).toBe(false);
    // Falls back to the broadest account's scopes for context.
    expect(both.currentScopes.length).toBeGreaterThan(0);
  });

  it("returns false when no account has the scope, exposing broadest scopes", async () => {
    findMany.mockResolvedValue([{ scope: CAL }, { scope: `${CAL} ${CONTACTS}` }]);
    const result = await checkGoogleScopes("u1", [GMAIL]);
    expect(result.hasScopes).toBe(false);
    expect(result.currentScopes).toEqual([CAL, CONTACTS]);
  });
});

/**
 * The tester allowlist gating the Google features whose scopes Google has not
 * verified yet. Fails closed: an unset/empty list locks the features for
 * everyone, because sending a non-tester to Google's consent screen is the
 * exact failure this gate exists to prevent.
 */
describe("isGoogleOAuthTester", () => {
  const original = process.env.GOOGLE_OAUTH_TESTER_EMAILS;

  afterEach(() => {
    if (original === undefined) delete process.env.GOOGLE_OAUTH_TESTER_EMAILS;
    else process.env.GOOGLE_OAUTH_TESTER_EMAILS = original;
  });

  it("locks the features when the allowlist is unset or empty", () => {
    delete process.env.GOOGLE_OAUTH_TESTER_EMAILS;
    expect(isGoogleOAuthTester("a@example.com")).toBe(false);

    process.env.GOOGLE_OAUTH_TESTER_EMAILS = "";
    expect(isGoogleOAuthTester("a@example.com")).toBe(false);
  });

  it("matches allowlisted emails case-insensitively, ignoring whitespace", () => {
    process.env.GOOGLE_OAUTH_TESTER_EMAILS = " A@Example.com , b@example.com ";
    expect(isGoogleOAuthTester("a@example.com")).toBe(true);
    expect(isGoogleOAuthTester("  B@EXAMPLE.COM ")).toBe(true);
  });

  it("rejects emails that are not on the list", () => {
    process.env.GOOGLE_OAUTH_TESTER_EMAILS = "a@example.com";
    expect(isGoogleOAuthTester("c@example.com")).toBe(false);
  });

  it("rejects a missing email rather than matching an empty entry", () => {
    // A trailing comma leaves an empty entry; a user with no email must not
    // slip through it.
    process.env.GOOGLE_OAUTH_TESTER_EMAILS = "a@example.com,";
    expect(isGoogleOAuthTester(null)).toBe(false);
    expect(isGoogleOAuthTester(undefined)).toBe(false);
    expect(isGoogleOAuthTester("")).toBe(false);
  });
});
