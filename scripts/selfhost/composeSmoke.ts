/**
 * Self-host smoke test for the Docker Compose stack.
 *
 * Drives a running stack (`docker compose up`) through its real HTTP surface
 * and its logs, the way an operator would, and exits 1 with one readable line
 * on the first thing that fails. `.github/workflows/selfhost-smoke.yml` runs
 * it; it runs the same way locally:
 *
 *   docker compose up -d --build
 *   npx tsx scripts/selfhost/composeSmoke.ts first-boot
 *
 * first-boot  wait for /api/health; sign in with a log-delivered sign-in code
 *             (GET /api/auth/csrf -> POST /api/auth/signin/postmark -> read
 *             the code from `docker compose logs app` -> GET the URL
 *             buildSignInCodeCallbackUrl builds -> GET /api/auth/session
 *             returns the email); then wait for the scheduler's
 *             `GET /api/cron/agent-runs → 200`.
 *
 * Settings (all optional): SMOKE_BASE_URL (default http://localhost:$APP_PORT,
 * APP_PORT default 3000), SMOKE_EMAIL. `docker compose` picks up
 * COMPOSE_PROJECT_NAME, COMPOSE_FILE and COMPOSE_PROFILES from the environment
 * as usual.
 *
 * Runs under tsx with no `npm install`: it imports only Node builtins and the
 * dependency-free `src/lib/signInCode.ts`.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { buildSignInCodeCallbackUrl, normalizeSignInEmail } from "../../src/lib/signInCode";

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in scripts/__tests__/selfhost-compose-smoke.test.ts)
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex -- matching the ESC byte is the point
const ANSI = /\u001b\[[0-9;]*m/g;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The newest sign-in code the app logged for `email`, from the D4 contract
 * line `[auth] Sign-in code for <email>: XXXX-XXXX (AUTH_LOG_SIGN_IN_CODES …`.
 * Newest, because sending a new code retires the older ones.
 */
export function findSignInCode(logs: string, email: string): string | null {
  const line = new RegExp(
    `\\[auth\\] Sign-in code for ${escapeRegExp(normalizeSignInEmail(email))}: ([0-9A-Z]{4}-[0-9A-Z]{4}) \\(`,
    "g",
  );
  const matches = [...logs.replace(ANSI, "").matchAll(line)];
  return matches.at(-1)?.[1] ?? null;
}

/** Whether the scheduler logged a 200 from `cronPath`. */
export function schedulerTicked(logs: string, cronPath: string): boolean {
  return new RegExp(`\\[scheduler\\] GET ${escapeRegExp(cronPath)} → 200\\b`).test(logs.replace(ANSI, ""));
}

/** The signed-in user's email from an `/api/auth/session` body, or null. */
export function sessionEmail(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const user = (body as { user?: { email?: unknown } }).user;
  return typeof user?.email === "string" ? user.email : null;
}

/** Just enough of a cookie jar for one origin: name -> value, in set order. */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  /** Apply a response's Set-Cookie headers. */
  store(setCookies: string[]): void {
    for (const setCookie of setCookies) {
      const [pair = "", ...attributes] = setCookie.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const cleared =
        value === "" ||
        attributes.some((attribute) => /^\s*max-age\s*=\s*(0|-\d+)\s*$/i.test(attribute));
      if (cleared) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /** The Cookie request header. */
  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

}

// ---------------------------------------------------------------------------
// The smoke test
// ---------------------------------------------------------------------------

/** Exit with one readable line. */
class SmokeFailure extends Error {}

const execFileAsync = promisify(execFile);

const HEALTH_TIMEOUT_MS = 10 * 60_000; // first boot applies every migration
const CODE_TIMEOUT_MS = 60_000;
const TICK_TIMEOUT_MS = 2 * 60_000; // agent-runs fires every minute

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (line: string) => console.log(`[smoke] ${line}`);

async function composeLogs(service: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", ["compose", "logs", "--no-color", service], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/** Poll `check` every `everyMs` until it returns a value, or fail after `timeoutMs`. */
async function waitFor<T>(what: string, timeoutMs: number, check: () => Promise<T | null>, everyMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check().catch(() => null);
    if (value !== null) return value;
    if (Date.now() > deadline) throw new SmokeFailure(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}`);
    await sleep(everyMs);
  }
}

interface Smoke {
  baseUrl: string;
  email: string;
}

function readSettings(env: NodeJS.ProcessEnv): Smoke {
  return {
    baseUrl: (env.SMOKE_BASE_URL ?? `http://localhost:${env.APP_PORT ?? "3000"}`).replace(/\/+$/, ""),
    email: normalizeSignInEmail(env.SMOKE_EMAIL ?? "selfhost-smoke@example.com"),
  };
}

/** A fetch against the app that sends and stores cookies and never follows redirects. */
async function request(smoke: Smoke, jar: CookieJar, pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = jar.header();
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${smoke.baseUrl}${pathAndQuery}`, { ...init, headers, redirect: "manual" });
  jar.store(response.headers.getSetCookie());
  return response;
}

async function waitForHealth(smoke: Smoke): Promise<void> {
  await waitFor(`${smoke.baseUrl}/api/health`, HEALTH_TIMEOUT_MS, async () => {
    const response = await fetch(`${smoke.baseUrl}/api/health`);
    return response.ok ? true : null;
  });
  log(`app is healthy at ${smoke.baseUrl}`);
}

async function currentSessionEmail(smoke: Smoke, jar: CookieJar): Promise<string | null> {
  const response = await request(smoke, jar, "/api/auth/session");
  if (!response.ok) throw new SmokeFailure(`GET /api/auth/session → ${response.status}`);
  return sessionEmail(await response.json());
}

async function signIn(smoke: Smoke): Promise<CookieJar> {
  const jar = new CookieJar();

  const csrf = await request(smoke, jar, "/api/auth/csrf");
  const { csrfToken } = (await csrf.json()) as { csrfToken?: string };
  if (!csrf.ok || !csrfToken) throw new SmokeFailure(`GET /api/auth/csrf → ${csrf.status} with no csrfToken`);

  const callbackUrl = `${smoke.baseUrl}/`;
  const send = await request(smoke, jar, "/api/auth/signin/postmark", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: smoke.email, csrfToken, callbackUrl }).toString(),
  });
  const sentTo = send.headers.get("location") ?? "";
  if (send.status !== 302 || /[?&]error=/.test(sentTo)) {
    throw new SmokeFailure(`POST /api/auth/signin/postmark → ${send.status} ${sentTo}`.trim());
  }
  log(`sign-in code requested for ${smoke.email}`);

  const code = await waitFor("the sign-in code in `docker compose logs app`", CODE_TIMEOUT_MS, async () =>
    findSignInCode(await composeLogs("app"), smoke.email),
  );
  log("sign-in code found in the app's log");

  const redeem = await request(smoke, jar, buildSignInCodeCallbackUrl({ email: smoke.email, code, callbackUrl }));
  const landedOn = redeem.headers.get("location") ?? "";
  if (redeem.status !== 302 || /[?&]error=/.test(landedOn)) {
    throw new SmokeFailure(`redeeming the code → ${redeem.status} ${landedOn}`.trim());
  }

  const email = await currentSessionEmail(smoke, jar);
  if (email !== smoke.email) {
    throw new SmokeFailure(`GET /api/auth/session returned ${JSON.stringify(email)}, expected ${smoke.email}`);
  }
  log(`signed in: /api/auth/session returns ${email}`);
  return jar;
}

async function firstBoot(smoke: Smoke): Promise<void> {
  await waitForHealth(smoke);
  await signIn(smoke);

  await waitFor("the scheduler's `GET /api/cron/agent-runs → 200`", TICK_TIMEOUT_MS, async () =>
    schedulerTicked(await composeLogs("scheduler"), "/api/cron/agent-runs") ? true : null,
  );
  log("scheduler ticked: GET /api/cron/agent-runs → 200");
}

export async function main(argv: string[]): Promise<void> {
  const phase = argv[0] ?? "first-boot";
  const smoke = readSettings(process.env);
  if (phase === "first-boot") await firstBoot(smoke);
  else throw new SmokeFailure(`unknown phase ${JSON.stringify(phase)}: use first-boot`);
  log(`${phase}: passed`);
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[smoke] FAILED: ${message}`);
      process.exit(1);
    },
  );
}
