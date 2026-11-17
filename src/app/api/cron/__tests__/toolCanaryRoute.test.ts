// @vitest-environment node
/**
 * Route-handler tests for the tool canary cron: it must fail closed without
 * CRON_SECRET, reject bad bearers, and answer 5xx only when the canary could
 * not run (that status is what turns its Sentry cron monitor red). The run
 * itself is covered by services/toolCanary/__tests__.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { headersMock, checkMock } = vi.hoisted(() => ({ headersMock: vi.fn(), checkMock: vi.fn() }));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("~/server/db", () => ({ db: { __stub: "db" } }));
vi.mock("~/server/services/toolCanary/ToolCanaryService", () => ({ runToolCanaryCheck: checkMock }));

import { GET } from "../tool-canary/route";

const request = {} as NextRequest;

function authHeader(value: string | null) {
  headersMock.mockResolvedValue(new Headers(value === null ? {} : { authorization: value }));
}

describe("/api/cron/tool-canary", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "test-secret";
    checkMock.mockResolvedValue({ ran: true, failing: [], announced: [], recovered: [], fileErrors: [] });
    authHeader("Bearer test-secret");
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it("refuses to run when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(request);
    expect(response.status).toBe(503);
    expect(checkMock).not.toHaveBeenCalled();
  });

  it.each([null, "Bearer wrong", "test-secret"])("rejects a missing or wrong bearer (%j)", async (value) => {
    authHeader(value);
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(checkMock).not.toHaveBeenCalled();
  });

  it("answers 200 with the run's summary, broken tools included: the canary worked", async () => {
    const result = { ran: true, failing: ["tool:a"], announced: ["tool:a"], recovered: [], fileErrors: [] };
    checkMock.mockResolvedValue(result);
    const response = await GET(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
  });

  it("answers 200 when the canary is not configured, so an unused canary is not an outage", async () => {
    checkMock.mockResolvedValue({ ran: false, skipped: "not-configured", failing: [], announced: [], recovered: [], fileErrors: [] });
    expect((await GET(request)).status).toBe(200);
  });

  it("answers 502 when the canary could not run, so its cron monitor turns red", async () => {
    checkMock.mockResolvedValue({ ran: true, runnerFailed: "the assistant service did not answer", failing: ["runner"], announced: [], recovered: [], fileErrors: [] });
    expect((await GET(request)).status).toBe(502);
  });

  it("answers 502 when faults were found and could not be filed, so they are not silently dropped", async () => {
    checkMock.mockResolvedValue({ ran: true, failing: ["tool:a"], announced: [], recovered: [], fileErrors: ["tool:a"] });
    expect((await GET(request)).status).toBe(502);
  });

  it("answers 500 if the check itself throws", async () => {
    checkMock.mockRejectedValue(new Error("boom"));
    expect((await GET(request)).status).toBe(500);
  });
});
