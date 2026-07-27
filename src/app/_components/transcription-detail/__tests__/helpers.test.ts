import { describe, expect, it } from "vitest";
import { parseTurns } from "../helpers";

describe("parseTurns — plain-text speaker parsing", () => {
  it("does not treat metadata header lines as speakers", () => {
    // Shape of a manually pasted transcript with a header block, like the
    // stuck meeting manual_1781869219525.
    const raw = [
      "Meeting Title: Weekly Sync",
      "Date: 04 Jun 2026",
      "Meeting participants: Alice, Bob",
      "Transcript:",
      "Me: Hello there",
      "Them: Hi, how are you?",
    ].join("\n");

    const turns = parseTurns(raw, null);
    const speakers = new Set(turns.map((t) => t.speaker));

    // Header keys must never surface as speakers (CONTEXT.md → Speaker). They
    // collapse into the generic "Transcript" orphan-text bucket instead of
    // becoming fake speakers named after each header key.
    expect(speakers.has("Meeting Title")).toBe(false);
    expect(speakers.has("Date")).toBe(false);
    expect(speakers.has("Meeting participants")).toBe(false);

    // Real speakers from the dialogue are still parsed.
    expect(speakers.has("Me")).toBe(true);
    expect(speakers.has("Them")).toBe(true);

    // The only non-dialogue "speaker" is the generic orphan-text bucket — no
    // header key leaked through as its own speaker.
    expect([...speakers].sort()).toEqual(["Me", "Them", "Transcript"]);
  });

  it("keeps the dialogue turns intact for transcript navigation", () => {
    const raw = ["Me: First line", "Them: Second line", "Me: Third line"].join(
      "\n",
    );

    const turns = parseTurns(raw, null);
    const dialogue = turns.filter((t) => t.speaker === "Me" || t.speaker === "Them");

    expect(dialogue).toHaveLength(3);
    expect(dialogue[0]).toMatchObject({ speaker: "Me", text: "First line" });
    expect(dialogue[1]).toMatchObject({ speaker: "Them", text: "Second line" });
    expect(dialogue[2]).toMatchObject({ speaker: "Me", text: "Third line" });
  });

  it("matching is case-insensitive for header keys", () => {
    const raw = ["DATE: today", "notes: be brief", "Speaker A: real turn"].join(
      "\n",
    );

    const turns = parseTurns(raw, null);
    const speakers = new Set(turns.map((t) => t.speaker));

    expect(speakers.has("DATE")).toBe(false);
    expect(speakers.has("notes")).toBe(false);
    expect(speakers.has("Speaker A")).toBe(true);
  });
});
