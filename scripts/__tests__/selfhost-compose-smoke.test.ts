// @vitest-environment node
/**
 * The pure parts of the Compose smoke test (`scripts/selfhost/composeSmoke.ts`):
 * reading the sign-in code and the scheduler's tick out of `docker compose
 * logs`, and carrying Auth.js's cookies between requests. The HTTP and Docker
 * side runs for real in `.github/workflows/selfhost-smoke.yml`.
 */

import { describe, expect, it } from "vitest";
import { CookieJar, findSignInCode, schedulerTicked, sessionEmail } from "../selfhost/composeSmoke";

/** The D4 contract line, as `docker compose logs app` prints it. */
const codeLine = (email: string, code: string) =>
  `app-1  | [auth] Sign-in code for ${email}: ${code} (AUTH_LOG_SIGN_IN_CODES is on: anyone who can read this log can sign in)`;

describe("findSignInCode", () => {
  it("reads the code logged for that email", () => {
    const logs = ["app-1  | [selfhost] Starting Exponential on port 3000…", codeLine("smoke@example.com", "AB12-CD34")].join(
      "\n",
    );
    expect(findSignInCode(logs, "smoke@example.com")).toBe("AB12-CD34");
  });

  it("takes the newest code when several were sent (older ones are retired)", () => {
    const logs = [codeLine("smoke@example.com", "AAAA-1111"), codeLine("smoke@example.com", "BBBB-2222")].join("\n");
    expect(findSignInCode(logs, "smoke@example.com")).toBe("BBBB-2222");
  });

  it("ignores codes for other addresses, including ones that merely contain it", () => {
    const logs = [codeLine("other@example.com", "AAAA-1111"), codeLine("xsmoke@example.com", "CCCC-3333")].join("\n");
    expect(findSignInCode(logs, "smoke@example.com")).toBeNull();
  });

  it("treats the email's dots literally", () => {
    expect(findSignInCode(codeLine("smokeXexample.com", "AAAA-1111"), "smoke.example.com")).toBeNull();
  });

  it("reads through ANSI colour codes", () => {
    const logs = `\u001b[36mapp-1  | \u001b[0m${codeLine("smoke@example.com", "AB12-CD34").slice(9)}`;
    expect(findSignInCode(logs, "smoke@example.com")).toBe("AB12-CD34");
  });

  it("returns null before any code has been logged", () => {
    expect(findSignInCode("app-1  | ready", "smoke@example.com")).toBeNull();
  });
});

describe("schedulerTicked", () => {
  it("sees a 200 from the agent-runs route", () => {
    const logs = "scheduler-1  | [scheduler] GET /api/cron/agent-runs → 200 in 812ms";
    expect(schedulerTicked(logs, "/api/cron/agent-runs")).toBe(true);
  });

  it("does not count other statuses or other routes", () => {
    const logs = [
      "scheduler-1  | [scheduler] GET /api/cron/agent-runs → 401 in 12ms",
      "scheduler-1  | [scheduler] GET /api/cron/agent-runs-extra → 200 in 12ms",
      "scheduler-1  | [scheduler] GET /api/cron/sync-calendars → 200 in 40ms",
    ].join("\n");
    expect(schedulerTicked(logs, "/api/cron/agent-runs")).toBe(false);
  });
});

describe("sessionEmail", () => {
  it("reads the signed-in user's email from /api/auth/session", () => {
    expect(sessionEmail({ user: { email: "smoke@example.com" }, expires: "2026-12-12" })).toBe("smoke@example.com");
  });

  it("is null for a signed-out session", () => {
    expect(sessionEmail(null)).toBeNull();
    expect(sessionEmail({})).toBeNull();
  });
});

describe("CookieJar", () => {
  it("sends back what the server set, by name", () => {
    const jar = new CookieJar();
    jar.store(["authjs.csrf-token=abc%7Cdef; Path=/; HttpOnly; SameSite=Lax", "authjs.callback-url=http%3A%2F%2Flocalhost; Path=/"]);
    expect(jar.header()).toBe("authjs.csrf-token=abc%7Cdef; authjs.callback-url=http%3A%2F%2Flocalhost");
  });

  it("replaces a cookie the server sets again", () => {
    const jar = new CookieJar();
    jar.store(["a=1; Path=/"]);
    jar.store(["a=2; Path=/"]);
    expect(jar.header()).toBe("a=2");
  });

  it("drops a cookie the server clears", () => {
    const jar = new CookieJar();
    jar.store(["a=1; Path=/", "b=2; Path=/"]);
    jar.store(["a=; Path=/; Max-Age=0"]);
    expect(jar.header()).toBe("b=2");
  });

});
