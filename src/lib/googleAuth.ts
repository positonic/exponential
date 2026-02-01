/**
 * Google OAuth utilities for incremental authorization.
 *
 * This module provides helpers to check which Google scopes a user has authorized,
 * enabling incremental authorization where we only request permissions as needed.
 */

import { db } from "~/server/db";

// Re-export scope sets for convenience
export { GOOGLE_SCOPE_SETS, type GoogleScopeType } from "~/app/api/auth/google-calendar/route";

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
  const account = await db.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
    select: { scope: true },
  });

  if (!account?.scope) {
    return { hasScopes: false, currentScopes: [] };
  }

  const currentScopes = account.scope.split(" ");
  const hasScopes = requiredScopes.every((required) =>
    currentScopes.some((current) => current.includes(required) || required.includes(current))
  );

  return { hasScopes, currentScopes };
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
