import { randomBytes } from "crypto";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

/**
 * Generate a cryptographically secure random token
 * @param length - Number of bytes (output will be 2x this in hex chars)
 */
export function generateSecureToken(length = 32): string {
  return randomBytes(length).toString("hex");
}

/**
 * Generate an invite URL with the given token. Uses the shared public-base-URL
 * helper, which prefers NEXT_PUBLIC_APP_URL and, on Vercel, the production URL
 * over NEXTAUTH_URL (unset in some deploys, where it would send invite emails
 * to localhost). See `getPublicBaseUrlFromEnv` for the full order.
 * @param token - The invitation token
 */
export function generateInviteUrl(token: string): string {
  return `${getPublicBaseUrlFromEnv()}/invite/${token}`;
}

/**
 * Generate a team invite URL with the given token
 * @param token - The team invitation token
 */
export function generateTeamInviteUrl(token: string): string {
  return `${getPublicBaseUrlFromEnv()}/team-invite/${token}`;
}
