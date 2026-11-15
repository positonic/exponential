/**
 * Reading a Mastra `generate` result for metering: the model that answered,
 * the turn's usage and each step's own. The result is JSON off the network,
 * so a missing or malformed field must read as "not reported", never throw.
 */

import { describe, expect, it } from "vitest";
import { readGenerateUsage } from "../mastraUsage";

describe("readGenerateUsage", () => {
  it("reads the model, the turn's usage and every step's usage", () => {
    const output = {
      text: "Done.",
      usage: { inputTokens: 300, outputTokens: 40 },
      steps: [
        { usage: { inputTokens: 100, outputTokens: 10 } },
        { usage: { inputTokens: 200, outputTokens: 30 } },
      ],
      response: { modelId: "claude-sonnet-4-5-20250929" },
    };

    expect(readGenerateUsage(output)).toEqual({
      modelId: "claude-sonnet-4-5-20250929",
      turnUsage: { inputTokens: 300, outputTokens: 40 },
      stepUsages: [
        { inputTokens: 100, outputTokens: 10 },
        { inputTokens: 200, outputTokens: 30 },
      ],
    });
  });

  it("takes the model from the last step when the result itself names none", () => {
    const output = {
      steps: [{ response: { modelId: "claude-haiku-4-5" } }, { response: { modelId: "claude-sonnet-4-5" } }],
    };

    expect(readGenerateUsage(output).modelId).toBe("claude-sonnet-4-5");
  });

  it("reads the older `model` and `tokenUsage` names", () => {
    const output = { model: "gpt-4o-mini", tokenUsage: { promptTokens: 10, completionTokens: 2 } };

    expect(readGenerateUsage(output)).toEqual({
      modelId: "gpt-4o-mini",
      turnUsage: { promptTokens: 10, completionTokens: 2 },
      stepUsages: [],
    });
  });

  it("leaves out steps that report no usage", () => {
    const output = { steps: [{ toolCalls: [] }, { usage: { inputTokens: 5, outputTokens: 1 } }] };

    expect(readGenerateUsage(output).stepUsages).toEqual([{ inputTokens: 5, outputTokens: 1 }]);
  });

  it("reports nothing for a reply with no usage, or that is not an object", () => {
    const nothing = { modelId: undefined, turnUsage: undefined, stepUsages: [] };

    expect(readGenerateUsage({ text: "ok" })).toEqual(nothing);
    expect(readGenerateUsage("plain text")).toEqual(nothing);
    expect(readGenerateUsage(null)).toEqual(nothing);
    expect(readGenerateUsage({ steps: "not a list", response: { modelId: 42 } })).toEqual(nothing);
  });
});
