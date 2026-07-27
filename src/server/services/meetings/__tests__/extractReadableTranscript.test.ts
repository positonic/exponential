/**
 * Behaviour tests for extractReadableTranscript after it was routed through the
 * shared transcript parser (ADR-0032). Guards the summarizer-feed contract:
 * Fireflies blobs stay byte-equivalent; Me:/Them: pastes drop header noise.
 */

import { describe, expect, it } from "vitest";
import { extractReadableTranscript } from "../extractReadableTranscript";

describe("extractReadableTranscript", () => {
  it("formats a Fireflies { sentences } blob as speaker-prefixed lines", () => {
    const blob = JSON.stringify({
      sentences: [
        { text: "Welcome.", speaker_name: "Alice", start_time: 0, end_time: 1 },
        { text: "Thanks.", speaker_name: "Bob", start_time: 1, end_time: 2 },
      ],
    });
    expect(extractReadableTranscript(blob)).toBe("Alice: Welcome.\nBob: Thanks.");
  });

  it("derives readable dialogue from a Me:/Them: paste, dropping the header block", () => {
    const raw = [
      "Meeting Title: Sync",
      "Date: 04 Jun 2026",
      "Transcript:",
      "Me: Hello there. [SCREENSHOT]",
      "Them: Hi!",
    ].join("\n");
    // Header lines and the [SCREENSHOT] marker are gone; only dialogue remains.
    expect(extractReadableTranscript(raw)).toBe("Me: Hello there.\nThem: Hi!");
  });

  it("returns the prose for an unstructured transcript", () => {
    expect(extractReadableTranscript("just a freeform note")).toBe("just a freeform note");
  });

  it("returns an empty string for null/empty input", () => {
    expect(extractReadableTranscript(null)).toBe("");
    expect(extractReadableTranscript("   ")).toBe("");
  });
});
