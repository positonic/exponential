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
  tokenHeader?: string;
  tokenQuery?: string;
}): NextRequest {
  const headers = new Map<string, string>();
  if (opts.signature !== undefined)
    headers.set("sentry-hook-signature", opts.signature);
  if (opts.resource !== undefined)
    headers.set("sentry-hook-resource", opts.resource);
  if (opts.tokenHeader !== undefined)
    headers.set("x-webhook-token", opts.tokenHeader);
  const searchParams = new URLSearchParams();
  if (opts.tokenQuery !== undefined) searchParams.set("token", opts.tokenQuery);
  return {
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    nextUrl: { searchParams },
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

/**
 * GlitchTip's generic webhook: no `Sentry-Hook-Resource` header, a flat body,
 * and a secret that can only travel in the URL. Token auth only — HMAC is not
 * available to it — so these tests run with the secret gate off.
 */
describe("POST /api/webhooks/sentry (GlitchTip generic webhook)", () => {
  const TOKEN = "glitchtip-shared-token";

  const glitchtipBody = JSON.stringify({
    alias: "issue.new",
    text: "GlitchTip Alert",
    issue_id: 777,
    project: "clear-api",
    attachments: [
      {
        title: "TypeError: cannot read property of undefined",
        title_link: "https://glitchtip.example.com/org/clear-api/issues/777",
      },
    ],
  });

  beforeEach(() => {
    delete process.env.SENTRY_WEBHOOK_SECRET;
    process.env.SENTRY_WEBHOOK_TOKEN = TOKEN;
  });

  it("accepts the shared secret as a query param and files the issue", async () => {
    const res = await POST(
      fakeRequest({ body: glitchtipBody, tokenQuery: TOKEN }),
    );

    expect(res.status).toBe(200);
    expect(ingestSentryBug).toHaveBeenCalledTimes(1);
    const arg = ingestSentryBug.mock.calls[0]![1] as unknown as {
      issueId: string;
      title: string;
      url: string;
      projectSlug: string;
    };
    expect(arg.issueId).toBe("777");
    // The attachment title is the real error; `text` is boilerplate.
    expect(arg.title).toBe("TypeError: cannot read property of undefined");
    expect(arg.projectSlug).toBe("clear-api");
    expect(arg.url).toBe(
      "https://glitchtip.example.com/org/clear-api/issues/777",
    );
  });

  it("still accepts the token in the header (preferred over the query param)", async () => {
    const res = await POST(
      fakeRequest({ body: glitchtipBody, tokenHeader: TOKEN }),
    );
    expect(res.status).toBe(200);
    expect(ingestSentryBug).toHaveBeenCalledTimes(1);
  });

  it("rejects a wrong query token with 401 and does not ingest", async () => {
    const res = await POST(
      fakeRequest({ body: glitchtipBody, tokenQuery: "wrong-token" }),
    );
    expect(res.status).toBe(401);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("ignores a resolution event rather than filing a ticket for it", async () => {
    const body = JSON.stringify({
      alias: "issue.resolved",
      issue_id: 777,
      attachments: [{ title: "TypeError: already fixed" }],
    });
    const res = await POST(fakeRequest({ body, tokenQuery: TOKEN }));

    expect(res.status).toBe(200);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("recovers the issue id from the issue URL when issue_id is absent", async () => {
    const body = JSON.stringify({
      alias: "issue.new",
      attachments: [
        {
          title: "RangeError: out of range",
          title_link: "https://glitchtip.example.com/org/clear-mvp/issues/12345",
        },
      ],
    });
    const res = await POST(fakeRequest({ body, tokenQuery: TOKEN }));

    expect(res.status).toBe(200);
    const arg = ingestSentryBug.mock.calls[0]![1] as unknown as {
      issueId: string;
    };
    expect(arg.issueId).toBe("12345");
  });

  it("ignores a payload with no recoverable issue id", async () => {
    const body = JSON.stringify({ alias: "issue.new", text: "no id anywhere" });
    const res = await POST(fakeRequest({ body, tokenQuery: TOKEN }));

    expect(res.status).toBe(200);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });
});
