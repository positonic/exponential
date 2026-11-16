/**
 * The bearer resolver: turns an `Authorization: Bearer` token into the session
 * a request runs as. One implementation shared by the tRPC context and the
 * hosted MCP endpoint (`/api/mcp`), so both read credentials the same way
 * (hosted MCP Agent PRD, D5).
 *
 * Two credential shapes:
 *
 * - an External agent key (`exp_agent_…`, ADR-0049), resolved by hash to the
 *   agent's shadow User. It is never a JWT, so a key that fails to resolve is
 *   unauthenticated and never falls through to JWT verification;
 * - a JWT signed with `AUTH_SECRET`, resolved to the user it names, with its
 *   verified `tokenType` (and `runId` for agent-context JWTs).
 *
 * Callers decide which token types they accept: the tRPC context takes all of
 * them, the MCP endpoint only agent keys and `api-token` JWTs.
 */

import jwt from "jsonwebtoken";
import type { Session } from "next-auth";

import { db } from "~/server/db";
import { hashExternalAgentKey, isExternalAgentKey } from "~/server/utils/external-agent-keys";
import { CURRENT_SECURITY_VERSION, SECURITY_FIX_TIMESTAMP } from "~/server/utils/jwt";
import { runAfterResponseReported } from "~/server/utils/runAfterResponse";

export interface BearerResolution {
  session: Session;
  /** `"agent-key"` for an External agent key, else the JWT's verified `tokenType`. */
  tokenType: string | undefined;
  /** The Agent run an `agent-context` JWT was minted for (ADR-0067). */
  agentRunId: string | undefined;
}

/**
 * The token from an `Authorization: Bearer <token>` header, or null. The scheme
 * name is case-insensitive (RFC 9110 §11.1), so `bearer` and `BEARER` work too:
 * third-party MCP clients send all three.
 */
export function bearerTokenFrom(headers: Headers): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(headers.get("authorization") ?? "");
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/** Resolve a bearer token to the session it acts as, or null when it does not authenticate. */
export async function resolveBearerToken(token: string): Promise<BearerResolution | null> {
  return isExternalAgentKey(token) ? resolveAgentKey(token) : resolveJwt(token);
}

async function resolveAgentKey(token: string): Promise<BearerResolution | null> {
  try {
    const key = await db.externalAgentKey.findUnique({
      where: { keyHash: hashExternalAgentKey(token) },
      include: { agent: { include: { shadowUser: true } } },
    });

    if (!key || (key.expiresAt && key.expiresAt <= new Date())) return null;

    // After the response: lastUsedAt is observability, not auth.
    runAfterResponseReported("externalAgent.lastUsedAt", () =>
      db.externalAgentKey
        .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }),
    );

    const shadowUser = key.agent.shadowUser;
    return {
      session: {
        user: {
          id: shadowUser.id,
          email: shadowUser.email,
          name: shadowUser.name,
          image: shadowUser.image,
          // Agents are never admins, whatever the row says.
          isAdmin: false,
        },
        expires: (key.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000)).toISOString(),
      },
      tokenType: "agent-key",
      agentRunId: undefined,
    };
  } catch (error) {
    console.error("[external-agent] key resolution failed:", error);
    return null;
  }
}

async function resolveJwt(token: string): Promise<BearerResolution | null> {
  try {
    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.AUTH_SECRET ?? "") as {
      userId?: string; // Legacy format
      sub?: string; // New API token format
      email: string;
      name?: string;
      picture?: string;
      tokenType?: string;
      /** Agent-run JWTs carry the run they act for (ADR-0067). */
      runId?: string;
      exp?: number;
      iat?: number;
      nbf?: number; // Not before timestamp
      jti?: string;
      securityVersion?: number;
    };

    // Security validation - require security claims on all tokens
    // Tokens without nbf or securityVersion are rejected (closes security gap)
    if (decoded.nbf === undefined || decoded.securityVersion === undefined) {
      console.warn("🚨 [JWT SECURITY] Token missing required security claims", {
        tokenType: decoded.tokenType,
        hasNbf: decoded.nbf !== undefined,
        hasSecurityVersion: decoded.securityVersion !== undefined,
      });
      throw new Error("JWT missing required security claims");
    }

    if (decoded.nbf < SECURITY_FIX_TIMESTAMP) {
      throw new Error("JWT issued before security fix - token invalidated");
    }

    if (decoded.securityVersion < CURRENT_SECURITY_VERSION) {
      throw new Error("JWT security version too old - token invalidated");
    }

    // Support both legacy and new token formats (`||`, not `??`: an empty
    // userId falls back to sub, as it always has)
    const userId = decoded.userId || decoded.sub;
    if (!userId) {
      throw new Error("Invalid token: missing user identifier");
    }

    // PII (email, name) must never be logged here — this runs on every
    // JWT-authenticated request, including production.
    if (process.env.NODE_ENV === "development") {
      console.log("🔐 [JWT DEBUG] Token decoded successfully", {
        userId: userId,
        tokenType: decoded.tokenType,
        issuedAt: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : "not set",
        expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : "not set",
        securityVersion: decoded.securityVersion,
      });
    }

    // Find the user
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (process.env.NODE_ENV === "development") {
      console.log("👤 [USER LOOKUP] Database user lookup", {
        userId: userId,
        userFound: !!user,
      });
    }

    if (!user) return null;

    return {
      // Create a session-like object from the JWT token
      session: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          isAdmin: user.isAdmin,
        },
        expires: decoded.exp
          ? new Date(decoded.exp * 1000).toISOString()
          : new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes fallback
      },
      // Surface the JWT token type so procedures can attribute writes to
      // the calling surface (e.g. Action.source for chat gateways).
      tokenType: decoded.tokenType,
      // The Agent run this token was minted for (agent-context JWTs
      // from the dispatcher). Run tools address their run through
      // this claim, never through tool input.
      agentRunId: decoded.tokenType === "agent-context" ? decoded.runId : undefined,
    };
  } catch (error) {
    // Log only the message — never the raw token or decoded payload.
    console.error("JWT verification failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}
