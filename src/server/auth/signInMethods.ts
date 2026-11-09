/**
 * Which ways in this install has — the one answer every sign-in surface reads.
 *
 * `authConfig.providers`, `auth.getConfiguredProviders`, `/signin`, the invite
 * page and the verify page all derive from `resolveSignInMethods`, so a provider
 * is offered exactly when it is registered, and an install with no way in says
 * so instead of failing at the first click.
 *
 * Pure, and imports nothing: `src/server/auth/config.ts` reads it, and
 * `middleware.ts` pulls that config into the Edge bundle.
 */

/**
 * Kill switch for Microsoft Entra ID sign-in. Set to `false` to disable the
 * "Sign in with Microsoft" option regardless of whether the
 * `MICROSOFT_ENTRA_ID_*` env vars are configured. The provider code and env
 * wiring are intentionally left in place so it can be re-enabled by flipping
 * this back to `true`.
 */
export const MICROSOFT_LOGIN_ENABLED = false;

export type EmailTransport = "postmark" | "smtp";
export type EmailDelivery = EmailTransport | "log" | null;

export interface SignInMethods {
  google: boolean;
  discord: boolean;
  notion: boolean;
  microsoft: boolean;
  /**
   * How a Sign-in code reaches the person: an email transport, the server log
   * (opt-in, single-user installs), or not at all.
   */
  emailDelivery: EmailDelivery;
  /** Empty when at least one way in exists, otherwise the env var names an operator could set. */
  missing: string[];
}

/** `process.env`, or any subset of it. */
export type SignInEnv = Partial<Record<string, string | undefined>>;

/**
 * The ways in an operator can configure, by variable name, in the order the
 * `/signin` setup error lists them. Names only — never values.
 */
export const SIGN_IN_SETUP_OPTIONS: ReadonlyArray<{ vars: readonly string[]; note: string }> = [
  { vars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], note: "Sign in with Google" },
  { vars: ["AUTH_DISCORD_ID", "AUTH_DISCORD_SECRET"], note: "Sign in with Discord" },
  {
    vars: ["SMTP_HOST", "EMAIL_FROM"],
    note: "Email sign-in codes over SMTP (add SMTP_USER and SMTP_PASSWORD if your server needs them)",
  },
  { vars: ["AUTH_POSTMARK_KEY"], note: "Email sign-in codes over Postmark" },
  {
    vars: ["AUTH_LOG_SIGN_IN_CODES"],
    note: "Set to true to write sign-in codes to the server log (single-user installs only)",
  },
];

/** Set means non-empty, matching t3-env's `emptyStringAsUndefined`. */
function isSet(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function bothSet(env: SignInEnv, a: string, b: string): boolean {
  return isSet(env[a]) && isSet(env[b]);
}

/**
 * The email transport configured in the environment, ignoring workspace
 * Postmark integrations (sign-in has no workspace).
 *
 * A Postmark key (`AUTH_POSTMARK_KEY ?? POSTMARK_SERVER_TOKEN`) wins over
 * `SMTP_HOST`. SMTP with no sender (`EMAIL_FROM ?? AUTH_POSTMARK_FROM`) counts
 * as not configured: an SMTP send must never fall back to exponential.im's
 * address.
 */
export function resolveEnvEmailTransport(env: SignInEnv): EmailTransport | null {
  if (isSet(env.AUTH_POSTMARK_KEY) || isSet(env.POSTMARK_SERVER_TOKEN)) return "postmark";
  if (isSet(env.SMTP_HOST) && (isSet(env.EMAIL_FROM) || isSet(env.AUTH_POSTMARK_FROM))) return "smtp";
  return null;
}

function isLogFlagOn(env: SignInEnv): boolean {
  return env.AUTH_LOG_SIGN_IN_CODES === "true" || env.AUTH_LOG_SIGN_IN_CODES === "1";
}

export function resolveSignInMethods(env: SignInEnv): SignInMethods {
  const transport = resolveEnvEmailTransport(env);
  const emailDelivery: EmailDelivery = transport ?? (isLogFlagOn(env) ? "log" : null);

  const methods = {
    google: bothSet(env, "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    discord: bothSet(env, "AUTH_DISCORD_ID", "AUTH_DISCORD_SECRET"),
    notion: bothSet(env, "NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"),
    microsoft:
      MICROSOFT_LOGIN_ENABLED && bothSet(env, "MICROSOFT_ENTRA_ID_CLIENT_ID", "MICROSOFT_ENTRA_ID_CLIENT_SECRET"),
    emailDelivery,
  };

  const hasWayIn =
    methods.google || methods.discord || methods.notion || methods.microsoft || emailDelivery !== null;

  return {
    ...methods,
    missing: hasWayIn ? [] : SIGN_IN_SETUP_OPTIONS.flatMap((option) => option.vars),
  };
}

/**
 * Operator warnings about sign-in configuration, one line each. Logged once at
 * auth config load and again by the self-host preflight.
 */
export function signInMethodWarnings(env: SignInEnv): string[] {
  const { emailDelivery } = resolveSignInMethods(env);
  if (emailDelivery === "log") {
    return [
      "[auth] WARNING: AUTH_LOG_SIGN_IN_CODES is on. Sign-in codes are written to the server log, and anyone who can read this log can sign in as anyone. Use it only for a single-user install, and configure SMTP or Postmark as soon as you can.",
    ];
  }
  if (isLogFlagOn(env) && emailDelivery !== null) {
    return [
      `[auth] AUTH_LOG_SIGN_IN_CODES is ignored because email delivery (${emailDelivery}) is configured. Sign-in codes are emailed, not logged.`,
    ];
  }
  return [];
}
