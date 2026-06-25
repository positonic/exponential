import { describe, expect, it } from "vitest";
import { labelledTurnsParser } from "../labelled-turns";
import type { TranscriptInput } from "../types";
import { MELISSA_PLAIN_TEXT } from "./fixtures";

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

  it("canParse is false for label-less prose and empty input", () => {
    expect(labelledTurnsParser.canParse(input("just some prose, no labels"))).toBe(false);
    expect(labelledTurnsParser.canParse(input("   "))).toBe(false);
    expect(labelledTurnsParser.canParse(input(MELISSA_PLAIN_TEXT))).toBe(true);
  });
});
