/**
 * Self-host preflight: the checks `start:selfhost` runs before migrating, so a
 * misconfigured install fails at once with one line that says what to fix,
 * rather than halfway through 274 migrations or at the first sign-in.
 *
 * The decisions are pure functions (unit-tested in
 * scripts/__tests__/selfhost-preflight.test.ts); `start.ts` does the I/O.
 */

import {
  resolveSignInMethods,
  signInMethodWarnings,
  type SignInEnv,
} from "../../src/server/auth/signInMethods";
import { aiCapabilityLines } from "../../src/server/services/ai/capabilities";

/** The `vector` row of `pg_available_extensions`, or undefined when there is none. */
export interface PgvectorRow {
  default_version: string | null;
  installed_version: string | null;
}

export type PgvectorCheck =
  | { ok: true; installed: boolean }
  | { ok: false; message: string };

/** HNSW indexes (`USING hnsw (embedding vector_cosine_ops)`) arrived in pgvector 0.5.0. */
const MIN_PGVECTOR = [0, 5, 0] as const;

export const PGVECTOR_MISSING_MESSAGE =
  "This Postgres does not provide the pgvector extension, which Exponential needs (vector(1536) columns and an HNSW index). Use a pgvector image such as pgvector/pgvector:pg16.";

function parseVersion(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function isAtLeast(version: string, minimum: readonly number[]): boolean {
  const parts = parseVersion(version);
  for (let index = 0; index < minimum.length; index++) {
    const have = parts[index] ?? 0;
    const want = minimum[index] ?? 0;
    if (have !== want) return have > want;
  }
  return true;
}

/**
 * Decide whether this database can hold Exponential's schema.
 *
 * - No `vector` row: the server doesn't ship pgvector at all. Fail.
 * - Below 0.5.0: no HNSW. Fail, naming pgvector.
 * - Available but not installed: fine, the knowledge-base migration runs
 *   `CREATE EXTENSION IF NOT EXISTS vector`.
 */
export function checkPgvector(row: PgvectorRow | undefined): PgvectorCheck {
  if (!row?.default_version) return { ok: false, message: PGVECTOR_MISSING_MESSAGE };

  const version = row.installed_version ?? row.default_version;
  if (!isAtLeast(version, MIN_PGVECTOR)) {
    return {
      ok: false,
      message: `This Postgres provides pgvector ${version}, but Exponential needs pgvector 0.5.0 or newer for its HNSW index. Use a newer pgvector image such as pgvector/pgvector:pg16.`,
    };
  }
  return { ok: true, installed: row.installed_version !== null };
}

/**
 * Rewrite a failed `prisma migrate deploy` that tripped over creating the
 * extension, so the operator learns it is a pgvector privilege problem rather
 * than reading a Prisma stack.
 */
export function explainMigrationFailure(output: string): string | null {
  if (/permission denied to create extension "vector"|must be superuser to create this extension/i.test(output)) {
    return 'The database user may not create the pgvector extension. Run CREATE EXTENSION vector as a superuser on this database, then start again.';
  }
  if (/extension "vector" is not available|could not open extension control file .*vector/i.test(output)) {
    return PGVECTOR_MISSING_MESSAGE;
  }
  return null;
}

/**
 * The public URL (AUTH_URL, else NEXTAUTH_URL) must be an http(s) URL with a
 * host when it is set. A template that builds it from a platform variable,
 * like Railway's `https://${{RAILWAY_PUBLIC_DOMAIN}}`, gets a bare `https://`
 * when the service has no public domain yet; the app would start, then every
 * sign-in page would fail with "Invalid URL". Unset is fine: the app falls
 * back to localhost.
 */
export function checkPublicUrl(env: SignInEnv): string | null {
  for (const name of ["AUTH_URL", "NEXTAUTH_URL"] as const) {
    const value = env[name]?.trim();
    if (!value) continue;
    let parsed: URL | null = null;
    try {
      parsed = new URL(value);
    } catch {
      parsed = null;
    }
    if (!parsed || !/^https?:$/.test(parsed.protocol) || parsed.hostname === "") {
      return `${name} is ${JSON.stringify(value)}, which is not a URL with a host. Set it to the address people use to reach this install, e.g. https://exponential.example.com. On Railway, generate a public domain for the app service, then redeploy it.`;
    }
    // AUTH_URL wins when both are set, so NEXTAUTH_URL doesn't matter then.
    return null;
  }
  return null;
}

/**
 * Condense a successful `prisma migrate deploy` for the boot log. On a fresh
 * database it lists every migration three or four times (found, applying,
 * applied tree): over a thousand lines in about a second, which is more than
 * a platform log will take (Railway drops lines past 500 a second). Keep
 * Prisma's own summary lines, drop the per-migration ones, and count what was
 * applied. A failed run is printed in full instead (see start.ts).
 */
export function summarizeMigrateOutput(output: string): string[] {
  let applied = 0;
  const kept: string[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("Applying migration `")) {
      applied++;
      continue;
    }
    // The migration directory trees: "migrations/", "  └─ 2026…/", "    └─ migration.sql".
    if (/^\s*(└─|migrations\/$)/.test(line)) continue;
    if (line === "" && (kept.length === 0 || kept[kept.length - 1] === "")) continue;
    kept.push(line);
  }
  while (kept[kept.length - 1] === "") kept.pop();
  if (applied > 0) kept.push(`[selfhost] Applied ${applied} migration${applied === 1 ? "" : "s"}.`);
  return kept;
}

export interface EnvPreflight {
  /** Set when startup must stop. */
  error: string | null;
  /** Printed either way. */
  lines: string[];
}

/**
 * The env checks t3-env can't express (it validates each field on its own):
 * SMTP needs a sender. Also reports the active sign-in methods, and warns —
 * without failing — when log delivery is on or there is no way in at all; the
 * `/signin` setup error is the user-facing path for that. Last, which AI
 * features are on and the variable that turns on each one that isn't: AI is
 * optional, so this never stops startup.
 */
export function preflightEnv(env: SignInEnv): EnvPreflight {
  const has = (name: string) => (env[name] ?? "").length > 0;

  const publicUrlError = checkPublicUrl(env);
  if (publicUrlError) return { error: publicUrlError, lines: [] };

  if (has("SMTP_HOST") && !has("EMAIL_FROM") && !has("AUTH_POSTMARK_FROM")) {
    return {
      error: "SMTP_HOST is set but there is no sender. Set EMAIL_FROM to the address sign-in codes and other email should come from.",
      lines: [],
    };
  }

  const methods = resolveSignInMethods(env);
  const active = [
    methods.google && "Google",
    methods.discord && "Discord",
    methods.notion && "Notion",
    methods.microsoft && "Microsoft",
    methods.emailDelivery === "postmark" && "email codes (Postmark)",
    methods.emailDelivery === "smtp" && "email codes (SMTP)",
    methods.emailDelivery === "log" && "sign-in codes in the server log (instance admin only)",
  ].filter((method): method is string => typeof method === "string");

  const lines =
    active.length > 0
      ? [`[selfhost] Sign-in methods: ${active.join(", ")}`]
      : [
          `[selfhost] WARNING: no sign-in method is configured. An unclaimed install can still be claimed once at /setup with the setup token, but once that admin signs out nobody can sign in, and /signin shows a setup error. Set one of: ${methods.missing.join(", ")}.`,
        ];

  return { error: null, lines: [...lines, ...signInMethodWarnings(env), ...aiCapabilityLines(env)] };
}

/**
 * The boot-log block that hands the operator the one-time **Setup token**
 * while the install has no instance admin. Every line carries the `[selfhost]`
 * prefix so a platform log search finds the whole block.
 */
export function formatSetupTokenBanner(input: {
  token: string;
  expiresAt: Date;
  /** The install's public URL (AUTH_URL / NEXTAUTH_URL), when the operator set one. */
  baseUrl: string | undefined;
}): string[] {
  const where = input.baseUrl
    ? `${input.baseUrl.replace(/\/+$/, "")}/setup`
    : "/setup on this install";
  return [
    "[selfhost] ================================================================",
    "[selfhost] This install has no admin yet. To claim it, open",
    `[selfhost]   ${where}`,
    "[selfhost] and enter your email address with this setup token:",
    `[selfhost]   ${input.token}`,
    `[selfhost] It works once, and only until ${input.expiresAt.toISOString()} or the next restart,`,
    "[selfhost] whichever comes first. Whoever claims it becomes the instance admin and",
    "[selfhost] sign-up becomes invite-only.",
    "[selfhost] ================================================================",
  ];
}
