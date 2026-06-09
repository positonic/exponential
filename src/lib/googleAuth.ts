/**
 * Google OAuth utilities for incremental authorization.
 *
 * This module provides helpers to check which Google scopes a user has authorized,
 * enabling incremental authorization where we only request permissions as needed.
 */

import { db } from "~/server/db";

/**
 * Google OAuth scope sets for incremental authorization.
 *
 * We use incremental authorization to minimize permissions requested during onboarding:
 * - "calendar": Only calendar access (sensitive scope, faster Google verification)
 * - "contacts": Calendar + Contacts (sensitive scopes)
 * - "crm": Calendar + Contacts + Gmail (includes restricted scope, requires security audit)
 */
/**
 * Identity scopes requested alongside every set. Without these the
 * `oauth2/v2/userinfo` call returns 401, so the OAuth callback can't read the
 * Google account id/email it needs to upsert the Account by
 * (provider, providerAccountId). These are non-sensitive and don't affect
 * Google's verification tier. They also make the calendar account's
 * providerAccountId match the one stored at NextAuth sign-in, so reconnecting
 * dedupes onto the same row instead of creating a duplicate.
 */
const GOOGLE_IDENTITY_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
] as const;

export const GOOGLE_SCOPE_SETS = {
  calendar: [
    ...GOOGLE_IDENTITY_SCOPES,
    "https://www.googleapis.com/auth/calendar.events",
  ],
  contacts: [
    ...GOOGLE_IDENTITY_SCOPES,
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/contacts.readonly",
  ],
  crm: [
    ...GOOGLE_IDENTITY_SCOPES,
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
  ],
} as const;

export type GoogleScopeType = keyof typeof GOOGLE_SCOPE_SETS;

/**
 * Individual Google OAuth scopes used in the application
 */
export const GOOGLE_SCOPES = {
  CALENDAR: "https://www.googleapis.com/auth/calendar.events",
  CONTACTS: "https://www.googleapis.com/auth/contacts.readonly",
  GMAIL: "https://www.googleapis.com/auth/gmail.readonly",
} as const;

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

/**
 * Check if user has Gmail access (for CRM email sync)
 */
export async function hasGmailAccess(userId: string): Promise<boolean> {
  const { hasScopes } = await checkGoogleScopes(userId, [GOOGLE_SCOPES.GMAIL]);
  return hasScopes;
}

/**
 * Get the OAuth URL for requesting additional scopes
 *
 * @param scopeType - The scope set to request
 * @param returnUrl - Where to redirect after authorization
 */
export function getGoogleAuthUrl(
  scopeType: "calendar" | "contacts" | "crm",
  returnUrl: string
): string {
  const params = new URLSearchParams({
    type: scopeType,
    returnUrl,
  });
  return `/api/auth/google-calendar?${params.toString()}`;
}
