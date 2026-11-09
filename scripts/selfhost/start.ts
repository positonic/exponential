/**
 * Self-host start command: `npm run start:selfhost`.
 *
 * What a self-host install (an operator's own Railway project or Docker host)
 * runs instead of `npm start`. In order, and any failing step exits 1 with one
 * readable line:
 *
 *   1. Defaults — trust the Host header (AUTH_TRUST_HOST), production mode.
 *   2. Apply pending migrations (`prisma migrate deploy`; Prisma's advisory
 *      lock makes concurrent starts safe).
 *   3. Serve (`next start`, which honours PORT, default 3000).
 *
 * exponential.im never runs this: Vercel builds with `vercel.json`'s
 * buildCommand, migrations run from `.github/workflows/prisma-migrate.yml`, and
 * `npm start` stays `next start`.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

/** Run a local binary (node_modules/.bin) with inherited stdio; resolve with its exit code. */
function run(bin: string, args: string[]): Promise<number> {
  const binDir = path.join(process.cwd(), "node_modules", ".bin");
  const child = spawn(bin, args, {
    stdio: "inherit",
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
  });
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

async function migrate(): Promise<void> {
  console.log("[selfhost] Applying database migrations (prisma migrate deploy)…");
  const code = await run("prisma", ["migrate", "deploy"]);
  if (code !== 0) {
    throw new StartupError(`prisma migrate deploy failed (exit ${code}); see the Prisma output above.`);
  }
}

export async function main(): Promise<number> {
  applySelfHostDefaults(process.env);
  await migrate();
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
