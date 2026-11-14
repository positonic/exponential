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
    // Every OAuth provider is optional: it registers only when its id and
    // secret are both set (src/server/auth/signInMethods.ts).
    AUTH_DISCORD_ID: z.string().optional(),
    AUTH_DISCORD_SECRET: z.string().optional(),
    // Optional everywhere: with no key the app runs as a project and task tool
    // and each AI feature switches off (src/server/services/ai/capabilities.ts).
    // LLM clients are built lazily, never at module scope, so a missing key
    // can't 500 a route at module load (guarded by noModuleScopeLlmClients.test.ts).
    OPENAI_API_KEY: z.string().optional(),
    // Plain SMTP for transactional email, beside Postmark (which wins when both
    // are set). SMTP_HOST counts only together with a sender (EMAIL_FROM, or
    // AUTH_POSTMARK_FROM); the cross-field rule lives in signInMethods.ts and
    // the self-host preflight, since t3-env validates each field alone.
    SMTP_HOST: z.string().optional(),
    // Default 587. SMTP_SECURE="true" (or "1") means implicit TLS, default only on 465.
    SMTP_PORT: z.string().regex(/^\d+$/, "SMTP_PORT must be a port number").optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: z.enum(["true", "false", "1", "0"]).optional(),
    // Sender for auth and transactional email. Postmark falls back to
    // AUTH_POSTMARK_FROM, then noreply@exponential.im; SMTP never falls back
    // to exponential.im.
    EMAIL_FROM: z.string().optional(),
    // Opt-in: with no email transport configured, write the instance admin's
    // Sign-in codes to the server log ("true" or "1"); nobody else gets a code
    // (ADR-0081). Anyone who can read the log can sign in as the admin.
    // Ignored when a transport is configured.
    AUTH_LOG_SIGN_IN_CODES: z.string().optional(),
    // Bearer secret the cron routes require (Vercel Cron, or the self-host
    // scheduler). The routes fail closed without it.
    CRON_SECRET: z.string().optional(),
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
    // Decrypt-only fallback during key rotation (see
    // dev-docs/ENCRYPTION_KEY_ROTATION.md). Optional everywhere.
    DATABASE_ENCRYPTION_KEY_PREVIOUS: z
      .string()
      .optional()
      .refine((val) => val === undefined || isValidDatabaseEncryptionKey(val), {
        message:
          "DATABASE_ENCRYPTION_KEY_PREVIOUS must be 32 bytes (raw) or base64-encoded 32 bytes",
      }),
    // Web Push (VAPID) private key — server-only, pairs with
    // NEXT_PUBLIC_VAPID_PUBLIC_KEY. Optional: push notifications degrade
    // gracefully when unset (see WebPushService / pushSubscription router).
    VAPID_PRIVATE_KEY: z.string().optional(),
    // Upstash Redis for shared rate limiting (src/server/utils/rateLimit.ts).
    // Optional: without them limits fall back to per-instance in-memory
    // windows, which do not hold across serverless scale-out.
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    // Comma-separated workspace slugs whose members may read the Exponential
    // Method through agentGuidance.method while it is still a draft
    // (content/docs/method/_release.json). Default: "exponential".
    METHOD_PREVIEW_WORKSPACE_SLUGS: z.string().optional(),
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
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SMTP_SECURE: process.env.SMTP_SECURE,
    EMAIL_FROM: process.env.EMAIL_FROM,
    AUTH_LOG_SIGN_IN_CODES: process.env.AUTH_LOG_SIGN_IN_CODES,
    CRON_SECRET: process.env.CRON_SECRET,
    MICROSOFT_ENTRA_ID_CLIENT_ID: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID,
    MICROSOFT_ENTRA_ID_CLIENT_SECRET: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET,
    MICROSOFT_ENTRA_ID_TENANT_ID: process.env.MICROSOFT_ENTRA_ID_TENANT_ID,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_ENCRYPTION_KEY: process.env.DATABASE_ENCRYPTION_KEY,
    DATABASE_ENCRYPTION_KEY_PREVIOUS: process.env.DATABASE_ENCRYPTION_KEY_PREVIOUS,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    METHOD_PREVIEW_WORKSPACE_SLUGS: process.env.METHOD_PREVIEW_WORKSPACE_SLUGS,
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
