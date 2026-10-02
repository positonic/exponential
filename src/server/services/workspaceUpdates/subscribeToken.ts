import jwt from "jsonwebtoken";

/**
 * Signed confirmation tokens for the double-opt-in signup on a workspace's
 * public updates page (pattern: `crmUnsubscribeToken`).
 *
 * The token *is* the pending signup: it carries `{ workspaceId, email }` and is
 * signed with `AUTH_SECRET`, so nothing about the visitor is stored until they
 * follow the link, and only someone who can read that inbox can confirm it.
 * Unlike unsubscribe links, these expire: a confirmation is a fresh consent.
 */
const PURPOSE = "update-subscribe";
export const SUBSCRIBE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

interface SubscribePayload {
  workspaceId: string;
  email: string;
  purpose: typeof PURPOSE;
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to sign subscribe tokens");
  return secret;
}

export function signSubscribeToken(workspaceId: string, email: string): string {
  return jwt.sign({ workspaceId, email, purpose: PURPOSE }, authSecret(), {
    expiresIn: SUBSCRIBE_TOKEN_TTL_SECONDS,
  });
}

/** The signup a valid token confirms; null for tampered, foreign or expired tokens. */
export function verifySubscribeToken(token: string): { workspaceId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, authSecret()) as Partial<SubscribePayload>;
    if (decoded.purpose !== PURPOSE || typeof decoded.workspaceId !== "string" || typeof decoded.email !== "string") {
      return null;
    }
    return { workspaceId: decoded.workspaceId, email: decoded.email };
  } catch {
    return null;
  }
}
