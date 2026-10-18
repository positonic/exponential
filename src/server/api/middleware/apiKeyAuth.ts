import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";
import { publicProcedure } from "~/server/api/trpc";
import { resolvePrincipal, type Principal } from "~/server/services/access/principal";

/**
 * Middleware that authenticates via:
 * 1. Existing session (from NextAuth cookie or Bearer JWT) — checked first
 * 2. API key in x-api-key header (VerificationToken lookup) — fallback
 *
 * This allows extension users with a valid JWT in the Authorization header
 * to access endpoints without needing a separate API key.
 */
export const apiKeyMiddleware = publicProcedure.use(async ({ ctx, next }) => {
  // Path 1: Already authenticated via Bearer token or session cookie
  if (ctx.session?.user?.id) {
    return next({
      ctx: {
        ...ctx,
        userId: ctx.session.user.id,
      },
    });
  }

  // Path 2: API key authentication
  const apiKey = ctx.headers.get("x-api-key");
  if (!apiKey) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "Authentication required. Use session cookie, Bearer token, or x-api-key header.",
    });
  }

  // SECURITY: Try hashed lookup first (new keys are stored as sha256 hashes).
  // Fall back to plaintext lookup for legacy keys created before hashing was enabled.
  const hashedKey = `sha256:${crypto.createHash("sha256").update(apiKey).digest("hex")}`;
  let verificationToken = await ctx.db.verificationToken.findFirst({
    where: {
      token: hashedKey,
      expires: { gt: new Date() },
    },
  });

  if (!verificationToken) {
    // Legacy fallback: try plaintext match for keys created before hashing
    verificationToken = await ctx.db.verificationToken.findFirst({
      where: {
        token: apiKey,
        expires: { gt: new Date() },
      },
    });
  }

  if (!verificationToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired API key",
    });
  }

  const userId = verificationToken.userId;
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No user associated with this API key",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId,
    },
  });
});

/** The slice of an `apiKeyMiddleware` context the principal needs. */
export interface ApiKeyCallerContext {
  db: PrismaClient;
  userId: string;
  session: { user: { id: string } } | null;
  tokenType: string | undefined;
  agentRunId?: string;
}

/**
 * The verified principal behind an `apiKeyMiddleware` procedure. A session or
 * bearer token goes straight to `resolvePrincipal`. A durable `x-api-key` has
 * no session: it was verified by its DB lookup above and is a person's own
 * credential, so it resolves like their API token; a shadow user behind one
 * is still caught by `User.isAgent` (and refused if it has no owning agent).
 */
export function resolveApiKeyCallerPrincipal(ctx: ApiKeyCallerContext): Promise<Principal> {
  return resolvePrincipal(
    ctx.session
      ? ctx
      : { db: ctx.db, session: { user: { id: ctx.userId } }, tokenType: "api-token" },
  );
}
