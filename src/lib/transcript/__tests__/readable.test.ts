import { describe, expect, it } from "vitest";
import { parseTranscript } from "../registry";
import { turnsToReadableText } from "../readable";
import type { TranscriptInput } from "../types";
import { FIREFLIES_SENTENCES, MELISSA_PLAIN_TEXT } from "./fixtures";

function input(partial: Partial<TranscriptInput>): TranscriptInput {
  return { transcription: null, sentencesJson: null, participants: [], ...partial };
}

describe("turnsToReadableText", () => {
  it("round-trips structured Fireflies turns to speaker-prefixed lines", () => {
    const turns = parseTranscript(input({ sentencesJson: FIREFLIES_SENTENCES }));
    expect(turnsToReadableText(turns)).toBe(
      [
        "Alice: Welcome everyone.",
        "Alice: Thanks for joining.",
        "Bob: Happy to be here.",
        "Carol: Let me share an update.",
      ].join("\n"),
    );
  });

  it("round-trips a plain-text Me:/Them: paste to readable dialogue", () => {
    const turns = parseTranscript(input({ transcription: MELISSA_PLAIN_TEXT }));
    expect(turnsToReadableText(turns)).toBe(
      [
        "Me: Hey Melissa, thanks for hopping on.",
        "Them: Of course! I wanted to walk through the onboarding flow and the couple of edge cases we hit last week.",
        "Me: Perfect. Here's where it breaks.",
        "Them: Got it — that lines up with what I saw.",
      ].join("\n"),
    );
  });

  it("emits bare text for a speaker-less fallback turn", () => {
    const turns = parseTranscript(input({ transcription: "freeform note" }));
    expect(turnsToReadableText(turns)).toBe("freeform note");
  });
});
