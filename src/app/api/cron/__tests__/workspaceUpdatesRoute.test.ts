// @vitest-environment node
/**
 * Route-handler tests for the workspace-updates cron — the sweep that drafts
 * each workspace's weekly update and notifies its reviewers, so it must fail closed
 * without CRON_SECRET and reject bad bearers. The runner itself is covered by
 * services/workspaceUpdates/__tests__/runner.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { headersMock, runDueWorkspaceUpdatesMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  runDueWorkspaceUpdatesMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("~/server/db", () => ({ db: { __stub: "db" } }));
vi.mock("~/server/services/workspaceUpdates/deps", () => ({ defaultGenerateDeps: vi.fn() }));
vi.mock("~/server/services/workspaceUpdates/runner", () => ({
  runDueWorkspaceUpdates: runDueWorkspaceUpdatesMock,
}));

import { GET } from "../workspace-updates/route";

const request = {} as NextRequest;
const runnerResult = { evaluated: 0, due: 0, drafted: [], empty: [], alreadyClaimed: [], failed: [] };

function authHeader(value: string | null) {
  headersMock.mockResolvedValue(
    new Headers(value === null ? {} : { authorization: value }),
  );
}

describe("/api/cron/workspace-updates", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "test-secret";
    runDueWorkspaceUpdatesMock.mockResolvedValue(runnerResult);
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
    expect(runDueWorkspaceUpdatesMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong bearer token without running the sweep", async () => {
    authHeader("Bearer wrong-secret");

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(runDueWorkspaceUpdatesMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the authorization header is missing", async () => {
    authHeader(null);

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(runDueWorkspaceUpdatesMock).not.toHaveBeenCalled();
  });

  it("runs the sweep and reports its summary on a valid bearer", async () => {
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(runDueWorkspaceUpdatesMock).toHaveBeenCalledTimes(1);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ success: true, ...runnerResult });
  });
});
