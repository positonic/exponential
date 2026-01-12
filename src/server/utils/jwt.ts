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
 * Generates a JWT for agent contexts (Mastra agents calling back to this app).
 * Used for authenticating agent tool callbacks.
 *
 * @param user - The user payload to include in the JWT
 * @param expiryMinutes - Token expiration time in minutes (default: 30)
 * @returns Signed JWT string
 */
export function generateAgentJWT(
  user: JWTUserPayload,
  expiryMinutes = 30
): string {
  // Security fix deployment timestamp - invalidates all JWTs issued before this fix
  const securityFixTimestamp = Math.floor(
    new Date("2025-08-06T15:45:00Z").getTime() / 1000
  );

  return jwt.sign(
    {
      userId: user.id,
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * expiryMinutes,
      nbf: securityFixTimestamp, // Not valid before security fix deployment
      jti: crypto.randomUUID(),
      tokenType: "agent-context",
      aud: "mastra-agents",
      iss: "todo-app",
      securityVersion: 1, // Version to track security fixes
    },
    getAuthSecret()
  );
}
