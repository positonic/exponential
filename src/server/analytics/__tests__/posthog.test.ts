import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeEnv: { POSTHOG_KEY?: string; POSTHOG_HOST?: string; NEXT_PUBLIC_POSTHOG_KEY?: string } = {};

vi.mock("~/env", () => ({
  env: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "POSTHOG_KEY") return fakeEnv.POSTHOG_KEY;
        if (prop === "POSTHOG_HOST") return fakeEnv.POSTHOG_HOST;
        if (prop === "NEXT_PUBLIC_POSTHOG_KEY") return fakeEnv.NEXT_PUBLIC_POSTHOG_KEY;
        if (prop === "NODE_ENV") return "test";
        return undefined;
      },
    },
  ),
}));

const { capture, flush, on, constructorSpy } = vi.hoisted(() => ({
  capture: vi.fn(),
  flush: vi.fn(async () => undefined),
  on: vi.fn(),
  constructorSpy: vi.fn(),
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(key: string, options: unknown) {
      constructorSpy(key, options);
    }
    capture = capture;
    flush = flush;
    on = on;
  },
}));

import {
  captureProcedureCall,
  flushAnalytics,
  isAnalyticsEnabled,
  resetAnalyticsClientForTests,
  resolveSurface,
  shouldCaptureProcedureCall,
} from "../posthog";

const headers = (init: Record<string, string> = {}) => new Headers(init);

describe("resolveSurface", () => {
  it("maps every token type to a surface", () => {
    const cases: Array<[string, string]> = [
      ["api-token", "api"],
      ["agent-key", "external-agent"],
      ["agent-context", "assistant"],
      ["whatsapp-gateway", "whatsapp"],
      ["telegram-gateway", "telegram"],
      ["matrix-gateway", "matrix"],
      ["voice-session", "voice"],
      ["extension-token", "browser-extension"],
      ["device-token", "native-app"],
      ["something-new", "unknown"],
    ];
    for (const [tokenType, surface] of cases) {
      expect(resolveSurface({ tokenType, headers: headers() })).toBe(surface);
    }
  });

  it("tells the cookie-session surfaces apart by headers", () => {
    expect(resolveSurface({ tokenType: undefined, headers: headers() })).toBe("web");
    expect(
      resolveSurface({ tokenType: undefined, headers: headers({ "x-trpc-source": "rsc" }) }),
    ).toBe("rsc");
    expect(
      resolveSurface({
        tokenType: undefined,
        headers: headers({ "user-agent": "Mozilla/5.0 Electron/31.0.0 Safari/537.36" }),
      }),
    ).toBe("electron");
  });
});

describe("shouldCaptureProcedureCall", () => {
  it("captures every mutation", () => {
    expect(shouldCaptureProcedureCall({ type: "mutation", surface: "web" })).toBe(true);
    expect(shouldCaptureProcedureCall({ type: "mutation", surface: "api" })).toBe(true);
  });

  it("skips queries from browser surfaces but keeps them elsewhere", () => {
    expect(shouldCaptureProcedureCall({ type: "query", surface: "web" })).toBe(false);
    expect(shouldCaptureProcedureCall({ type: "query", surface: "rsc" })).toBe(false);
    expect(shouldCaptureProcedureCall({ type: "query", surface: "electron" })).toBe(false);
    expect(shouldCaptureProcedureCall({ type: "query", surface: "api" })).toBe(true);
    expect(shouldCaptureProcedureCall({ type: "query", surface: "native-app" })).toBe(true);
  });

  it("never captures subscriptions", () => {
    expect(shouldCaptureProcedureCall({ type: "subscription", surface: "api" })).toBe(false);
  });
});

describe("captureProcedureCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete fakeEnv.POSTHOG_KEY;
    delete fakeEnv.POSTHOG_HOST;
    delete fakeEnv.NEXT_PUBLIC_POSTHOG_KEY;
    resetAnalyticsClientForTests();
  });

  it("is a no-op without POSTHOG_KEY", async () => {
    captureProcedureCall({
      userId: "u1",
      path: "action.create",
      type: "mutation",
      surface: "web",
      ok: true,
      durationMs: 5,
    });
    await flushAnalytics();
    expect(isAnalyticsEnabled()).toBe(false);
    expect(constructorSpy).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it("captures the procedure path as the event, keyed by user, without inputs", () => {
    fakeEnv.POSTHOG_KEY = "phc_test";
    captureProcedureCall({
      userId: "u1",
      path: "action.create",
      type: "mutation",
      surface: "api",
      ok: false,
      errorCode: "NOT_FOUND",
      durationMs: 42,
    });
    expect(constructorSpy).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({ host: "https://eu.i.posthog.com", disableGeoip: true }),
    );
    expect(capture).toHaveBeenCalledWith({
      distinctId: "u1",
      event: "action.create",
      properties: {
        procedure: "action.create",
        type: "mutation",
        surface: "api",
        ok: false,
        error_code: "NOT_FOUND",
        duration_ms: 42,
        $set: { last_seen_surface: "api" },
        $set_once: { first_seen_surface: "api" },
      },
    });
  });

  it("honours POSTHOG_HOST and flushes when enabled", async () => {
    fakeEnv.POSTHOG_KEY = "phc_test";
    fakeEnv.POSTHOG_HOST = "https://posthog.example.test";
    captureProcedureCall({
      userId: "u1",
      path: "action.list",
      type: "query",
      surface: "api",
      ok: true,
      durationMs: 1,
    });
    await flushAnalytics();
    expect(constructorSpy).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({ host: "https://posthog.example.test" }),
    );
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("falls back to NEXT_PUBLIC_POSTHOG_KEY, with POSTHOG_KEY taking precedence", () => {
    fakeEnv.NEXT_PUBLIC_POSTHOG_KEY = "phc_public";
    expect(isAnalyticsEnabled()).toBe(true);
    expect(constructorSpy).toHaveBeenLastCalledWith("phc_public", expect.anything());

    resetAnalyticsClientForTests();
    fakeEnv.POSTHOG_KEY = "phc_server";
    expect(isAnalyticsEnabled()).toBe(true);
    expect(constructorSpy).toHaveBeenLastCalledWith("phc_server", expect.anything());
  });

  it("does not build a client for calls the rule drops", () => {
    fakeEnv.POSTHOG_KEY = "phc_test";
    captureProcedureCall({
      userId: "u1",
      path: "action.list",
      type: "query",
      surface: "web",
      ok: true,
      durationMs: 1,
    });
    expect(constructorSpy).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});
