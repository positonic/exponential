import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

/**
 * Which sign-in providers are actually configured (env vars present). The
 * signin/invite UIs use this to avoid showing buttons that would bounce back
 * with "provider not found" because their credentials aren't set for this
 * deployment.
 *
 * Keep in sync with `src/server/auth/config.ts` — any provider that's
 * conditionally registered there must be gated here too.
 */
export const authRouter = createTRPCRouter({
  getConfiguredProviders: publicProcedure.query(() => ({
    google: !!process.env.GOOGLE_CLIENT_ID,
    microsoft: !!process.env.MICROSOFT_ENTRA_ID_CLIENT_ID,
    discord: !!process.env.AUTH_DISCORD_ID,
    postmark: !!(process.env.AUTH_POSTMARK_KEY ?? process.env.POSTMARK_SERVER_TOKEN),
  })),
});
