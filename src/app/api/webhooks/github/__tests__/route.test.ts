/**
 * Unit tests for the GitHub webhook's signature verification (public-launch
 * hardening, ticket quiet.panther).
 *
 * The receiver must fail CLOSED when GITHUB_WEBHOOK_SECRET is unset (503,
 * matching the Notion and Sentry receivers), reject malformed signatures with
 * a 401 rather than throwing, and accept only correctly signed deliveries.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

vi.mock("~/server/services/github-integration", () => ({
  githubIntegrationService: {},
}));
vi.mock("~/server/services/GitHubActivityService", () => ({
  githubActivityService: {
    processPushEvent: vi.fn(),
    processPullRequestEvent: vi.fn(),
    processPullRequestReviewEvent: vi.fn(),
  },
}));

import type { NextRequest } from "next/server";
import { POST } from "../route";

const SECRET = "test-github-webhook-secret";
const PING_BODY = JSON.stringify({ zen: "Keep it logically awesome." });

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function makeRequest(opts: {
  body?: string;
  signature?: string | null;
  event?: string | null;
  delivery?: string | null;
}) {
  const body = opts.body ?? PING_BODY;
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.signature) headers.set("x-hub-signature-256", opts.signature);
  if (opts.event !== null) headers.set("x-github-event", opts.event ?? "ping");
  if (opts.delivery !== null)
    headers.set("x-github-delivery", opts.delivery ?? "test-delivery-1");
  return new Request("http://localhost/api/webhooks/github", {
    method: "POST",
    headers,
    body,
  }) as unknown as NextRequest;
}

describe("GitHub webhook signature verification", () => {
  const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;

  beforeEach(() => {
    mockReset(getDbMock());
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
    else process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
  });

  it("accepts a correctly signed delivery", async () => {
    const res = await POST(makeRequest({ signature: sign(PING_BODY, SECRET) }));
    expect(res.status).toBe(200);
  });

  it("rejects a delivery signed under the wrong secret with 401", async () => {
    const res = await POST(
      makeRequest({ signature: sign(PING_BODY, "some-other-secret") }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a malformed, short signature with 401 instead of throwing", async () => {
    // timingSafeEqual throws on length mismatch; a truncated header used to
    // surface as an unhandled exception and a 500.
    const res = await POST(makeRequest({ signature: "sha256=abc" }));
    expect(res.status).toBe(401);
  });

  it("rejects a signature with the wrong prefix and length with 401", async () => {
    const res = await POST(
      makeRequest({ signature: sign(PING_BODY, SECRET).replace("sha256=", "sha1=") }),
    );
    expect(res.status).toBe(401);
  });

  it("refuses every request with 503 when GITHUB_WEBHOOK_SECRET is unset", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    // Even a correctly signed request must be refused: with no configured
    // secret there is nothing trustworthy to verify against.
    const res = await POST(makeRequest({ signature: sign(PING_BODY, SECRET) }));
    expect(res.status).toBe(503);
  });

  it("rejects a request missing the signature header with 400", async () => {
    const res = await POST(makeRequest({ signature: null }));
    expect(res.status).toBe(400);
  });
});
