import { describe, expect, it } from "vitest";
import { labelledTurnsParser } from "../labelled-turns";
import type { TranscriptInput } from "../types";
import { GRANOLA_TIMESTAMPED, MELISSA_PLAIN_TEXT } from "./fixtures";

function input(transcription: string, participants: TranscriptInput["participants"] = []): TranscriptInput {
  return { transcription, sentencesJson: null, participants };
}

describe("labelledTurnsParser", () => {
  it("parses Me: / Them: into alternating me/them turns with null startTime", () => {
    const turns = labelledTurnsParser.parse(input(MELISSA_PLAIN_TEXT));

    expect(turns.map((t) => t.flavor)).toEqual(["me", "them", "me", "them"]);
    expect(turns.map((t) => t.speaker)).toEqual(["Me", "Them", "Me", "Them"]);
    expect(turns.every((t) => t.startTime === null)).toBe(true);
  });

  it("derives zero turns from the header block", () => {
    const turns = labelledTurnsParser.parse(input(MELISSA_PLAIN_TEXT));
    const speakers = turns.map((t) => t.speaker);

    expect(speakers).not.toContain("Meeting Title");
    expect(speakers).not.toContain("Date");
    expect(speakers).not.toContain("Meeting participants");
    // Exactly the four dialogue turns — no header leaked through.
    expect(turns).toHaveLength(4);
  });

  it("accumulates multi-line speech into one turn until the next label", () => {
    const turns = labelledTurnsParser.parse(input(MELISSA_PLAIN_TEXT));
    // Them's first turn spans two source lines.
    expect(turns[1]?.text).toBe(
      "Of course! I wanted to walk through the onboarding flow and the couple of edge cases we hit last week.",
    );
  });

  it("strips [SCREENSHOT] markers from turn text", () => {
    const turns = labelledTurnsParser.parse(input(MELISSA_PLAIN_TEXT));
    expect(turns.some((t) => t.text.includes("SCREENSHOT"))).toBe(false);
    expect(turns[2]?.text).toBe("Perfect. Here's where it breaks.");
  });

  it("a [SCREENSHOT] at end of line does not merge the next turn", () => {
    const raw = ["Me: done here. [SCREENSHOT]", "Them: my reply"].join("\n");
    const turns = labelledTurnsParser.parse(input(raw));
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ speaker: "Me", text: "done here." });
    expect(turns[1]).toMatchObject({ speaker: "Them", text: "my reply" });
  });

  it("rotates them/alt for 3+ distinct speakers, stable by first appearance", () => {
    const raw = [
      "Alice: one",
      "Bob: two",
      "Carol: three",
      "Bob: four",
      "Alice: five",
    ].join("\n");

    const turns = labelledTurnsParser.parse(input(raw));
    expect(turns.map((t) => t.flavor)).toEqual([
      "them", // Alice (first non-me)
      "alt", // Bob (second)
      "them", // Carol (third, rotates back)
      "alt", // Bob again — stable
      "them", // Alice again — stable
    ]);
  });

  it("maps a host participant's name to me", () => {
    const raw = ["Alice: hi", "Bob: hey"].join("\n");
    const turns = labelledTurnsParser.parse(
      input(raw, [{ name: "Alice", isHost: true }]),
    );
    expect(turns[0]?.flavor).toBe("me");
    expect(turns[1]?.flavor).toBe("them");
  });

  it("treats an unknown leading label as a real turn (conservative)", () => {
    const raw = ["Foo: this is a real opening line", "Them: reply"].join("\n");
    const turns = labelledTurnsParser.parse(input(raw));
    expect(turns[0]).toMatchObject({ speaker: "Foo", text: "this is a real opening line" });
    expect(turns).toHaveLength(2);
  });

  it("drops known meta header labels even without a Transcript: marker", () => {
    const raw = ["Date: today", "Participants: a, b", "Me: hello"].join("\n");
    const turns = labelledTurnsParser.parse(input(raw));
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ speaker: "Me", flavor: "me" });
  });

  it("splits a Granola `[m:ss] Speaker: text` transcript into one timed turn per line", () => {
    expect(labelledTurnsParser.canParse(input(GRANOLA_TIMESTAMPED))).toBe(true);
    const turns = labelledTurnsParser.parse(input(GRANOLA_TIMESTAMPED));

    expect(turns.map((t) => [t.startTime, t.speaker, t.text])).toEqual([
      [0, "Microphone", "Hello, can everyone hear me?"],
      [4, "System audio", "Yes, loud and clear."],
      [75, "Microphone", "Good. Decision: we ship the importer on Friday."],
      // Granola counts minutes past the hour rather than rolling over.
      [3750, "System audio", "Agreed, Friday it is."],
    ]);
    expect(turns.map((t) => t.flavor)).toEqual(["them", "alt", "them", "alt"]);
  });

  it("reads `[h:mm:ss]` as hours, minutes and seconds", () => {
    const turns = labelledTurnsParser.parse(input("[1:02:03] Alice: late in the meeting"));
    expect(turns).toEqual([
      { text: "late in the meeting", speaker: "Alice", flavor: "them", startTime: 3723 },
    ]);
  });

  it("starts a speaker-less turn at a timestamp with no label, and keeps accumulating", () => {
    const raw = ["[0:10] first thought", "carries on here", "[0:20] second thought"].join("\n");
    expect(labelledTurnsParser.canParse(input(raw))).toBe(true);
    expect(labelledTurnsParser.parse(input(raw))).toEqual([
      { text: "first thought carries on here", speaker: null, flavor: null, startTime: 10 },
      { text: "second thought", speaker: null, flavor: null, startTime: 20 },
    ]);
  });

  it("keeps a timestamped line as speech even when its label reads like a header", () => {
    const turns = labelledTurnsParser.parse(input("[0:05] Notes: are in the doc"));
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ speaker: "Notes", startTime: 5 });
  });

  it("does not read a bracketed time in the middle of a line as a new turn", () => {
    const turns = labelledTurnsParser.parse(input("Me: jump to [12:30] in the recording"));
    expect(turns).toEqual([
      { text: "jump to [12:30] in the recording", speaker: "Me", flavor: "me", startTime: null },
    ]);
  });

  it("canParse is false for label-less prose and empty input", () => {
    expect(labelledTurnsParser.canParse(input("just some prose, no labels"))).toBe(false);
    expect(labelledTurnsParser.canParse(input("   "))).toBe(false);
    expect(labelledTurnsParser.canParse(input(MELISSA_PLAIN_TEXT))).toBe(true);
  });
});
