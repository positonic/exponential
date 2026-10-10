import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests the shared rate limiter (ticket silver.brook).
 *
 * The in-memory fallback path is deterministic and tested directly. The
 * Upstash path is exercised with the SDK mocked: what matters at unit level
 * is our wrapper behaviour — key namespacing, retry-after computation, and
 * that a store outage FAILS OPEN instead of crashing the route.
 */

const limitMock = vi.hoisted(() => vi.fn());

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: vi.fn(() => ({})) },
}));
vi.mock("@upstash/ratelimit", () => {
  class MockRatelimit {
    limit = limitMock;
    static slidingWindow = vi.fn(() => "sliding-window-config");
  }
  return { Ratelimit: MockRatelimit };
});
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { checkRateLimit, clientIpFrom } from "../rateLimit";

const HAD_URL = process.env.UPSTASH_REDIS_REST_URL;
const HAD_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

afterEach(() => {
  if (HAD_URL === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = HAD_URL;
  if (HAD_TOKEN === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = HAD_TOKEN;
  vi.useRealTimers();
});

describe("checkRateLimit — in-memory fallback (no Upstash env)", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("allows up to the limit, then blocks with a Retry-After", async () => {
    const opts = { name: "t-basic", key: "k1", limit: 3, windowSeconds: 60 };
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(opts)).success).toBe(true);
    }
    const blocked = await checkRateLimit(opts);
    expect(blocked.success).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("keys are isolated per name and per key", async () => {
    const base = { limit: 1, windowSeconds: 60 };
    expect(
      (await checkRateLimit({ ...base, name: "t-iso", key: "a" })).success,
    ).toBe(true);
    expect(
      (await checkRateLimit({ ...base, name: "t-iso", key: "a" })).success,
    ).toBe(false);
    // Different key, same namespace: unaffected.
    expect(
      (await checkRateLimit({ ...base, name: "t-iso", key: "b" })).success,
    ).toBe(true);
    // Same key, different namespace: unaffected.
    expect(
      (await checkRateLimit({ ...base, name: "t-iso2", key: "a" })).success,
    ).toBe(true);
  });

  it("resets after the window elapses", async () => {
    vi.useFakeTimers();
    const opts = { name: "t-reset", key: "k1", limit: 1, windowSeconds: 60 };
    expect((await checkRateLimit(opts)).success).toBe(true);
    expect((await checkRateLimit(opts)).success).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect((await checkRateLimit(opts)).success).toBe(true);
  });
});

describe("checkRateLimit — Upstash store", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
    limitMock.mockReset();
  });

  it("passes through a success", async () => {
    limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    const result = await checkRateLimit({
      name: "t-up",
      key: "k1",
      limit: 5,
      windowSeconds: 60,
    });
    expect(result).toEqual({ success: true, retryAfterSeconds: 0 });
    expect(limitMock).toHaveBeenCalledWith("k1");
  });

  it("computes Retry-After from the store's reset time", async () => {
    limitMock.mockResolvedValue({ success: false, reset: Date.now() + 42_000 });
    const result = await checkRateLimit({
      name: "t-up",
      key: "k1",
      limit: 5,
      windowSeconds: 60,
    });
    expect(result.success).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(41);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(43);
  });

  it("fails open when the store errors", async () => {
    limitMock.mockRejectedValue(new Error("upstash unreachable"));
    const result = await checkRateLimit({
      name: "t-up-outage",
      key: "k1",
      limit: 5,
      windowSeconds: 60,
    });
    expect(result).toEqual({ success: true, retryAfterSeconds: 0 });
  });
});

describe("clientIpFrom", () => {
  it("takes the first x-forwarded-for hop", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    });
    expect(clientIpFrom(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "203.0.113.8" }))).toBe(
      "203.0.113.8",
    );
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
