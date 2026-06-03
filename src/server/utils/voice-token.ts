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
 *
 * `conversationId`, when present, pins this session's memory thread to the web
 * text-chat conversation so typing and talking share one thread (ADR-0006). It
 * is baked into the token as a verified claim — the same "claim is
 * authoritative" pattern as `workspaceId` — so `dispatch` trusts the token over
 * any per-call arg. iOS mints without it and stays user-scoped.
 */
export function mintVoiceSessionToken(
  user: JWTUserPayload,
  workspaceId?: string,
  conversationId?: string,
): string {
  const extraClaims: Record<string, unknown> = {};
  if (workspaceId) extraClaims.workspaceId = workspaceId;
  if (conversationId) extraClaims.conversationId = conversationId;
  return generateJWT(user, {
    tokenType: "voice-session",
    ...(Object.keys(extraClaims).length > 0 ? { extraClaims } : {}),
  });
}

export interface VerifiedVoiceSession {
  userId: string;
  /**
   * The workspace this session operates in (verified claim). Absent on legacy
   * tokens minted before the claim existed — callers fall back accordingly.
   */
  workspaceId?: string;
  /**
   * The text-chat conversation this voice session is bound to (verified claim,
   * web only). When present, the brain reads/writes this thread so voice and
   * text are one continuous conversation (ADR-0006). Absent on iOS / legacy
   * tokens — callers fall back to the user-scoped `voice-${userId}` thread.
   */
  conversationId?: string;
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
    conversationId?: string;
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

  // conversationId is OPTIONAL by design — present only for web sessions bound
  // to a text-chat thread (ADR-0006); iOS / legacy tokens carry none. Same type
  // guard as workspaceId: ignore a malformed non-string claim rather than
  // propagating it.
  const conversationId =
    typeof decoded.conversationId === "string" && decoded.conversationId.length > 0
      ? decoded.conversationId
      : undefined;

  return { userId, workspaceId, conversationId };
}
