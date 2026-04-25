import { describe, it, expect } from "vitest";
import {
  filterAgentInstructions,
  AGENT_FILTER_DEFAULTS,
} from "../agentInstructionFilter";

const validPrompt = "A".repeat(100);

describe("filterAgentInstructions", () => {
  it("accepts well-formed string instructions", () => {
    const result = filterAgentInstructions([
      { id: "zoe", instructions: validPrompt },
    ]);

    expect(result.valid).toEqual([{ id: "zoe", instructions: validPrompt }]);
    expect(result.skipped).toEqual([]);
    expect(result.truncated).toEqual([]);
  });

  it("skips agents whose instructions are not a string", () => {
    const result = filterAgentInstructions([
      { id: "broken-array", instructions: [{ role: "system", content: "x" }] },
      { id: "broken-object", instructions: { content: "x" } },
      { id: "broken-undefined", instructions: undefined },
      { id: "broken-null", instructions: null },
    ]);

    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([
      { id: "broken-array", reason: "instructions is not a string", type: "array" },
      { id: "broken-object", reason: "instructions is not a string", type: "object" },
      { id: "broken-undefined", reason: "instructions is not a string", type: "undefined" },
      { id: "broken-null", reason: "instructions is not a string", type: "object" },
    ]);
  });

  it("skips agents with instructions below the minimum length", () => {
    // This is the exact shape of the cachedSystemPrompt regression:
    // instructions serialized to length-1 garbage.
    const result = filterAgentInstructions([
      { id: "length-1", instructions: "x" },
      { id: "empty", instructions: "" },
      { id: "whitespace", instructions: "   \n\n   " },
    ]);

    expect(result.valid).toEqual([]);
    expect(result.skipped).toHaveLength(3);
    expect(result.skipped.every((s) => s.reason.startsWith("instructions shorter than"))).toBe(true);
  });

  it("truncates instructions that exceed the maximum length", () => {
    const huge = "B".repeat(AGENT_FILTER_DEFAULTS.maxInstructionChars + 500);
    const result = filterAgentInstructions([{ id: "huge", instructions: huge }]);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]!.id).toBe("huge");
    expect(result.valid[0]!.instructions).toHaveLength(AGENT_FILTER_DEFAULTS.maxInstructionChars);
    expect(result.truncated).toEqual([
      {
        id: "huge",
        originalLength: huge.length,
        truncatedLength: AGENT_FILTER_DEFAULTS.maxInstructionChars,
      },
    ]);
  });

  it("partitions a mixed batch into valid / skipped / truncated", () => {
    const huge = "C".repeat(AGENT_FILTER_DEFAULTS.maxInstructionChars + 1);
    const result = filterAgentInstructions([
      { id: "ok", instructions: validPrompt },
      { id: "broken", instructions: "x" },
      { id: "huge", instructions: huge },
      { id: "non-string", instructions: 42 },
    ]);

    expect(result.valid.map((v) => v.id)).toEqual(["ok", "huge"]);
    expect(result.skipped.map((s) => s.id)).toEqual(["broken", "non-string"]);
    expect(result.truncated.map((t) => t.id)).toEqual(["huge"]);
  });

  it("honors custom thresholds", () => {
    const result = filterAgentInstructions(
      [{ id: "short-but-valid", instructions: "short" }],
      { minInstructionChars: 3, maxInstructionChars: 100 },
    );

    expect(result.valid).toEqual([{ id: "short-but-valid", instructions: "short" }]);
    expect(result.skipped).toEqual([]);
  });
});
