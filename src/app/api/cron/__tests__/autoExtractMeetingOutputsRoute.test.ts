// @vitest-environment node
/**
 * Route-handler tests for the auto-extract cron: it spends model budget and
 * writes drafts as meeting owners, so it must fail closed without
 * CRON_SECRET and reject bad bearers. The sweep itself is covered by
 * services/meetings/__tests__/autoExtractOutputs.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { headersMock, sweepMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  sweepMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("~/server/db", () => ({ db: { __stub: "db" } }));
vi.mock("~/server/services/meetings/autoExtractOutputs", () => ({
  runAutoExtractOutputsSweep: sweepMock,
}));

import { GET } from "../auto-extract-meeting-outputs/route";

const request = {} as NextRequest;
const sweepResult = { candidates: 2, extracted: 1, givenUp: 0, failed: 1 };

function authHeader(value: string | null) {
  headersMock.mockResolvedValue(new Headers(value === null ? {} : { authorization: value }));
}

describe("/api/cron/auto-extract-meeting-outputs", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "test-secret";
    sweepMock.mockResolvedValue(sweepResult);
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
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong bearer token without running the sweep", async () => {
    authHeader("Bearer wrong-secret");

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the authorization header is missing", async () => {
    authHeader(null);

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns its tally for the right bearer", async () => {
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(sweepMock).toHaveBeenCalledWith({ __stub: "db" });
    await expect(response.json()).resolves.toEqual({ success: true, ...sweepResult });
  });

  it("returns 500 when the sweep throws", async () => {
    sweepMock.mockRejectedValue(new Error("boom"));

    const response = await GET(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "boom" });
  });
});
