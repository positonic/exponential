/**
 * Unit tests for the workspace-scoped Sentry webhook route. Mirrors the global
 * route's test style: a tiny fake request, with `~/server/db` and the ingest
 * service mocked so the route is tested in isolation. Credentials use
 * `isEncrypted: false` so `getDecryptedKey` returns the secret verbatim — no
 * encryption key needed in the test env.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import type { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const { ingestSentryBug, findUnique } = vi.hoisted(() => ({
  ingestSentryBug: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock("~/server/db", () => ({
  db: { integration: { findUnique } },
}));
vi.mock("~/server/services/sentry/SentryBugService", () => ({
  ingestSentryBug,
}));

import { POST } from "../route";

const SECRET = "workspace-secret";
const WEBHOOK_ID = "wh_test_1";

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function fakeRequest(opts: {
  body: string;
  resource?: string;
  signature?: string;
  tokenQuery?: string;
  service?: string;
  product?: string;
}): NextRequest {
  const headers = new Map<string, string>();
  if (opts.signature !== undefined)
    headers.set("sentry-hook-signature", opts.signature);
  if (opts.resource !== undefined)
    headers.set("sentry-hook-resource", opts.resource);
  const searchParams = new URLSearchParams();
  if (opts.tokenQuery !== undefined) searchParams.set("token", opts.tokenQuery);
  if (opts.service !== undefined) searchParams.set("service", opts.service);
  if (opts.product !== undefined) searchParams.set("product", opts.product);
  return {
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    nextUrl: { searchParams },
    text: () => Promise.resolve(opts.body),
  } as unknown as NextRequest;
}

const ctx = { params: Promise.resolve({ webhookId: WEBHOOK_ID }) };

function integrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    provider: "sentry",
    status: "ACTIVE",
    providerConfig: { productId: "prod-1" },
    credentials: [{ key: SECRET, isEncrypted: false }],
    ...overrides,
  };
}

const issueBody = JSON.stringify({
  action: "created",
  data: { issue: { id: "42", title: "Boom" } },
});

beforeEach(() => {
  vi.clearAllMocks();
  ingestSentryBug.mockResolvedValue({ created: true, ticketId: "ticket-1" });
  findUnique.mockResolvedValue(integrationRow());
});

describe("POST /api/webhooks/sentry/[webhookId]", () => {
  it("files a bug into the integration's product for a valid signed issue", async () => {
    const res = await POST(
      fakeRequest({ body: issueBody, resource: "issue", signature: sign(issueBody) }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(ingestSentryBug).toHaveBeenCalledTimes(1);
    // Routed to the per-workspace product, not the global default.
    expect(ingestSentryBug.mock.calls[0]![2]).toMatchObject({
      productId: "prod-1",
    });
  });

  it("returns 404 for an unknown webhookId and does not ingest", async () => {
    findUnique.mockResolvedValue(null);
    const res = await POST(
      fakeRequest({ body: issueBody, resource: "issue", signature: sign(issueBody) }),
      ctx,
    );
    expect(res.status).toBe(404);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("returns 404 when the integration is not a sentry provider", async () => {
    findUnique.mockResolvedValue(integrationRow({ provider: "slack" }));
    const res = await POST(
      fakeRequest({ body: issueBody, resource: "issue", signature: sign(issueBody) }),
      ctx,
    );
    expect(res.status).toBe(404);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("rejects a missing signature with 401", async () => {
    const res = await POST(
      fakeRequest({ body: issueBody, resource: "issue" }),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature with 401", async () => {
    const res = await POST(
      fakeRequest({ body: issueBody, resource: "issue", signature: "deadbeef" }),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("returns 401 when the integration has no usable secret", async () => {
    findUnique.mockResolvedValue(integrationRow({ credentials: [] }));
    const res = await POST(
      fakeRequest({ body: issueBody, resource: "issue", signature: sign(issueBody) }),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("returns 500 when the integration has no destination product", async () => {
    findUnique.mockResolvedValue(integrationRow({ providerConfig: {} }));
    const res = await POST(
      fakeRequest({ body: issueBody, resource: "issue", signature: sign(issueBody) }),
      ctx,
    );
    expect(res.status).toBe(500);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  it("returns 200 and ingests nothing for a valid signed non-bug event", async () => {
    const body = JSON.stringify({ action: "resolved", data: { issue: { id: "42" } } });
    const res = await POST(
      fakeRequest({ body, resource: "issue", signature: sign(body) }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(ingestSentryBug).not.toHaveBeenCalled();
  });

  describe("unsigned GlitchTip requests", () => {
    const glitchtipBody = JSON.stringify({
      alias: "issue.new",
      issue_id: 555,
      project: "clear-pipeline",
      attachments: [{ title: "OperationalError: connection reset" }],
    });

    it("accepts the integration's own secret as a query token", async () => {
      const res = await POST(
        fakeRequest({ body: glitchtipBody, tokenQuery: SECRET }),
        ctx,
      );

      expect(res.status).toBe(200);
      expect(ingestSentryBug).toHaveBeenCalledTimes(1);
      const arg = ingestSentryBug.mock.calls[0]![1] as unknown as {
        issueId: string;
        projectSlug: string;
      };
      expect(arg.issueId).toBe("555");
      expect(arg.projectSlug).toBe("clear-pipeline");
      // Routed to this tenant's configured product, as for signed requests.
      expect(ingestSentryBug.mock.calls[0]![2]).toMatchObject({
        productId: "prod-1",
      });
    });

    it("passes ?service= through for source labelling", async () => {
      await POST(
        fakeRequest({
          body: glitchtipBody,
          tokenQuery: SECRET,
          service: "clear-pipeline",
        }),
        ctx,
      );
      expect(ingestSentryBug.mock.calls[0]![2]).toMatchObject({
        sourceSlug: "clear-pipeline",
      });
    });

    it("accepts ?product= as an alias for ?service=", async () => {
      await POST(
        fakeRequest({
          body: glitchtipBody,
          tokenQuery: SECRET,
          product: "clear-api",
        }),
        ctx,
      );
      expect(ingestSentryBug.mock.calls[0]![2]).toMatchObject({
        sourceSlug: "clear-api",
      });
    });

    it("rejects a wrong query token with 401", async () => {
      const res = await POST(
        fakeRequest({ body: glitchtipBody, tokenQuery: "not-the-secret" }),
        ctx,
      );
      expect(res.status).toBe(401);
      expect(ingestSentryBug).not.toHaveBeenCalled();
    });

    it("rejects an unsigned request carrying no token at all", async () => {
      const res = await POST(fakeRequest({ body: glitchtipBody }), ctx);
      expect(res.status).toBe(401);
      expect(ingestSentryBug).not.toHaveBeenCalled();
    });

    it("never lets a valid token rescue a request whose signature is invalid", async () => {
      // Security boundary: offering a signature commits the sender to HMAC.
      const res = await POST(
        fakeRequest({
          body: glitchtipBody,
          signature: "deadbeef",
          tokenQuery: SECRET,
        }),
        ctx,
      );
      expect(res.status).toBe(401);
      expect(ingestSentryBug).not.toHaveBeenCalled();
    });
  });
});
