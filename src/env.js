import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * DATABASE_ENCRYPTION_KEY must be 32 bytes, raw or base64 (mirrors
 * `getKey()` in src/server/utils/encryption.ts). Guarded so the check also
 * works in runtimes without a global Buffer.
 */
const isValidDatabaseEncryptionKey = (/** @type {string} */ val) => {
  if (typeof Buffer === "undefined") return val.length >= 32;
  try {
    if (Buffer.from(val, "base64").length === 32) return true;
  } catch {
    // fall through to the raw check
  }
  return Buffer.byteLength(val) === 32;
};

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_DISCORD_ID: z.string(),
    AUTH_DISCORD_SECRET: z.string(),
    MICROSOFT_ENTRA_ID_CLIENT_ID: z.string().optional(),
    MICROSOFT_ENTRA_ID_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_ENTRA_ID_TENANT_ID: z.string().optional(),
    DATABASE_URL: z.string().url(),
    // AES-256-GCM key for IntegrationCredential storage. Required in
    // production so a misconfigured deploy fails at boot rather than at the
    // first credential write; in dev/test `encryptCredential` still throws at
    // write time when it is missing (encryption is mandatory everywhere).
    DATABASE_ENCRYPTION_KEY: (process.env.NODE_ENV === "production"
      ? z.string()
      : z.string().optional()
    ).refine((val) => val === undefined || isValidDatabaseEncryptionKey(val), {
      message:
        "DATABASE_ENCRYPTION_KEY must be 32 bytes (raw) or base64-encoded 32 bytes",
    }),
    // Web Push (VAPID) private key — server-only, pairs with
    // NEXT_PUBLIC_VAPID_PUBLIC_KEY. Optional: push notifications degrade
    // gracefully when unset (see WebPushService / pushSubscription router).
    VAPID_PRIVATE_KEY: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // Required only on Vercel production deploys (matches the VERCEL_ENV gate
    // used by Sentry.init). Optional locally, for previews, and during
    // `next lint` (which forces NODE_ENV=production).
    NEXT_PUBLIC_SENTRY_DSN:
      process.env.VERCEL_ENV === "production"
        ? z.string().url()
        : z.string().url().optional(),
    // Web Push (VAPID) public key — exposed to the browser as the
    // applicationServerKey for pushManager.subscribe(). Optional: push
    // notifications degrade gracefully when unset.
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_DISCORD_ID: process.env.AUTH_DISCORD_ID,
    AUTH_DISCORD_SECRET: process.env.AUTH_DISCORD_SECRET,
    MICROSOFT_ENTRA_ID_CLIENT_ID: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID,
    MICROSOFT_ENTRA_ID_CLIENT_SECRET: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET,
    MICROSOFT_ENTRA_ID_TENANT_ID: process.env.MICROSOFT_ENTRA_ID_TENANT_ID,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_ENCRYPTION_KEY: process.env.DATABASE_ENCRYPTION_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
