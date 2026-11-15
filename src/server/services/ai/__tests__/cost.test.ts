/**
 * Pricing an Assistant turn from the usage Mastra reports.
 *
 * The fixtures follow the shapes `@mastra/core` 1.28 builds on AI SDK v6 with
 * `@ai-sdk/anthropic` 3.0 (read from their source): a step's `inputTokens` is
 * its whole prompt, cache reads and writes included, with the provider's own
 * split under `raw`; a turn's usage sums the steps but keeps only the last
 * step's `raw`. Every expected cost is worked out by hand at the published
 * rates, so a turn is never billed for its cache traffic twice.
 */

import { describe, expect, it } from "vitest";
import {
  priceTokenBreakdown,
  resolveModelPricing,
  stepTokenBreakdown,
  toCostMicros,
  turnTokenBreakdown,
} from "../cost";

const SONNET_4_5 = "claude-sonnet-4-5-20250929";
const HAIKU_4_5 = "claude-haiku-4-5-20251001";

/** One model step as Mastra reports it for an Anthropic model. */
function anthropicStep(tokens: { noCache: number; cacheRead: number; cacheWrite: number; output: number }) {
  const total = tokens.noCache + tokens.cacheRead + tokens.cacheWrite;
  return {
    inputTokens: total,
    outputTokens: tokens.output,
    totalTokens: total + tokens.output,
    cachedInputTokens: tokens.cacheRead,
    raw: {
      inputTokens: { total, noCache: tokens.noCache, cacheRead: tokens.cacheRead, cacheWrite: tokens.cacheWrite },
      outputTokens: { total: tokens.output },
      raw: {
        input_tokens: tokens.noCache,
        cache_read_input_tokens: tokens.cacheRead,
        cache_creation_input_tokens: tokens.cacheWrite,
        output_tokens: tokens.output,
      },
    },
  };
}

/** The turn total Mastra puts on the `finish` chunk: sums, plus the last step's `raw`. */
function turnTotal(steps: ReturnType<typeof anthropicStep>[]) {
  const sum = (pick: (step: ReturnType<typeof anthropicStep>) => number) =>
    steps.reduce((total, step) => total + pick(step), 0);
  return {
    inputTokens: sum((s) => s.inputTokens),
    outputTokens: sum((s) => s.outputTokens),
    totalTokens: sum((s) => s.totalTokens),
    cachedInputTokens: sum((s) => s.cachedInputTokens),
    raw: steps[steps.length - 1]?.raw,
  };
}

describe("resolveModelPricing", () => {
  it("prices the models the Assistant runs on", () => {
    expect(resolveModelPricing(SONNET_4_5)).toMatchObject({ input: 3, output: 15 });
    expect(resolveModelPricing(HAIKU_4_5)).toMatchObject({ input: 1, output: 5 });
  });

  it("picks the most specific entry when a model id contains several", () => {
    // "claude-sonnet-5-5" also contains "claude-sonnet-5".
    expect(resolveModelPricing("claude-sonnet-5-5")).toMatchObject({ cacheReadMultiplier: 0.05 });
    expect(resolveModelPricing("claude-sonnet-5")).toMatchObject({ cacheReadMultiplier: 0.1 });
  });

  it("has no price for a model it does not know", () => {
    expect(resolveModelPricing("some-new-model")).toBeUndefined();
    expect(resolveModelPricing(undefined)).toBeUndefined();
  });
});

describe("a turn with no cache traffic", () => {
  it("costs input plus output at the model's rates", () => {
    const step = anthropicStep({ noCache: 12_000, cacheRead: 0, cacheWrite: 0, output: 800 });
    const tokens = turnTokenBreakdown(turnTotal([step]), [step]);

    expect(tokens).toEqual({
      noCacheInputTokens: 12_000,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 800,
    });
    // 12,000 × $3/M + 800 × $15/M = 0.036 + 0.012
    expect(priceTokenBreakdown(SONNET_4_5, tokens!)).toBe(0.048);
  });
});

describe("a turn served mostly from the prompt cache", () => {
  const step = anthropicStep({ noCache: 400, cacheRead: 60_000, cacheWrite: 0, output: 500 });

  it("bills cache reads at a tenth of the input rate, once", () => {
    const tokens = turnTokenBreakdown(turnTotal([step]), [step]);

    // 400 × $3/M + 60,000 × $0.30/M + 500 × $15/M = 0.0012 + 0.018 + 0.0075
    expect(priceTokenBreakdown(SONNET_4_5, tokens!)).toBe(0.0267);
  });

  it("is far cheaper than billing the whole prompt as fresh input", () => {
    const tokens = turnTokenBreakdown(turnTotal([step]), [step]);
    const asIfUncached = priceTokenBreakdown(SONNET_4_5, {
      noCacheInputTokens: 60_400,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 500,
    });

    expect(priceTokenBreakdown(SONNET_4_5, tokens!)).toBeLessThan(asIfUncached! / 5);
  });
});

describe("a turn that writes the prompt cache", () => {
  it("bills the written tokens at 1.25x the input rate", () => {
    const step = anthropicStep({ noCache: 300, cacheRead: 0, cacheWrite: 50_000, output: 400 });
    const tokens = turnTokenBreakdown(turnTotal([step]), [step]);

    // 300 × $1/M + 50,000 × $1.25/M + 400 × $5/M = 0.0003 + 0.0625 + 0.002
    expect(priceTokenBreakdown(HAIKU_4_5, tokens!)).toBe(0.0648);
  });
});

describe("a turn with several model steps (tool calls)", () => {
  // Step 1 writes the cache; steps 2 and 3 read it and write the new tail.
  const steps = [
    anthropicStep({ noCache: 500, cacheRead: 0, cacheWrite: 40_000, output: 200 }),
    anthropicStep({ noCache: 300, cacheRead: 40_000, cacheWrite: 1_500, output: 250 }),
    anthropicStep({ noCache: 200, cacheRead: 41_500, cacheWrite: 900, output: 600 }),
  ];

  it("adds up every step's own split when the steps are known", () => {
    const tokens = turnTokenBreakdown(turnTotal(steps), steps);

    expect(tokens).toEqual({
      noCacheInputTokens: 1_000,
      cacheReadInputTokens: 81_500,
      cacheWriteInputTokens: 42_400,
      outputTokens: 1_050,
    });
    // 1,000 × $3/M + 81,500 × $0.30/M + 42,400 × $3.75/M + 1,050 × $15/M
    // = 0.003 + 0.02445 + 0.159 + 0.01575
    expect(priceTokenBreakdown(SONNET_4_5, tokens!)).toBe(0.2022);
  });

  it("from the turn total alone, never counts a token in two classes", () => {
    const total = turnTotal(steps);
    const tokens = turnTokenBreakdown(total)!;

    expect(tokens.noCacheInputTokens + tokens.cacheReadInputTokens + tokens.cacheWriteInputTokens).toBe(
      total.inputTokens,
    );
    expect(tokens.cacheReadInputTokens).toBe(81_500);
    // Only the last step's cache write is known, so the earlier writes are
    // priced as plain input: a little under the exact cost, never over.
    expect(tokens.cacheWriteInputTokens).toBe(900);
    const exact = priceTokenBreakdown(SONNET_4_5, turnTokenBreakdown(total, steps)!)!;
    expect(priceTokenBreakdown(SONNET_4_5, tokens)).toBeLessThanOrEqual(exact);
  });

  it("from the turn total of a one-step turn, is exact", () => {
    const step = anthropicStep({ noCache: 300, cacheRead: 20_000, cacheWrite: 5_000, output: 400 });

    expect(turnTokenBreakdown(turnTotal([step]))).toEqual(turnTokenBreakdown(turnTotal([step]), [step]));
  });
});

describe("other usage shapes", () => {
  it("reads the AI SDK result shape, with its inputTokenDetails", () => {
    expect(
      stepTokenBreakdown({
        inputTokens: 10_000,
        inputTokenDetails: { noCacheTokens: 1_000, cacheReadTokens: 8_000, cacheWriteTokens: 1_000 },
        outputTokens: 300,
      }),
    ).toEqual({
      noCacheInputTokens: 1_000,
      cacheReadInputTokens: 8_000,
      cacheWriteInputTokens: 1_000,
      outputTokens: 300,
    });
  });

  it("reads the older promptTokens / completionTokens shape", () => {
    const tokens = turnTokenBreakdown({ promptTokens: 2_000, completionTokens: 500 });

    expect(tokens).toMatchObject({ noCacheInputTokens: 2_000, outputTokens: 500 });
    // 2,000 × $0.15/M + 500 × $0.60/M
    expect(priceTokenBreakdown("gpt-4o-mini", tokens!)).toBe(0.0006);
  });

  it("gives nothing for a usage with no token counts", () => {
    expect(turnTokenBreakdown(undefined)).toBeUndefined();
    expect(turnTokenBreakdown({})).toBeUndefined();
    expect(turnTokenBreakdown({ totalTokens: 42 })).toBeUndefined();
  });
});

describe("priceTokenBreakdown", () => {
  it("has no cost for a model it cannot price", () => {
    expect(
      priceTokenBreakdown("some-new-model", {
        noCacheInputTokens: 100,
        cacheReadInputTokens: 0,
        cacheWriteInputTokens: 0,
        outputTokens: 100,
      }),
    ).toBeUndefined();
  });
});

describe("toCostMicros", () => {
  it("converts dollars to whole millionths", () => {
    expect(toCostMicros(0.2022)).toBe(202_200);
    expect(toCostMicros(0)).toBe(0);
  });
});
