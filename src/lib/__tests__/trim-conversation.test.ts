import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  trimByTokenBudget,
} from "~/lib/trim-conversation";

describe("estimateTokens", () => {
  it("rounds up on partial tokens", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("ab")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("trimByTokenBudget", () => {
  const msg = (role: string, len: number) => ({ role, content: "x".repeat(len) });

  it("returns empty list unchanged", () => {
    const result = trimByTokenBudget([], 100);
    expect(result.messages).toEqual([]);
    expect(result.droppedCount).toBe(0);
  });

  it("keeps everything when within budget", () => {
    const messages = [msg("user", 4), msg("assistant", 4), msg("user", 4)];
    const result = trimByTokenBudget(messages, 100);
    expect(result.messages).toHaveLength(3);
    expect(result.droppedCount).toBe(0);
  });

  it("drops oldest user/assistant turns to fit the budget", () => {
    const messages = [
      msg("user", 400), // ~100 tokens
      msg("assistant", 400),
      msg("user", 400),
      msg("assistant", 400),
      msg("user", 400),
    ];
    const result = trimByTokenBudget(messages, 150);
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.droppedCount).toBeGreaterThan(0);
    expect(result.messages.at(-1)).toBe(messages.at(-1));
  });

  it("preserves a leading system message and counts it toward the budget", () => {
    const messages = [
      msg("system", 400),
      msg("user", 400),
      msg("assistant", 400),
      msg("user", 400),
    ];
    const result = trimByTokenBudget(messages, 250);
    expect(result.messages[0]).toBe(messages[0]);
    expect(result.messages.at(-1)).toBe(messages.at(-1));
    expect(result.droppedCount).toBeGreaterThan(0);
  });

  it("always keeps the final message even if it alone exceeds the budget", () => {
    const messages = [msg("user", 4000)]; // 1000 tokens
    const result = trimByTokenBudget(messages, 100);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toBe(messages[0]);
  });
});
