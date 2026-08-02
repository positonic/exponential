// @vitest-environment node
/**
 * Route-handler tests for the two ticket-sync cron entry points — the
 * production surfaces that run the sync every 10 minutes (inbound pull sweep)
 * and every 2 minutes (outbound push-queue drain).
 *
 * The routes' whole job is auth + dispatch: fail closed without CRON_SECRET,
 * reject bad bearers with a timing-safe compare, invoke the right runner, and
 * report failures without leaking internals. The runners themselves are
 * covered by scheduler.test.ts / pushRunner.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { headersMock, runDueTicketSyncsMock, runOutboundPushSweepMock } =
  vi.hoisted(() => ({
    headersMock: vi.fn(),
    runDueTicketSyncsMock: vi.fn(),
    runOutboundPushSweepMock: vi.fn(),
  }));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("~/server/db", () => ({ db: { __stub: "db" } }));
vi.mock("~/server/services/ticketSync/scheduler", () => ({
  runDueTicketSyncs: runDueTicketSyncsMock,
}));
vi.mock("~/server/services/ticketSync/pushRunner", () => ({
  runOutboundPushSweep: runOutboundPushSweepMock,
}));

import { GET as pullRoute } from "../ticket-sync/route";
import { GET as pushRoute } from "../ticket-sync-push/route";

const request = {} as NextRequest;

function authHeader(value: string | null) {
  headersMock.mockResolvedValue(
    new Headers(value === null ? {} : { authorization: value }),
  );
}

const ROUTES = [
  {
    name: "ticket-sync (pull sweep)",
    route: pullRoute,
    runner: runDueTicketSyncsMock,
    runnerResult: { due: 0, ran: 0, skipped: 0, items: [] },
  },
  {
    name: "ticket-sync-push (push drain)",
    route: pushRoute,
    runner: runOutboundPushSweepMock,
    runnerResult: { claimed: 0, pushed: 0, failed: 0, items: [] },
  },
] as const;

describe.each(ROUTES)("/api/cron/$name", ({ route, runner, runnerResult }) => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "test-secret";
    runner.mockResolvedValue(runnerResult);
    authHeader("Bearer test-secret");
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it("fails closed with 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await route(request);

    expect(response.status).toBe(503);
    expect(runner).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong bearer token without invoking the runner", async () => {
    authHeader("Bearer wrong-secret");

    const response = await route(request);

    expect(response.status).toBe(401);
    expect(runner).not.toHaveBeenCalled();
  });

  it("returns 401 when the authorization header is missing", async () => {
    authHeader(null);

    const response = await route(request);

    expect(response.status).toBe(401);
    expect(runner).not.toHaveBeenCalled();
  });

  it("runs the sweep and reports its summary on a valid bearer", async () => {
    const response = await route(request);

    expect(response.status).toBe(200);
    expect(runner).toHaveBeenCalledTimes(1);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    for (const [key, value] of Object.entries(runnerResult)) {
      expect(body[key]).toEqual(value);
    }
  });

  it("returns 500 with the message only when the runner throws", async () => {
    runner.mockRejectedValue(new Error("sweep exploded"));

    const response = await route(request);

    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: "sweep exploded" });
  });
});

describe("runner wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "test-secret";
    authHeader("Bearer test-secret");
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("pull route invokes runDueTicketSyncs with the db and the current time", async () => {
    runDueTicketSyncsMock.mockResolvedValue({ due: 0, ran: 0, items: [] });

    await pullRoute(request);

    expect(runDueTicketSyncsMock).toHaveBeenCalledWith(
      { __stub: "db" },
      expect.any(Date),
    );
    expect(runOutboundPushSweepMock).not.toHaveBeenCalled();
  });

  it("push route invokes runOutboundPushSweep with the cron trigger", async () => {
    runOutboundPushSweepMock.mockResolvedValue({ claimed: 0, failed: 0 });

    await pushRoute(request);

    expect(runOutboundPushSweepMock).toHaveBeenCalledWith(
      { __stub: "db" },
      expect.any(Date),
      { trigger: "cron" },
    );
    expect(runDueTicketSyncsMock).not.toHaveBeenCalled();
  });
});
