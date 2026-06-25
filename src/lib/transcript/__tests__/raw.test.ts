import { describe, expect, it } from "vitest";
import { rawParser } from "../raw";
import type { TranscriptInput } from "../types";

function input(transcription: string | null): TranscriptInput {
  return { transcription, sentencesJson: null, participants: [] };
}

describe("rawParser", () => {
  it("yields one speaker-less, flavor-null turn for unstructured text", () => {
    const turns = rawParser.parse(input("a freeform note with no speaker labels"));
    expect(turns).toEqual([
      { text: "a freeform note with no speaker labels", speaker: null, flavor: null, startTime: null },
    ]);
  });

  it("never invents a speaker", () => {
    const turns = rawParser.parse(input("hello world"));
    expect(turns[0]?.speaker).toBeNull();
    expect(turns[0]?.flavor).toBeNull();
  });

  it("strips [SCREENSHOT] markers", () => {
    const turns = rawParser.parse(input("before [SCREENSHOT]. after"));
    expect(turns[0]?.text).toBe("before after");
  });

  it("yields no turns for empty or whitespace-only input", () => {
    expect(rawParser.parse(input("   \n  "))).toEqual([]);
    expect(rawParser.parse(input(""))).toEqual([]);
    expect(rawParser.parse(input(null))).toEqual([]);
  });
});
