// @vitest-environment node
/**
 * Route-handler tests for the scheduled-Automations cron — the entry point
 * that fires Broadcasts (email to whole contact Lists), so it must fail closed
 * without CRON_SECRET and reject bad bearers. The runner itself is covered by
 * scheduledRunner.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { headersMock, runDueScheduledAutomationsMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  runDueScheduledAutomationsMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("~/server/db", () => ({ db: { __stub: "db" } }));
vi.mock("~/server/services/workflows/scheduling/scheduledRunner", () => ({
  runDueScheduledAutomations: runDueScheduledAutomationsMock,
}));

import { GET } from "../run-scheduled-automations/route";

const request = {} as NextRequest;
const runnerResult = { evaluated: 0, due: 0, ran: [], skipped: [], failed: [] };

function authHeader(value: string | null) {
  headersMock.mockResolvedValue(
    new Headers(value === null ? {} : { authorization: value }),
  );
}

describe("/api/cron/run-scheduled-automations", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "test-secret";
    runDueScheduledAutomationsMock.mockResolvedValue(runnerResult);
    authHeader("Bearer test-secret");
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it("fails closed with 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    authHeader(null);

    const response = await GET(request);

    expect(response.status).toBe(503);
    expect(runDueScheduledAutomationsMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong bearer token without running the sweep", async () => {
    authHeader("Bearer wrong-secret");

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(runDueScheduledAutomationsMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the authorization header is missing", async () => {
    authHeader(null);

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(runDueScheduledAutomationsMock).not.toHaveBeenCalled();
  });

  it("runs the sweep and reports its summary on a valid bearer", async () => {
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(runDueScheduledAutomationsMock).toHaveBeenCalledTimes(1);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ success: true, ...runnerResult });
  });
});
