// @vitest-environment node
/**
 * Route-handler tests for the Notion inbound-sync webhook — POST
 * /api/webhooks/notion. The route is a verified doorbell: it authenticates the
 * event, resolves which sync config the event's database ids belong to, and
 * fires the SAME inbound pull the cron sweep runs (trigger `webhook`), always
 * answering 200 fast. The engine itself is covered by engine.test.ts; here we
 * pin the auth + dispatch contract.
 */

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { runInboundMock, adapterFactoryMock, findManyMock, findFirstMock } =
  vi.hoisted(() => ({
    runInboundMock: vi.fn(),
    adapterFactoryMock: vi.fn(),
    findManyMock: vi.fn(),
    findFirstMock: vi.fn(),
  }));

vi.mock("~/server/db", () => ({
  db: {
    ticketSyncConfig: { findMany: findManyMock },
    ticketSyncRun: { findFirst: findFirstMock },
  },
}));
vi.mock("~/server/services/ticketSync/engine", () => ({
  runInboundTicketSync: runInboundMock,
}));
vi.mock("~/server/services/ticketSync/notionAdapter", () => ({
  createNotionTicketSyncAdapter: adapterFactoryMock,
}));

import { POST } from "../notion/route";

const SECRET = "whsec_test";
const DB_ID_DASHED = "11111111-2222-3333-4444-555555555555";
const DB_ID_BARE = DB_ID_DASHED.replace(/-/g, "");

function sign(raw: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}

function makeRequest(
  rawBody: string,
  headers: Record<string, string> = {},
): NextRequest {
  return {
    text: async () => rawBody,
    headers: new Headers(headers),
  } as unknown as NextRequest;
}

/** A verified event body naming `databaseId` via data.parent.database_id. */
function eventFor(databaseId: string): string {
  return JSON.stringify({
    id: "evt_1",
    type: "page.content_updated",
    entity: { id: "page_abc", type: "page" },
    data: { parent: { type: "database", database_id: databaseId } },
  });
}

function enabledConfig(databaseId: string) {
  return {
    id: "cfg_1",
    productId: "prod_1",
    integrationId: "int_1",
    propertyNames: null,
    databaseId,
  };
}

describe("POST /api/webhooks/notion", () => {
  const originalSecret = process.env.NOTION_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.env.NOTION_WEBHOOK_SECRET = SECRET;
    findManyMock.mockResolvedValue([]);
    findFirstMock.mockResolvedValue(null);
    adapterFactoryMock.mockResolvedValue({ ok: true, adapter: { queryRows: vi.fn() } });
    runInboundMock.mockResolvedValue({ runId: "run_1" });
  });

  afterEach(() => {
    process.env.NOTION_WEBHOOK_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it("fails closed with 503 when NOTION_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.NOTION_WEBHOOK_SECRET;
    const raw = eventFor(DB_ID_DASHED);

    const response = await POST(
      makeRequest(raw, { "x-notion-signature": sign(raw) }),
    );

    expect(response.status).toBe(503);
    expect(findManyMock).not.toHaveBeenCalled();
    expect(runInboundMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a bad signature without resolving any config", async () => {
    const raw = eventFor(DB_ID_DASHED);

    const response = await POST(
      makeRequest(raw, { "x-notion-signature": "sha256=deadbeef" }),
    );

    expect(response.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
    expect(runInboundMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the signature header is missing (non-handshake body)", async () => {
    const raw = eventFor(DB_ID_DASHED);

    const response = await POST(makeRequest(raw));

    expect(response.status).toBe(401);
    expect(runInboundMock).not.toHaveBeenCalled();
  });

  it("acknowledges the handshake during bootstrap (no secret configured) with 200 and logs the token", async () => {
    // Notion signs the verification request keyed by the token itself, which
    // the operator has not stored yet — so during bootstrap ANY handshake must
    // be acknowledged or the subscription can never be created (the 503
    // chicken-and-egg observed live).
    delete process.env.NOTION_WEBHOOK_SECRET;
    const logSpy = vi.spyOn(console, "log");
    const raw = JSON.stringify({ verification_token: "verif_tok_xyz" });

    const response = await POST(
      makeRequest(raw, { "x-notion-signature": sign(raw, "verif_tok_xyz") }),
    );

    expect(response.status).toBe(200);
    expect(runInboundMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("verif_tok_xyz"));
  });

  it("acknowledges a correctly-signed handshake when the secret is configured", async () => {
    const logSpy = vi.spyOn(console, "log");
    const raw = JSON.stringify({ verification_token: "verif_tok_resend" });

    const response = await POST(
      makeRequest(raw, { "x-notion-signature": sign(raw) }),
    );

    expect(response.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("verif_tok_resend"),
    );
  });

  it("rejects an unsigned handshake once a secret is configured (log-poisoning guard)", async () => {
    const logSpy = vi.spyOn(console, "log");
    const raw = JSON.stringify({ verification_token: "attacker_token" });

    const response = await POST(makeRequest(raw));

    expect(response.status).toBe(401);
    expect(runInboundMock).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("attacker_token"),
    );
  });

  it("returns 200 no-op for a verified event whose database matches no config", async () => {
    findManyMock.mockResolvedValue([enabledConfig("99999999-0000-0000-0000-000000000000")]);
    const raw = eventFor(DB_ID_DASHED);

    const response = await POST(
      makeRequest(raw, { "x-notion-signature": sign(raw) }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { matched: number };
    expect(body.matched).toBe(0);
    expect(adapterFactoryMock).not.toHaveBeenCalled();
    expect(runInboundMock).not.toHaveBeenCalled();
  });

  it("fires the inbound run with trigger webhook for a matching config (dash-normalized)", async () => {
    // Config stores the id BARE; the event carries it DASHED — must still match.
    findManyMock.mockResolvedValue([enabledConfig(DB_ID_BARE)]);
    const adapter = { queryRows: vi.fn() };
    adapterFactoryMock.mockResolvedValue({ ok: true, adapter });
    const raw = eventFor(DB_ID_DASHED);

    const response = await POST(
      makeRequest(raw, { "x-notion-signature": sign(raw) }),
    );

    expect(response.status).toBe(200);
    expect(runInboundMock).toHaveBeenCalledTimes(1);
    expect(runInboundMock).toHaveBeenCalledWith(expect.anything(), adapter, {
      configId: "cfg_1",
      trigger: "webhook",
    });
  });

  it("still returns 200 (no crash) when the fire-and-forget run rejects", async () => {
    findManyMock.mockResolvedValue([enabledConfig(DB_ID_DASHED)]);
    runInboundMock.mockRejectedValue(new Error("engine exploded"));
    const raw = eventFor(DB_ID_DASHED);

    const response = await POST(
      makeRequest(raw, { "x-notion-signature": sign(raw) }),
    );

    expect(response.status).toBe(200);
    expect(runInboundMock).toHaveBeenCalledTimes(1);
    // Let the rejected promise's .catch settle so no unhandled rejection leaks.
    await Promise.resolve();
  });

  it("debounces: skips the run when a recent run for the config is in flight", async () => {
    findManyMock.mockResolvedValue([enabledConfig(DB_ID_DASHED)]);
    findFirstMock.mockResolvedValue({
      id: "run_prev",
      status: "running",
      startedAt: new Date(),
    });
    const raw = eventFor(DB_ID_DASHED);

    const response = await POST(
      makeRequest(raw, { "x-notion-signature": sign(raw) }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      matched: number;
      items: Array<{ outcome: string }>;
    };
    expect(body.matched).toBe(1);
    expect(body.items[0]?.outcome).toBe("skipped-running");
    expect(adapterFactoryMock).not.toHaveBeenCalled();
    expect(runInboundMock).not.toHaveBeenCalled();
  });
});
