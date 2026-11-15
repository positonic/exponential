/**
 * The voice brain passthrough's metering (billing V1): a voice turn that runs
 * Zoe's full agent costs model tokens like a chat turn does, so on an install
 * that meters it leaves one priced event in the usage ledger, against the
 * session's workspace. Mocked Mastra client and Prisma; no network, no DB.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.MASTRA_API_URL ??= "http://mastra.test:4111";
  process.env.SKIP_ENV_VALIDATION ??= "true";
});

const generate = vi.hoisted(() => vi.fn());
vi.mock("@mastra/client-js", () => ({
  MastraClient: class {
    getAgent() {
      return { generate };
    }
  },
}));

import { askExponential } from "../brainPassthrough";

const USER_ID = "user-1";

/** One Sonnet 4.5 step, mostly served from the prompt cache. */
const STEP_USAGE = {
  inputTokens: 50_500,
  outputTokens: 120,
  cachedInputTokens: 50_000,
  raw: {
    inputTokens: { total: 50_500, noCache: 500, cacheRead: 50_000, cacheWrite: 0 },
    outputTokens: { total: 120 },
  },
};
const REPLY = {
  text: "You have three things due today.",
  usage: STEP_USAGE,
  steps: [{ usage: STEP_USAGE }],
  response: { modelId: "claude-sonnet-4-5-20250929" },
};
// 500 × $3/M + 50,000 × $0.30/M + 120 × $15/M = 0.0015 + 0.015 + 0.0018
const REPLY_COST_MICROS = 18_300;

describe("askExponential — metering a voice turn", () => {
  const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
  const originalMode = process.env.BILLING_MODE;
  const recordedEvents = () => db.usageEvent.create.mock.calls.map(([args]) => args.data);

  beforeEach(() => {
    mockReset(db);
    generate.mockReset();
    generate.mockResolvedValue(REPLY);
    process.env.BILLING_MODE = "meter";
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.BILLING_MODE;
    else process.env.BILLING_MODE = originalMode;
  });

  it("speaks the answer and records one priced event against the session's workspace", async () => {
    const result = await askExponential("what is due today?", USER_ID, db, "ws-1", undefined, { timezone: "UTC" });

    expect(result.speakable).toBe(REPLY.text);
    await vi.waitFor(() => expect(recordedEvents()).toHaveLength(1));
    expect(recordedEvents()[0]).toEqual({
      workspaceId: "ws-1",
      source: "VOICE",
      modelId: "claude-sonnet-4-5-20250929",
      costMicros: REPLY_COST_MICROS,
      onOwnKey: false,
      refId: null,
    });
  });

  it("still answers when the ledger write fails", async () => {
    db.$transaction.mockRejectedValue(new Error("connection lost"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await askExponential("what is due today?", USER_ID, db, "ws-1", undefined, { timezone: "UTC" });

    expect(result.speakable).toBe(REPLY.text);
    await vi.waitFor(() => expect(db.$transaction).toHaveBeenCalled());
    consoleError.mockRestore();
  });

  it("records nothing on an install that does not meter", async () => {
    delete process.env.BILLING_MODE;

    const result = await askExponential("what is due today?", USER_ID, db, "ws-1", undefined, { timezone: "UTC" });

    expect(result.speakable).toBe(REPLY.text);
    // Let the deferred metering task run to its early return.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recordedEvents()).toEqual([]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
