import { describe, expect, it } from "vitest";
import {
  buildSummaryPrompt,
  buildSummarySystemPrompt,
  parseSummaryPayload,
} from "../synthesize";

const event = (sentence: string) => ({
  id: sentence,
  createdAt: new Date("2026-11-11T12:00:00Z"),
  sentence,
  detail: null,
  workspace: "Alpha",
});

describe("parseSummaryPayload", () => {
  it("accepts a narrative with no highlights, for a thin week", () => {
    expect(parseSummaryPayload('{"narrative":"A quiet week.","highlights":[]}')).toEqual({
      narrative: "A quiet week.",
      highlights: [],
    });
  });

  it("rejects more than three highlights, an empty narrative and empty output", () => {
    expect(() =>
      parseSummaryPayload('{"narrative":"n","highlights":["a","b","c","d"]}'),
    ).toThrow();
    expect(() => parseSummaryPayload('{"narrative":"","highlights":[]}')).toThrow();
    expect(() => parseSummaryPayload("   ")).toThrow();
  });
});

describe("buildSummaryPrompt", () => {
  it("lists the events inside the nonce-tagged envelope", () => {
    const prompt = buildSummaryPrompt(
      { name: "Sam", isAgent: false },
      [event("Sam created action A"), event("Sam completed ticket B")],
      { nonce: "abc123", truncated: false },
    );

    expect(prompt).toContain('<user_data nonce="abc123" type="activity_events_newest_first">');
    expect(prompt).toContain("- Sam created action A [Alpha]\n- Sam completed ticket B [Alpha]");
    expect(prompt).not.toContain("most recent events");
  });

  it("says when a busy week was cut to its most recent events", () => {
    const prompt = buildSummaryPrompt({ name: "Sam", isAgent: false }, [event("Sam did X")], {
      nonce: "n",
      truncated: true,
    });

    expect(prompt).toContain("only its most recent events are listed");
  });
});

describe("buildSummarySystemPrompt", () => {
  it("tells the model the list may be partial and not to judge the person", () => {
    const system = buildSummarySystemPrompt("n");

    expect(system).toContain("the list may be partial");
    expect(system).toContain("Do not judge the person");
    expect(system).toContain("third person");
    // A created task is not a finished deed.
    expect(system).toContain("names the item, not a finished deed");
  });
});
