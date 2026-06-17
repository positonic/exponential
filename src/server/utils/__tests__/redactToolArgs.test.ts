import { describe, expect, it } from "vitest";

import {
  capToolCallsForTurn,
  formatUserFacingStreamError,
  maskTokenLike,
  redactToolArgs,
  USER_FACING_STREAM_ERROR,
  type LoggedToolCall,
} from "../redactToolArgs";

describe("redactToolArgs", () => {
  it("preserves ordinary args (URLs, ids, text)", () => {
    const out = redactToolArgs({
      url: "https://www.exponential.im/w/clear/okrs",
      projectId: "cmpv4j6jc0005l104fbp9yu1j",
      name: "Evaluate Rocket Chat",
    });
    expect(out).toContain("https://www.exponential.im/w/clear/okrs");
    expect(out).toContain("cmpv4j6jc0005l104fbp9yu1j");
    expect(out).toContain("Evaluate Rocket Chat");
  });

  it("redacts values under sensitive keys, including nested ones", () => {
    const out = redactToolArgs({
      apiKey: "ff_live_supersecret",
      config: { slackToken: "xoxb-1234", retries: 3 },
    });
    expect(out).not.toContain("ff_live_supersecret");
    expect(out).not.toContain("xoxb-1234");
    expect(out).toContain("[redacted]");
    expect(out).toContain('"retries":3');
  });

  it("keeps entity-id keys that merely contain a sensitive word", () => {
    const out = redactToolArgs({
      keyResultId: "kr_cmpv4j6jc0005l104",
      keywords: ["roadmap", "okr"],
    });
    expect(out).toContain("kr_cmpv4j6jc0005l104");
    expect(out).toContain("roadmap");
    expect(out).not.toContain("[redacted]");
  });

  it("redacts token-like strings pasted under benign keys", () => {
    const pastedKey = "a".repeat(24) + "B1_x-".repeat(8); // 64 unbroken chars
    const out = redactToolArgs({ text: `here is my key ${pastedKey} thanks` });
    expect(out).not.toContain(pastedKey);
    expect(out).toContain("here is my key");
  });

  it("truncates oversized args but keeps a marker", () => {
    const out = redactToolArgs({ description: "long ".repeat(500) });
    expect(out.length).toBeLessThan(600);
    expect(out).toContain("[truncated]");
  });

  it("handles cyclic input without throwing (depth cap breaks the cycle)", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => redactToolArgs(cyclic)).not.toThrow();
    expect(redactToolArgs(cyclic)).toContain("[depth-capped]");
  });
});

describe("maskTokenLike", () => {
  it("masks credential echoes in error text but keeps the message readable", () => {
    const key = "ff_live_" + "a1B2c3D4".repeat(6);
    const out = maskTokenLike(`Invalid API key ${key} — check your dashboard`);
    expect(out).not.toContain(key);
    expect(out).toContain("Invalid API key");
    expect(out).toContain("check your dashboard");
  });
});

describe("formatUserFacingStreamError", () => {
  it("returns the calm generic copy as the user message, never the raw error", () => {
    const raw =
      'Type validation failed: {"received":"foo","expected":"bar","path":["x"]}';
    const { userMessage } = formatUserFacingStreamError(raw);
    expect(userMessage).toBe(USER_FACING_STREAM_ERROR);
    expect(userMessage).not.toContain("Type validation failed");
    expect(userMessage).not.toContain(raw);
  });

  it("masks credential echoes in the logged (server-side) message", () => {
    const key = "ff_live_" + "a1B2c3D4".repeat(6);
    const { userMessage, loggedMessage } = formatUserFacingStreamError(
      `Invalid API key ${key} during validation`,
    );
    // The real error is preserved for diagnostics, with secrets masked.
    expect(loggedMessage).toContain("Invalid API key");
    expect(loggedMessage).toContain("during validation");
    expect(loggedMessage).not.toContain(key);
    // The user never sees the raw error nor the secret.
    expect(userMessage).not.toContain(key);
    expect(userMessage).not.toContain("Invalid API key");
  });
});

describe("capToolCallsForTurn", () => {
  it("drops args (never names) once the per-turn budget is exhausted", () => {
    const big = "x".repeat(450);
    const calls: LoggedToolCall[] = Array.from({ length: 50 }, (_, i) => ({
      name: `tool-${i}`,
      args: `"${big}"`,
    }));
    const capped = capToolCallsForTurn(calls);
    expect(capped).toHaveLength(50);
    expect(capped[0]?.argsDropped).toBeUndefined();
    const dropped = capped.filter((c) => c.argsDropped);
    expect(dropped.length).toBeGreaterThan(0);
    for (const c of dropped) {
      expect(c.args).toBe("");
      expect(c.name).toMatch(/^tool-/);
    }
    const totalChars = capped.reduce((n, c) => n + c.args.length, 0);
    expect(totalChars).toBeLessThanOrEqual(16_000);
  });
});
