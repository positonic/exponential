import { describe, expect, it } from "vitest";

import {
  capToolCallsForTurn,
  redactToolArgs,
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
