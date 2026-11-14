/**
 * `GET /api/auth/native/start` with nothing to resume — the stale-callback-url
 * case. Auth.js remembers the last sign-in's callbackUrl in a cookie, and the
 * native handshake sets it to this route, so a later web sign-out landed here
 * with no query and no request cookie and got a bare "Bad request." page.
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
});

const authMock = vi.fn();
vi.mock("~/server/auth", () => ({ auth: () => authMock() }));

const { GET } = await import("../route");

const ORIGIN = "https://www.exponential.im";

describe("GET /api/auth/native/start", () => {
  it("redirects home when there is no handshake in flight", async () => {
    const res = await GET(new NextRequest(`${ORIGIN}/api/auth/native/start`));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
    expect(authMock).not.toHaveBeenCalled();
  });

  it("still rejects a malformed handshake", async () => {
    const res = await GET(
      new NextRequest(`${ORIGIN}/api/auth/native/start?redirect_uri=https://evil.example/cb`),
    );

    expect(res.status).toBe(400);
  });
});
