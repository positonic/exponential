/**
 * Google OAuth utilities for incremental authorization.
 *
 * This module provides helpers to check which Google scopes a user has authorized,
 * enabling incremental authorization where we only request permissions as needed.
 *
 * The scope registry itself lives in `./googleScopes` (pure constants, safe
 * for client components); it is re-exported here so server code keeps a
 * single import path.
 */

import { db } from "~/server/db";
import { GOOGLE_SCOPES } from "./googleScopes";

export { GOOGLE_SCOPE_SETS, getGoogleAuthUrl } from "./googleScopes";
export type { GoogleScopeType } from "./googleScopes";
export { GOOGLE_SCOPES };

/**
 * Whether this user may use the Google features that depend on scopes Google
 * has not verified yet (calendar, contacts).
 *
 * Verification for those scopes is still pending, so only the accounts
 * registered as test users on the Google Cloud Console project can actually
 * complete the consent screen — everyone else hits an "unverified app" error.
 * Rather than sending them into that dead end we gate the features behind
 * `GOOGLE_OAUTH_TESTER_EMAILS`, a comma-separated allowlist, and show a
 * "premium feature" message instead.
 *
 * Fails closed: an unset or empty allowlist locks the features for everyone,
 * because a broken consent screen is worse than a missing button.
 *
 * Note that plain Google *sign-in* is verified and is deliberately NOT gated.
 */
export function isGoogleOAuthTester(email: string | null | undefined): boolean {
  if (!email) return false;

  const allowlist = process.env.GOOGLE_OAUTH_TESTER_EMAILS;
  if (!allowlist) return false;

  const normalized = email.trim().toLowerCase();
  return allowlist
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .includes(normalized);
}

/**
 * Check if a user has authorized specific Google scopes.
 *
 * @param userId - The user's ID
 * @param requiredScopes - Array of scope URLs to check for
 * @returns Object with hasScopes boolean and the user's current scopes
 */
export async function checkGoogleScopes(
  userId: string,
  requiredScopes: string[]
): Promise<{ hasScopes: boolean; currentScopes: string[] }> {
  // A user may have multiple Google accounts (e.g. a calendar-only account
  // plus a CRM-scoped one). Consider the account whose scopes best satisfy the
  // request so adding a narrow second account never hides an existing grant.
  const accounts = await db.account.findMany({
    where: {
      userId,
      provider: "google",
    },
    select: { scope: true },
  });

  const scopeSatisfies = (scope: string | null) => {
    if (!scope) return false;
    const current = scope.split(" ");
    return requiredScopes.every((required) =>
      current.some((c) => c.includes(required) || required.includes(c)),
    );
  };

  const matching = accounts.find((a) => scopeSatisfies(a.scope));
  if (matching?.scope) {
    return { hasScopes: true, currentScopes: matching.scope.split(" ") };
  }

  // None fully satisfy — return the broadest account's scopes for context.
  const broadest = accounts
    .map((a) => a.scope?.split(" ") ?? [])
    .sort((a, b) => b.length - a.length)[0];
  return { hasScopes: false, currentScopes: broadest ?? [] };
}

/**
 * Check if user has calendar access
 */
export async function hasCalendarAccess(userId: string): Promise<boolean> {
  const { hasScopes } = await checkGoogleScopes(userId, [GOOGLE_SCOPES.CALENDAR]);
  return hasScopes;
}

/**
 * Check if user has contacts access (for CRM import)
 */
export async function hasContactsAccess(userId: string): Promise<boolean> {
  const { hasScopes } = await checkGoogleScopes(userId, [GOOGLE_SCOPES.CONTACTS]);
  return hasScopes;
}
