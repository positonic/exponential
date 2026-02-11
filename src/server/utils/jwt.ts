import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Gets the AUTH_SECRET, throwing if not available.
 * Deferred validation allows for runtime environment loading.
 */
function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required for JWT signing");
  }
  return secret;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Security fix deployment timestamp - invalidates all JWTs issued before this fix.
 * Update this timestamp when deploying security-critical JWT changes.
 */
export const SECURITY_FIX_TIMESTAMP = Math.floor(
  new Date("2025-08-06T15:45:00Z").getTime() / 1000
);

/**
 * Current security version for JWT tokens.
 * Increment this when making security-related changes to JWT structure.
 */
export const CURRENT_SECURITY_VERSION = 1;

// =============================================================================
// Types
// =============================================================================

/**
 * User payload for JWT generation.
 */
export interface JWTUserPayload {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

/**
 * Supported JWT token types in the application.
 */
export type JWTTokenType = "agent-context" | "whatsapp-gateway" | "telegram-gateway" | "api-token";

/**
 * Options for unified JWT generation.
 */
export interface GenerateJWTOptions {
  /** Token type identifier */
  tokenType: JWTTokenType;
  /** Expiration time in minutes (uses DEFAULT_EXPIRY if not specified) */
  expiryMinutes?: number;
  /** Optional token name (for api-token type) */
  tokenName?: string;
}

/**
 * Default expiration times per token type (in minutes).
 */
export const DEFAULT_EXPIRY: Record<JWTTokenType, number> = {
  "agent-context": 30,      // 30 minutes
  "whatsapp-gateway": 60,   // 1 hour
  "telegram-gateway": 60,   // 1 hour
  "api-token": 1440,        // 24 hours (default, usually overridden)
};

// =============================================================================
// Functions
// =============================================================================

/**
 * Generates a unified JWT token for various application contexts.
 * All tokens include security claims (nbf, securityVersion) for consistent validation.
 *
 * @param user - User data to embed in the token
 * @param options - Token configuration options
 * @returns Signed JWT string
 *
 * @example
 * // Generate agent context token (30 min expiry)
 * const token = generateJWT(user, { tokenType: 'agent-context' });
 *
 * @example
 * // Generate WhatsApp gateway token (1 hour expiry)
 * const token = generateJWT(user, { tokenType: 'whatsapp-gateway' });
 *
 * @example
 * // Generate API token with custom expiry
 * const token = generateJWT(user, {
 *   tokenType: 'api-token',
 *   expiryMinutes: 60 * 24 * 7, // 1 week
 *   tokenName: 'My Integration Key'
 * });
 */
export function generateJWT(
  user: JWTUserPayload,
  options: GenerateJWTOptions
): string {
  const {
    tokenType,
    expiryMinutes = DEFAULT_EXPIRY[tokenType],
    tokenName,
  } = options;

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      userId: user.id,
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
      iat: now,
      exp: now + 60 * expiryMinutes,
      nbf: SECURITY_FIX_TIMESTAMP,
      jti: crypto.randomUUID(),
      tokenType,
      aud: "mastra-agents",
      iss: "todo-app",
      securityVersion: CURRENT_SECURITY_VERSION,
      ...(tokenName && { tokenName }),
    },
    getAuthSecret()
  );
}

/**
 * Generates a JWT for agent contexts (Mastra agents calling back to this app).
 * Used for authenticating agent tool callbacks.
 *
 * @deprecated Use `generateJWT(user, { tokenType: 'agent-context' })` instead.
 *
 * @param user - The user payload to include in the JWT
 * @param expiryMinutes - Token expiration time in minutes (default: 30)
 * @returns Signed JWT string
 */
export function generateAgentJWT(
  user: JWTUserPayload,
  expiryMinutes = 30
): string {
  return generateJWT(user, { tokenType: "agent-context", expiryMinutes });
}
