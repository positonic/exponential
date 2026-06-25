import { describe, expect, it } from "vitest";
import { parseTranscript } from "../registry";
import type { TranscriptInput } from "../types";
import { FIREFLIES_BLOB, FIREFLIES_SENTENCES, MELISSA_PLAIN_TEXT } from "./fixtures";

function input(partial: Partial<TranscriptInput>): TranscriptInput {
  return { transcription: null, sentencesJson: null, participants: [], ...partial };
}

describe("parseTranscript — dispatch", () => {
  it("routes Fireflies sentencesJson to the fireflies parser", () => {
    const turns = parseTranscript(input({ sentencesJson: FIREFLIES_SENTENCES }));
    expect(turns).toHaveLength(4);
    expect(turns[0]).toMatchObject({ speaker: "Alice", startTime: 0 });
  });

  it("routes the Melissa Me:/Them: paste to labelled-turns", () => {
    const turns = parseTranscript(input({ transcription: MELISSA_PLAIN_TEXT }));
    expect(turns.map((t) => t.flavor)).toEqual(["me", "them", "me", "them"]);
    expect(turns.every((t) => t.startTime === null)).toBe(true);
  });

  it("never lets a Fireflies blob fall through to labelled-turns", () => {
    // The blob's JSON keys (e.g. "speaker_name":) must not be read as labels.
    const turns = parseTranscript(input({ transcription: FIREFLIES_BLOB }));
    expect(turns.map((t) => t.speaker)).toEqual(["Alice", "Alice", "Bob", "Carol"]);
    expect(turns.every((t) => t.startTime !== null)).toBe(true);
  });

  it("falls back to one speaker-less turn for unstructured text", () => {
    const turns = parseTranscript(input({ transcription: "just a freeform paragraph" }));
    expect(turns).toEqual([
      { text: "just a freeform paragraph", speaker: null, flavor: null, startTime: null },
    ]);
  });

  it("yields no turns for empty/whitespace input", () => {
    expect(parseTranscript(input({ transcription: "" }))).toEqual([]);
    expect(parseTranscript(input({ transcription: "   \n  " }))).toEqual([]);
    expect(parseTranscript(input({ transcription: null, sentencesJson: null }))).toEqual([]);
  });
});
