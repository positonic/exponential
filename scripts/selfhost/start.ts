/**
 * Self-host start command: `npm run start:selfhost`.
 *
 * What a self-host install (an operator's own Railway project or Docker host)
 * runs instead of `npm start`. In order, and any failing step exits 1 with one
 * readable line:
 *
 *   1. Load `.env` files the way `next start` will (`@next/env`, production
 *      mode), so the preflight sees what the app will; then defaults — trust
 *      the Host header (AUTH_TRUST_HOST), production mode.
 *   2. Env preflight — `src/env.js` (the three required variables and the
 *      encryption key's shape), SMTP_HOST needs a sender, and the active
 *      sign-in methods, with loud warnings for log delivery or no way in.
 *   3. pgvector preflight — this Postgres must provide pgvector 0.5.0+.
 *   4. Apply pending migrations (`prisma migrate deploy`; Prisma's advisory
 *      lock makes concurrent starts safe).
 *   5. Reference data — the idempotent, user-independent part of the seed
 *      (LifeDomains, system Tags, default Differentiators and Audiences),
 *      which no migration inserts and first-run screens rely on. Never the
 *      whole of `prisma/seed.ts`.
 *   6. Setup token — while no instance admin exists, print a fresh one-time
 *      token for `/setup` (ADR-0081). Once the install is claimed, nothing.
 *   7. Serve (`next start`, which honours PORT, default 3000).
 *
 * exponential.im never runs this: Vercel builds with `vercel.json`'s
 * buildCommand, migrations run from `.github/workflows/prisma-migrate.yml`, and
 * `npm start` stays `next start`.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { seedReferenceData } from "../../prisma/referenceData";
import { issueSetupToken } from "../../src/server/services/instance/instanceSettings";
import {
  checkPgvector,
  explainMigrationFailure,
  formatSetupTokenBanner,
  preflightEnv,
  type PgvectorRow,
} from "./preflight";

/** Exit with one readable line. */
export class StartupError extends Error {}

/**
 * Env defaults a self-host install needs but an operator should never have to
 * know about. Only fills what is unset.
 *
 * `AUTH_TRUST_HOST`: `@auth/core` trusts the Host header only when AUTH_URL,
 * AUTH_TRUST_HOST, VERCEL or CF_PAGES is set (or outside production). Off
 * Vercel every auth request would otherwise fail with UntrustedHost.
 */
export function applySelfHostDefaults(env: Record<string, string | undefined>): void {
  env.AUTH_TRUST_HOST ??= "true";
  env.NODE_ENV ??= "production";
}

/**
 * Run a local binary (node_modules/.bin), resolving with its exit code. Output
 * goes straight to ours; with `capture`, it is also kept so a failure can be
 * explained.
 */
function run(bin: string, args: string[], capture?: string[]): Promise<number> {
  const binDir = path.join(process.cwd(), "node_modules", ".bin");
  const child = spawn(bin, args, {
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  if (capture) {
    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      capture.push(chunk.toString());
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      capture.push(chunk.toString());
    });
  }
  // Forward stop signals so a container stop reaches `next start` (and a
  // migration in flight) instead of orphaning it.
  // (Typed as a plain EventEmitter: electron's global `Process` overloads
  // narrow `process.on` to its own events.)
  const signals: NodeJS.EventEmitter = process;
  const forwardTerm = () => child.kill("SIGTERM");
  const forwardInt = () => child.kill("SIGINT");
  signals.on("SIGTERM", forwardTerm);
  signals.on("SIGINT", forwardInt);
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      signals.off("SIGTERM", forwardTerm);
      signals.off("SIGINT", forwardInt);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

async function preflightEnvironment(): Promise<void> {
  try {
    // Validates on import. t3-env prints each invalid variable first.
    await import("../../src/env.js");
  } catch {
    throw new StartupError(
      "Invalid environment (details above). Required: DATABASE_URL, AUTH_SECRET, DATABASE_ENCRYPTION_KEY; see .env.selfhost.example.",
    );
  }
  const { error, lines } = preflightEnv(process.env);
  if (error) throw new StartupError(error);
  for (const line of lines) console.log(line);
}

async function preflightPgvector(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let rows: PgvectorRow[];
  try {
    rows = await prisma.$queryRaw<PgvectorRow[]>`
      SELECT default_version, installed_version
      FROM pg_available_extensions
      WHERE name = 'vector'`;
  } catch (error) {
    const message = error instanceof Error ? error.message.trim().split("\n").pop() : String(error);
    throw new StartupError(`Could not query the database at DATABASE_URL: ${message}`);
  } finally {
    await prisma.$disconnect();
  }
  const result = checkPgvector(rows[0]);
  if (!result.ok) throw new StartupError(result.message);
}

async function migrate(): Promise<void> {
  console.log("[selfhost] Applying database migrations (prisma migrate deploy)…");
  const output: string[] = [];
  const code = await run("prisma", ["migrate", "deploy"], output);
  if (code !== 0) {
    throw new StartupError(
      explainMigrationFailure(output.join("")) ??
        `prisma migrate deploy failed (exit ${code}); see the Prisma output above.`,
    );
  }
}

/** Arbitrary, fixed: serialises reference-data writes across concurrent starts. */
const REFERENCE_DATA_LOCK = 7_061_002;

async function ensureReferenceData(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    // System tags are find-then-create (no unique key covers a null
    // workspaceId), so two replicas starting together could both insert.
    // A transaction-scoped advisory lock makes them take turns.
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFERENCE_DATA_LOCK})`;
        await seedReferenceData(tx);
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StartupError(`Could not write reference data: ${message}`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Print a fresh setup token while the install is unclaimed. Each boot replaces
 * the previous token, so an old log line stops working after a restart.
 */
async function printSetupTokenIfUnclaimed(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const issued = await issueSetupToken(prisma);
    if (!issued) return;
    const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    for (const line of formatSetupTokenBanner({ ...issued, baseUrl })) console.log(line);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StartupError(`Could not issue a setup token: ${message}`);
  } finally {
    await prisma.$disconnect();
  }
}

/** Load `.env*` with Next's own loader and precedence, in production mode. */
async function loadEnvFiles(): Promise<void> {
  // `@next/env` is CJS: under tsx the namespace may carry it on `default`.
  const envModule = (await import("@next/env")) as unknown as {
    default?: { loadEnvConfig: (dir: string, dev?: boolean) => void };
    loadEnvConfig?: (dir: string, dev?: boolean) => void;
  };
  const loadEnvConfig = envModule.default?.loadEnvConfig ?? envModule.loadEnvConfig;
  if (!loadEnvConfig) throw new StartupError("Could not load @next/env to read .env files.");
  loadEnvConfig(process.cwd(), false);
}

export async function main(): Promise<number> {
  await loadEnvFiles();
  applySelfHostDefaults(process.env);
  await preflightEnvironment();
  await preflightPgvector();
  await migrate();
  await ensureReferenceData();
  await printSetupTokenIfUnclaimed();
  console.log(`[selfhost] Starting Exponential on port ${process.env.PORT ?? "3000"}…`);
  return run("next", ["start"]);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[selfhost] Startup failed: ${message}`);
      process.exit(1);
    },
  );
}
