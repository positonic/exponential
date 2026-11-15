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
 *   docker compose down && docker compose up -d
 *   npx tsx scripts/selfhost/composeSmoke.ts restart
 *
 * first-boot  wait for /api/health; claim the install the way an operator
 *             does (ADR-0081): read the setup token from the boot banner in
 *             `docker compose logs app`, POST it with SMOKE_EMAIL to the
 *             `setup` credentials provider (what /setup's form does), and
 *             check the session is SMOKE_EMAIL's and /setup now 404s. Then
 *             check log delivery still refuses a code to anyone but the
 *             instance admin, and sign in as the admin with a log-delivered
 *             sign-in code (GET /api/auth/csrf -> POST
 *             /api/auth/signin/postmark -> read the code from the log -> GET
 *             the URL buildSignInCodeCallbackUrl builds -> GET
 *             /api/auth/session returns the email); then wait for the
 *             scheduler's `GET /api/cron/agent-runs → 200`. Saves the session
 *             cookie and a digest of the generated secrets to SMOKE_STATE_DIR.
 * restart     after `down` / `up` (volumes kept): secrets-init kept the
 *             secrets, their digest is unchanged, the claimed install printed
 *             no new setup token, and the saved session is still signed in.
 *
 * Settings (all optional): SMOKE_BASE_URL (default http://localhost:$APP_PORT,
 * APP_PORT default 3000), SMOKE_EMAIL, SMOKE_STATE_DIR (default
 * $TMPDIR/selfhost-smoke/$COMPOSE_PROJECT_NAME). `docker compose` picks up
 * COMPOSE_PROJECT_NAME, COMPOSE_FILE and COMPOSE_PROFILES from the environment
 * as usual.
 *
 * Runs under tsx with no `npm install`: it imports only Node builtins and the
 * dependency-free `src/lib/signInCode.ts`.
 */

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
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

/**
 * The newest setup token in the boot banner `start:selfhost` prints while the
 * install has no admin (`formatSetupTokenBanner` in scripts/selfhost/preflight.ts):
 * a line holding only `[selfhost]` and the token, four groups of five.
 * Newest, because every boot replaces the previous token.
 */
export function findSetupToken(logs: string): string | null {
  const line = /\[selfhost\]\s+([0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5})\s*$/gm;
  const matches = [...logs.replace(ANSI, "").matchAll(line)];
  return matches.at(-1)?.[1] ?? null;
}

/** Whether the boot log carries the "no admin yet" setup banner. */
export function printedSetupBanner(logs: string): boolean {
  return logs.replace(ANSI, "").includes("This install has no admin yet");
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

  static fromJSON(entries: [string, string][]): CookieJar {
    const jar = new CookieJar();
    for (const [name, value] of entries) jar.cookies.set(name, value);
    return jar;
  }

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

  toJSON(): [string, string][] {
    return [...this.cookies];
  }
}

// ---------------------------------------------------------------------------
// The smoke test
// ---------------------------------------------------------------------------

/** Exit with one readable line. */
class SmokeFailure extends Error {}

const execFileAsync = promisify(execFile);

const SECRETS_FILE = "/selfhost-secrets/selfhost.env";
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

async function composeExec(service: string, command: string[]): Promise<string> {
  const { stdout } = await execFileAsync("docker", ["compose", "exec", "-T", service, ...command]);
  return stdout;
}

/** Poll `check` every `everyMs` until it returns a value, or fail after `timeoutMs`. */
async function waitFor<T>(what: string, timeoutMs: number, check: () => Promise<T | null>, everyMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  for (;;) {
    const value = await check().catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : String(error);
      return null;
    });
    if (value !== null) return value;
    if (Date.now() > deadline) {
      const cause = lastError ? ` (last error: ${lastError.trim().split("\n")[0]})` : "";
      throw new SmokeFailure(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}${cause}`);
    }
    await sleep(everyMs);
  }
}

interface Smoke {
  baseUrl: string;
  email: string;
  stateDir: string;
}

/** Someone who is not the instance admin: log delivery must refuse them a code. */
const STRANGER_EMAIL = "selfhost-smoke-stranger@example.com";
const EMAIL_SIGN_IN_UNAVAILABLE = "EmailSignInUnavailable"; // src/lib/signInErrors.ts

function readSettings(env: NodeJS.ProcessEnv): Smoke {
  return {
    baseUrl: (env.SMOKE_BASE_URL ?? `http://localhost:${env.APP_PORT ?? "3000"}`).replace(/\/+$/, ""),
    email: normalizeSignInEmail(env.SMOKE_EMAIL ?? "selfhost-smoke@example.com"),
    stateDir: path.resolve(
      env.SMOKE_STATE_DIR ?? path.join(os.tmpdir(), "selfhost-smoke", env.COMPOSE_PROJECT_NAME ?? "default"),
    ),
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

async function csrfToken(smoke: Smoke, jar: CookieJar): Promise<string> {
  const csrf = await request(smoke, jar, "/api/auth/csrf");
  const { csrfToken: token } = (await csrf.json()) as { csrfToken?: string };
  if (!csrf.ok || !token) throw new SmokeFailure(`GET /api/auth/csrf → ${csrf.status} with no csrfToken`);
  return token;
}

/** POST a form to an Auth.js endpoint; returns the status and the redirect target. */
async function postForm(
  smoke: Smoke,
  jar: CookieJar,
  pathname: string,
  fields: Record<string, string>,
): Promise<{ status: number; location: string }> {
  const response = await request(smoke, jar, pathname, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  return { status: response.status, location: response.headers.get("location") ?? "" };
}

/**
 * First-run setup (ADR-0081): what an operator does after the first boot.
 * Takes the setup token from the boot log and posts it with SMOKE_EMAIL to the
 * `setup` credentials provider, exactly as /setup's form does via
 * `signIn("setup", …)`. That makes SMOKE_EMAIL the instance admin, which is
 * also what lets log delivery send it sign-in codes afterwards.
 */
async function claimInstall(smoke: Smoke): Promise<void> {
  const before = await fetch(`${smoke.baseUrl}/setup`, { redirect: "manual" });
  if (before.status !== 200) throw new SmokeFailure(`GET /setup on a fresh install → ${before.status}, expected 200`);

  const token = await waitFor("the setup token in `docker compose logs app`", CODE_TIMEOUT_MS, async () =>
    findSetupToken(await composeLogs("app")),
  );
  log("setup token found in the boot log");

  const jar = new CookieJar();
  const claim = await postForm(smoke, jar, "/api/auth/callback/setup", {
    email: smoke.email,
    token,
    csrfToken: await csrfToken(smoke, jar),
    callbackUrl: `${smoke.baseUrl}/home`,
  });
  if (claim.status !== 302 || /[?&]error=/.test(claim.location)) {
    throw new SmokeFailure(`POST /api/auth/callback/setup → ${claim.status} ${claim.location}`.trim());
  }
  const email = await currentSessionEmail(smoke, jar);
  if (email !== smoke.email) {
    throw new SmokeFailure(`after the setup claim, /api/auth/session returned ${JSON.stringify(email)}, expected ${smoke.email}`);
  }

  const after = await fetch(`${smoke.baseUrl}/setup`, { redirect: "manual" });
  if (after.status !== 404) throw new SmokeFailure(`GET /setup after the claim → ${after.status}, expected 404`);
  log(`claimed the install as ${email}; /setup is closed`);
}

/** With no email transport, a code request from anyone but the instance admin is refused. */
async function expectStrangerRefused(smoke: Smoke): Promise<void> {
  const jar = new CookieJar();
  const send = await postForm(smoke, jar, "/api/auth/signin/postmark", {
    email: STRANGER_EMAIL,
    csrfToken: await csrfToken(smoke, jar),
    callbackUrl: `${smoke.baseUrl}/`,
  });
  if (!send.location.includes(`error=${EMAIL_SIGN_IN_UNAVAILABLE}`)) {
    throw new SmokeFailure(
      `a code request for ${STRANGER_EMAIL} (not the admin) → ${send.status} ${send.location}, expected error=${EMAIL_SIGN_IN_UNAVAILABLE}`,
    );
  }
  if (findSignInCode(await composeLogs("app"), STRANGER_EMAIL)) {
    throw new SmokeFailure(`a sign-in code for ${STRANGER_EMAIL} (not the admin) reached the log`);
  }
  log(`log delivery refuses ${STRANGER_EMAIL}: ${EMAIL_SIGN_IN_UNAVAILABLE}`);
}

async function signIn(smoke: Smoke): Promise<CookieJar> {
  const jar = new CookieJar();

  const callbackUrl = `${smoke.baseUrl}/`;
  const send = await postForm(smoke, jar, "/api/auth/signin/postmark", {
    email: smoke.email,
    csrfToken: await csrfToken(smoke, jar),
    callbackUrl,
  });
  if (send.status !== 302 || /[?&]error=/.test(send.location)) {
    throw new SmokeFailure(`POST /api/auth/signin/postmark → ${send.status} ${send.location}`.trim());
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

async function secretsDigest(): Promise<string> {
  const out = await composeExec("app", ["sha256sum", SECRETS_FILE]);
  const digest = out.trim().split(/\s+/)[0];
  if (!digest) throw new SmokeFailure(`could not read a digest of ${SECRETS_FILE} in the app container`);
  return digest;
}

async function firstBoot(smoke: Smoke): Promise<void> {
  await waitForHealth(smoke);
  await claimInstall(smoke);
  await expectStrangerRefused(smoke);
  const jar = await signIn(smoke);

  await waitFor("the scheduler's `GET /api/cron/agent-runs → 200`", TICK_TIMEOUT_MS, async () =>
    schedulerTicked(await composeLogs("scheduler"), "/api/cron/agent-runs") ? true : null,
  );
  log("scheduler ticked: GET /api/cron/agent-runs → 200");

  mkdirSync(smoke.stateDir, { recursive: true });
  writeFileSync(
    path.join(smoke.stateDir, "state.json"),
    JSON.stringify({ email: smoke.email, cookies: jar, secretsDigest: await secretsDigest() }, null, 2),
  );
  log(`saved the session and secrets digest to ${smoke.stateDir}`);
}

async function restart(smoke: Smoke): Promise<void> {
  const state = JSON.parse(readFileSync(path.join(smoke.stateDir, "state.json"), "utf8")) as {
    email: string;
    cookies: [string, string][];
    secretsDigest: string;
  };
  await waitForHealth(smoke);

  if (!(await composeLogs("secrets-init")).includes("Keeping the existing secrets")) {
    throw new SmokeFailure("secrets-init did not report keeping the existing secrets on restart");
  }
  if ((await secretsDigest()) !== state.secretsDigest) {
    throw new SmokeFailure("the generated secrets changed across down/up");
  }
  log("secrets kept across down/up");

  if (printedSetupBanner(await composeLogs("app"))) {
    throw new SmokeFailure("the claimed install printed a setup token again on restart");
  }
  log("no setup token on restart: the install stays claimed");

  const email = await currentSessionEmail(smoke, CookieJar.fromJSON(state.cookies));
  if (email !== state.email) {
    throw new SmokeFailure(`the session from before the restart is gone (session email ${JSON.stringify(email)})`);
  }
  log(`the session from before the restart is still signed in as ${email}`);
}

export async function main(argv: string[]): Promise<void> {
  const phase = argv[0] ?? "first-boot";
  const smoke = readSettings(process.env);
  if (phase === "first-boot") await firstBoot(smoke);
  else if (phase === "restart") await restart(smoke);
  else throw new SmokeFailure(`unknown phase ${JSON.stringify(phase)}: use first-boot or restart`);
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
