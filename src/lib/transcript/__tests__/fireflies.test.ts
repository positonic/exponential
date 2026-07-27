import { describe, expect, it } from "vitest";
import { firefliesParser } from "../fireflies";
import type { TranscriptInput } from "../types";
import { FIREFLIES_BLOB, FIREFLIES_SENTENCES } from "./fixtures";

function input(partial: Partial<TranscriptInput>): TranscriptInput {
  return {
    transcription: null,
    sentencesJson: null,
    participants: [],
    ...partial,
  };
}

describe("firefliesParser", () => {
  it("parses a sentencesJson array, preserving names and timestamps", () => {
    const turns = firefliesParser.parse(input({ sentencesJson: FIREFLIES_SENTENCES }));

    expect(turns).toHaveLength(4);
    expect(turns[0]).toMatchObject({ speaker: "Alice", text: "Welcome everyone.", startTime: 0 });
    expect(turns[2]).toMatchObject({ speaker: "Bob", text: "Happy to be here.", startTime: 4 });
    expect(turns[3]?.startTime).toBe(6);
  });

  it("parses a { sentences: [...] } JSON blob in transcription", () => {
    const turns = firefliesParser.parse(input({ transcription: FIREFLIES_BLOB }));
    expect(turns).toHaveLength(4);
    expect(turns.map((t) => t.speaker)).toEqual(["Alice", "Alice", "Bob", "Carol"]);
  });

  it("resolves flavor from the host participant, rotating the rest", () => {
    const turns = firefliesParser.parse(
      input({ sentencesJson: FIREFLIES_SENTENCES, participants: [{ name: "Alice", isHost: true }] }),
    );
    // Alice = host → me; Bob first other → them; Carol second other → alt.
    expect(turns.map((t) => t.flavor)).toEqual(["me", "me", "them", "alt"]);
  });

  it("canParse ignores provider — content drives detection", () => {
    expect(firefliesParser.canParse(input({ sentencesJson: FIREFLIES_SENTENCES }))).toBe(true);
    expect(firefliesParser.canParse(input({ transcription: FIREFLIES_BLOB }))).toBe(true);
    expect(firefliesParser.canParse(input({ transcription: "Me: hi\nThem: yo" }))).toBe(false);
    expect(firefliesParser.canParse(input({ sentencesJson: [] }))).toBe(false);
  });

  it("yields flavor null for a sentence with no speaker name", () => {
    const turns = firefliesParser.parse(
      input({ sentencesJson: [{ text: "anon line", speaker_name: null, start_time: 1 }] }),
    );
    expect(turns[0]).toMatchObject({ speaker: null, flavor: null, startTime: 1 });
  });
});
