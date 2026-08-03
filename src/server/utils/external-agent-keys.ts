import crypto from "crypto";

/**
 * Opaque credential for an External agent (ADR-0049).
 *
 * Deliberately NOT a JWT: revocation must be real (row delete, effective next
 * request), and generic MCP/HTTP clients want one static Bearer value. The
 * secret is high-entropy random, so a fast unsalted SHA-256 is sufficient and
 * enables indexed equality lookup (bcrypt-style slow hashing defends low-entropy
 * passwords, which this is not).
 */

/** Distinctive prefix so secret scanning and log redaction can catch leaks. */
export const EXTERNAL_AGENT_KEY_PREFIX = "exp_agent_";

/** Length of the non-secret display fragment stored alongside the hash. */
const DISPLAY_PREFIX_LENGTH = EXTERNAL_AGENT_KEY_PREFIX.length + 6;

export interface GeneratedExternalAgentKey {
  /** The full secret — returned to the owner exactly once, never stored. */
  secret: string;
  /** SHA-256 hex of the secret; the only thing persisted. */
  hash: string;
  /** Non-secret display fragment for the settings list ("exp_agent_ab12cd…"). */
  displayPrefix: string;
}

export function generateExternalAgentKey(): GeneratedExternalAgentKey {
  const secret = `${EXTERNAL_AGENT_KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return {
    secret,
    hash: hashExternalAgentKey(secret),
    displayPrefix: `${secret.slice(0, DISPLAY_PREFIX_LENGTH)}…`,
  };
}

export function hashExternalAgentKey(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** Cheap syntactic test so the auth context can branch before any DB work. */
export function isExternalAgentKey(bearerToken: string): boolean {
  return bearerToken.startsWith(EXTERNAL_AGENT_KEY_PREFIX);
}
