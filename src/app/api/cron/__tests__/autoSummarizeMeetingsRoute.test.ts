// @vitest-environment node
/**
 * The auto-summarize cron on a keyless install: the summaries are skipped, but
 * the ceremony catch-up that starts the sweep needs no model and has no other
 * scheduled caller, so it must still run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { headersMock, sweepMock, catchUpMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  sweepMock: vi.fn(),
  catchUpMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("~/server/db", () => ({ db: { __stub: "db" } }));
vi.mock("~/server/services/meetings/meetingSummarySweep", () => ({
  runMeetingSummarySweep: sweepMock,
}));
vi.mock("~/server/services/ceremonies/autoAttach", () => ({
  attachUnlinkedMeetings: catchUpMock,
}));

import { GET } from "../auto-summarize-meetings/route";

const request = {} as NextRequest;
const KEYS = ["CRON_SECRET", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const;

describe("/api/cron/auto-summarize-meetings", () => {
  const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "test-secret";
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    headersMock.mockResolvedValue(new Headers({ authorization: "Bearer test-secret" }));
    catchUpMock.mockResolvedValue({ scanned: 3, attached: 1 });
    sweepMock.mockResolvedValue({ candidates: 0, summarized: 0 });
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    vi.restoreAllMocks();
  });

  it("without an LLM key, skips the summaries but still runs the ceremony catch-up", async () => {
    const response = await GET(request);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ skipped: "ai-not-configured", ceremonyCatchUp: { scanned: 3, attached: 1 } });
    expect(catchUpMock).toHaveBeenCalledTimes(1);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("with a key, runs the full sweep (which does its own catch-up)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(sweepMock).toHaveBeenCalledTimes(1);
    expect(catchUpMock).not.toHaveBeenCalled();
  });
});
