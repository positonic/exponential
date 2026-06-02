/**
 * Voice-session token helpers (ADR 0002 — two-tier voice auth).
 *
 * The durable Exponential API key (held in the iOS Keychain) authenticates
 * `voice.createSession`. That procedure mints a short-lived, audience-scoped
 * `voice-session` JWT which the device then uses to authenticate every
 * coarse-tool callback to the voice brain endpoint. This keeps the durable
 * credential off the voice transport and bounds the blast radius of a leaked
 * session token to "~30 min of the voice tool surface".
 */
import jwt from "jsonwebtoken";

import {
  generateJWT,
  type JWTUserPayload,
  SECURITY_FIX_TIMESTAMP,
  CURRENT_SECURITY_VERSION,
} from "~/server/utils/jwt";

/** Audience the voice brain endpoint validates against. Mirrors TOKEN_AUDIENCE["voice-session"]. */
export const VOICE_SESSION_AUDIENCE = "voice-session";
const TOKEN_ISSUER = "todo-app";

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required for voice-session tokens");
  }
  return secret;
}

/**
 * Mint a voice-session JWT for the given user. ~30-min expiry (DEFAULT_EXPIRY),
 * audience scoped to the voice tool surface.
 */
export function mintVoiceSessionToken(
  user: JWTUserPayload,
  workspaceId?: string,
): string {
  return generateJWT(user, {
    tokenType: "voice-session",
    ...(workspaceId ? { extraClaims: { workspaceId } } : {}),
  });
}

export interface VerifiedVoiceSession {
  userId: string;
  /**
   * The workspace this session operates in (verified claim). Absent on legacy
   * tokens minted before the claim existed — callers fall back accordingly.
   */
  workspaceId?: string;
}

/**
 * Verify a voice-session JWT presented by the device on a coarse-tool callback.
 * Enforces signature, audience, issuer, the `voice-session` token type, and the
 * shared security claims (nbf / securityVersion). Throws on any failure — the
 * brain endpoint must reject anything it cannot positively validate.
 */
export function verifyVoiceSessionToken(token: string): VerifiedVoiceSession {
  const decoded = jwt.verify(token, getAuthSecret(), {
    audience: VOICE_SESSION_AUDIENCE,
    issuer: TOKEN_ISSUER,
  }) as {
    sub?: string;
    userId?: string;
    tokenType?: string;
    nbf?: number;
    securityVersion?: number;
    workspaceId?: string;
  };

  if (decoded.tokenType !== "voice-session") {
    throw new Error("Not a voice-session token");
  }
  if (decoded.nbf === undefined || decoded.securityVersion === undefined) {
    throw new Error("Voice-session token missing required security claims");
  }
  if (decoded.nbf < SECURITY_FIX_TIMESTAMP) {
    throw new Error("Voice-session token issued before security fix");
  }
  if (decoded.securityVersion < CURRENT_SECURITY_VERSION) {
    throw new Error("Voice-session token security version too old");
  }

  const userId = decoded.sub ?? decoded.userId;
  if (!userId) {
    throw new Error("Voice-session token missing user identifier");
  }

  // workspaceId is OPTIONAL by design (legacy tokens minted before the claim,
  // and users who belong to no workspace, carry none — callers fall back). We
  // therefore don't reject a missing claim; we only guard the TYPE, ignoring a
  // malformed non-string claim rather than propagating it as a workspaceId.
  const workspaceId =
    typeof decoded.workspaceId === "string" && decoded.workspaceId.length > 0
      ? decoded.workspaceId
      : undefined;

  return { userId, workspaceId };
}
