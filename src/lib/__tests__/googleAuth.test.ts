/**
 * Unit tests for checkGoogleScopes — verifies the helper aggregates scopes
 * across MULTIPLE Google accounts. The motivating bug: a user connects a
 * second, calendar-only Google account and it must NOT hide the calendar/
 * contacts/Gmail scopes already granted on their first account.
 *
 * `~/server/db` is mocked so this stays a pure, DB-free unit test (per
 * CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
});

const findMany = vi.fn();
vi.mock("~/server/db", () => ({
  db: { account: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

import {
  checkGoogleScopes,
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
