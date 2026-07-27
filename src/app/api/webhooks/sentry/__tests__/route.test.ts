/**
 * Unit tests for the Sentry webhook route. The route reads only
 * `request.headers.get()` and `request.text()`, so a tiny fake request is
 * enough — no Next.js Web-API plumbing. The ingest service and `~/server/db`
 * are mocked so the route is tested in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import type { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("~/server/db", () => ({ db: {} }));

// Defined via vi.hoisted so the mock factory (hoisted above imports) can close
// over it without a temporal-dead-zone error.
const { ingestSentryBug } = vi.hoisted(() => ({ ingestSentryBug: vi.fn() }));
vi.mock("~/server/services/sentry/SentryBugService", () => ({
  ingestSentryBug,
}));

import { POST } from "../route";

const SECRET = "test-client-secret";

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

/** Minimal NextRequest stand-in exposing only what the route uses. */
function fakeRequest(opts: {
  body: string;
  resource?: string;
  signature?: string;
}): NextRequest {
  const headers = new Map<string, string>();
  if (opts.signature !== undefined)
    headers.set("sentry-hook-signature", opts.signature);
  if (opts.resource !== undefined)
    headers.set("sentry-hook-resource", opts.resource);
  return {
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    text: () => Promise.resolve(opts.body),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  ingestSentryBug.mockResolvedValue({ created: true, ticketId: "ticket-1" });
  process.env.SENTRY_WEBHOOK_SECRET = SECRET;
});

describe("POST /api/webhooks/sentry", () => {
  const issueBody = JSON.stringify({
    action: "created",
    data: { issue: { id: "42", title: "Boom" } },
  });

  it("rejects a missing signature with 401 and does not ingest", async () => {
    const res = await POST(
      fakeRequest({ body: issueBody, resource: "issue" }),
    );
    expect(res.status).toBe(401);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature with 401", async () => {
    const res = await POST(
      fakeRequest({ body: issueBody, resource: "issue", signature: "deadbeef" }),
    );
    expect(res.status).toBe(401);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("returns 200 and ingests nothing for a valid signed non-bug event", async () => {
    const body = JSON.stringify({ action: "created", installation: {} });
    const res = await POST(
      fakeRequest({ body, resource: "installation", signature: sign(body) }),
    );
    expect(res.status).toBe(200);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("dispatches a valid signed issue/created event to the ingest service", async () => {
    const res = await POST(
      fakeRequest({ body: issueBody, resource: "issue", signature: sign(issueBody) }),
    );
    expect(res.status).toBe(200);
    expect(ingestSentryBug).toHaveBeenCalledTimes(1);
    const arg = ingestSentryBug.mock.calls[0]![1] as unknown as { issueId: string };
    expect(arg.issueId).toBe("42");
  });
});
