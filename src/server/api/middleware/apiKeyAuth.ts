import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { publicProcedure } from "~/server/api/trpc";

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
