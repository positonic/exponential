const NEW_USER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Decide whether an authenticated user visiting /home should be redirected
 * into the welcome flow. New-user routing is keyed solely on
 * `welcomeCompletedAt` and account age — never on the deprecated
 * onboarding columns (see ADR "Welcome flow supersedes the onboarding
 * wizard").
 *
 * `User` has no `createdAt` column, so account age is proxied by the
 * creation time of the earliest workspace the user owns (the Personal
 * workspace is auto-created at signup). Pass `createdAt: null` when the
 * user owns no workspace — such accounts classify as old (no redirect).
 *
 * Redirects only while the account is under 24 hours old and the welcome
 * flow hasn't been completed; after that the dismissible WelcomeBanner is
 * the only nudge.
 */
export function resolveNewUserRedirect(
  user: {
    createdAt: Date | null;
    welcomeCompletedAt: Date | null;
  },
  now: Date = new Date(),
): "/welcome" | null {
  if (user.welcomeCompletedAt) {
    return null;
  }

  if (!user.createdAt) {
    return null;
  }

  const accountAgeMs = now.getTime() - user.createdAt.getTime();
  if (accountAgeMs < NEW_USER_WINDOW_MS) {
    return "/welcome";
  }

  return null;
}
