/**
 * Unit tests for the handled-client-error route. The route reads only
 * `request.json()`, so a tiny fake request is enough. Auth, the DB and the
 * ingest service are mocked so the route's own decisions — the env gate, the
 * kind filter, the rate limit, and never failing loudly — are what's under test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("~/server/db", () => ({ db: {} }));

const { ingestSentryBug, auth } = vi.hoisted(() => ({
  ingestSentryBug: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("~/server/services/sentry/SentryBugService", () => ({ ingestSentryBug }));
vi.mock("~/server/auth", () => ({ auth }));

import { POST } from "../route";

function fakeRequest(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest;
}

const report = {
  area: "chat-stream",
  kind: "model",
  message: "Your credit balance is too low",
};

/** Each test gets its own user so the module-level rate limiter can't bleed. */
let userSeq = 0;
function signedIn(): void {
  userSeq += 1;
  auth.mockResolvedValue({ user: { id: `user-${userSeq}` } });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLIENT_ERROR_BUGS = "1";
  ingestSentryBug.mockResolvedValue({ created: true, ticketId: "ticket-1" });
  signedIn();
});

afterEach(() => {
  delete process.env.CLIENT_ERROR_BUGS;
});

describe("POST /api/client-errors", () => {
  it("files a bug for a reportable failure", async () => {
    const res = await POST(fakeRequest(report));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ filed: true, ticketId: "ticket-1" });
    const [, bug, options] = ingestSentryBug.mock.calls[0]!;
    expect(bug.title).toContain("Your credit balance is too low");
    expect(options.body).toContain("never reached Sentry");
    // Labelled as what it is, so the "Sentry" label keeps meaning Sentry.
    expect(options.labels.map((l: { slug: string }) => l.slug)).toEqual([
      "client-error",
      "bug",
    ]);
  });

  it("stays off unless the environment opts in", async () => {
    delete process.env.CLIENT_ERROR_BUGS;

    expect(await (await POST(fakeRequest(report))).json()).toEqual({
      filed: false,
      reason: "disabled",
    });
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated report", async () => {
    auth.mockResolvedValue(null);

    const res = await POST(fakeRequest(report));

    expect(res.status).toBe(401);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("does not file a dropped connection", async () => {
    const res = await POST(fakeRequest({ ...report, kind: "transport" }));

    expect(await res.json()).toEqual({ filed: false, reason: "not-reportable" });
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("rejects a malformed report", async () => {
    const res = await POST(fakeRequest({ area: "chat-stream" }));

    expect(res.status).toBe(400);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("stops a runaway client after the per-user ceiling", async () => {
    // 20 distinct errors are plausible; the 21st in an hour is a loop.
    for (let i = 0; i < 20; i += 1) {
      await POST(fakeRequest({ ...report, message: `failure number ${i}` }));
    }
    expect(ingestSentryBug).toHaveBeenCalledTimes(20);

    const res = await POST(fakeRequest({ ...report, message: "one too many" }));

    expect(await res.json()).toEqual({ filed: false, reason: "rate-limited" });
    expect(ingestSentryBug).toHaveBeenCalledTimes(20);
  });

  it("never turns a reporting failure into a second failure", async () => {
    ingestSentryBug.mockRejectedValue(new Error("product not found"));

    const res = await POST(fakeRequest(report));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ filed: false, reason: "ingest-failed" });
  });
});
