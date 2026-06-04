import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { DEFAULT_EXPIRY, generateJWT } from "~/server/utils/jwt";
import { verifyAuthCode, verifyPkce } from "~/server/utils/native-auth";

export const authRouter = createTRPCRouter({
  /**
   * Which sign-in providers are actually configured (env vars present). The
   * signin/invite UIs use this to avoid showing buttons that would bounce back
   * with "provider not found" because their credentials aren't set for this
   * deployment.
   *
   * Keep in sync with `src/server/auth/config.ts` — any provider that's
   * conditionally registered there must be gated here too.
   */
  getConfiguredProviders: publicProcedure.query(() => ({
    google: !!process.env.GOOGLE_CLIENT_ID,
    microsoft: !!process.env.MICROSOFT_ENTRA_ID_CLIENT_ID,
    discord: !!process.env.AUTH_DISCORD_ID,
    postmark: !!(process.env.AUTH_POSTMARK_KEY ?? process.env.POSTMARK_SERVER_TOKEN),
  })),

  /**
   * Native sign-in code exchange (ADR 0005, `exponential-ios`). The app sends
   * the one-time auth code from `/api/auth/native/start` plus its PKCE
   * `code_verifier`; we verify both and mint the durable device-token pair.
   *
   * Public on purpose — no durable credential exists yet at exchange time. PKCE
   * is the protection: an intercepted code is useless without the verifier,
   * which never leaves the device. snake_case `code_verifier` matches the
   * OAuth/PKCE wire convention the app encodes.
   */
  exchangeAuthCode: publicProcedure
    .input(
      z.object({
        code: z.string().min(1),
        // RFC 7636: a code_verifier is 43–128 chars of unreserved characters.
        code_verifier: z.string().min(43).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let claims;
      try {
        claims = verifyAuthCode(input.code);
      } catch {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired authorization code" });
      }

      if (!verifyPkce(input.code_verifier, claims.codeChallenge)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "PKCE verification failed" });
      }

      const user = await ctx.db.user.findUnique({
        where: { id: claims.sub },
        select: { id: true, email: true, name: true, image: true },
      });
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      }

      // A 30-day device-token accepted as a full-account Bearer by api/trpc.ts
      // (which verifies with raw AUTH_SECRET, no audience/tokenType constraint).
      // ⚠️ Phase 1 has no Device store, so there is NO per-token revocation: a
      // leaked device-token is valid for its full lifetime, and the only kill
      // switch is the global SECURITY_FIX_TIMESTAMP / AUTH_SECRET rotation (which
      // logs out every user). Per-device denylist + rotation land in Phase 2 (#21).
      const deviceToken = generateJWT(user, { tokenType: "device-token" });
      const deviceTokenExpiresAt = Math.floor(Date.now() / 1000) + DEFAULT_EXPIRY["device-token"] * 60;

      // Phase 1 (ADR 0005 §3): the token pair is returned from day one so Phase 2
      // needs no re-onboarding, but refresh-token rotation + the Device store are
      // not implemented yet. This opaque token is therefore not yet redeemable —
      // see `refresh` below. The client persists it and re-signs-in on expiry.
      const refreshToken = crypto.randomBytes(32).toString("base64url");

      return { deviceToken, refreshToken, deviceTokenExpiresAt };
    }),

  /**
   * Refresh-token rotation (ADR 0005 §4) — Phase 2 / iOS ticket #21. Not yet
   * implemented (no Device store in Phase 1). Returns the distinct
   * refresh-token-dead signal the client treats as "force re-auth" rather than
   * "retry", so a Phase-2 client degrades gracefully to a fresh sign-in.
   */
  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string().min(1) }))
    .mutation(() => {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "refresh_unsupported" });
    }),
});
