import { randomBytes } from "crypto";

/**
 * Generate a cryptographically secure random token
 * @param length - Number of bytes (output will be 2x this in hex chars)
 */
export function generateSecureToken(length = 32): string {
  return randomBytes(length).toString("hex");
}

/**
 * Generate an invite URL with the given token
 * @param token - The invitation token
 */
export function generateInviteUrl(token: string): string {
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${baseUrl}/invite/${token}`;
}
