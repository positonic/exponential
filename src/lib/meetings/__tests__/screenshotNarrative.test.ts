import { describe, expect, it } from "vitest";
import {
  buildScreenshotNarrative,
  countScreenshotMarkers,
  sortScreenshotsChronologically,
} from "../screenshotNarrative";

function shot(id: string, createdAt: string, timestamp = "") {
  return { id, url: `https://blob.test/${id}.png`, timestamp, createdAt };
}

describe("buildScreenshotNarrative", () => {
  it("pairs the n-th marker's preceding prose with the n-th screenshot by capture time", () => {
    const transcription =
      "Visually great. I don't like the line break here. [SCREENSHOT] " +
      "I don't like the indentation here. [SCREENSHOT] Closing remarks.";
    // Newest first, the order `getDetail` returns them in.
    const screenshots = [shot("b", "2026-10-05T10:01:00Z"), shot("a", "2026-10-05T10:00:00Z")];

    const entries = buildScreenshotNarrative(transcription, screenshots);

    expect(entries.map((e) => e.screenshot.id)).toEqual(["a", "b"]);
    expect(entries.map((e) => e.index)).toEqual([1, 2]);
    expect(entries[0]!.turns).toEqual([
      {
        text: "Visually great. I don't like the line break here.",
        speaker: null,
        flavor: null,
        startTime: null,
      },
    ]);
    expect(entries[1]!.turns.map((t) => t.text)).toEqual([
      "I don't like the indentation here.",
    ]);
  });

  it("drops the prose said after the final capture", () => {
    const entries = buildScreenshotNarrative("before [SCREENSHOT] after", [
      shot("a", "2026-10-05T10:00:00Z"),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.turns.map((t) => t.text)).toEqual(["before"]);
  });

  it("gives screenshots beyond the marker count no turns (hand-attached images)", () => {
    const entries = buildScreenshotNarrative("said [SCREENSHOT]. more", [
      shot("a", "2026-10-05T10:00:00Z", "00:12"),
      shot("uploaded", "2026-10-05T11:00:00Z"),
    ]);
    expect(entries[0]!.turns.map((t) => t.text)).toEqual(["said"]);
    expect(entries[1]!.turns).toEqual([]);
  });

  it("returns every screenshot with no turns when there is no transcript", () => {
    const entries = buildScreenshotNarrative(null, [shot("a", "2026-10-05T10:00:00Z")]);
    expect(entries).toEqual([
      { screenshot: shot("a", "2026-10-05T10:00:00Z"), index: 1, turns: [] },
    ]);
  });

  it("attributes `Name:` lines to speakers inside a segment", () => {
    const transcription = [
      "Me: Hey, thanks for hopping on.",
      "Them: Of course. Here is the onboarding flow. [SCREENSHOT]",
      "Me: Got it.",
    ].join("\n");
    const entries = buildScreenshotNarrative(transcription, [shot("a", "2026-10-05T10:00:00Z")]);
    expect(entries[0]!.turns.map((t) => [t.speaker, t.text])).toEqual([
      ["Me", "Hey, thanks for hopping on."],
      ["Them", "Of course. Here is the onboarding flow."],
    ]);
  });

  it("ignores an empty segment between back-to-back markers", () => {
    const entries = buildScreenshotNarrative("one [SCREENSHOT] [SCREENSHOT] three", [
      shot("a", "2026-10-05T10:00:00Z"),
      shot("b", "2026-10-05T10:01:00Z"),
    ]);
    expect(entries[0]!.turns.map((t) => t.text)).toEqual(["one"]);
    expect(entries[1]!.turns).toEqual([]);
  });
});

describe("countScreenshotMarkers", () => {
  it("counts markers with or without a trailing period", () => {
    expect(countScreenshotMarkers("a [SCREENSHOT]. b [SCREENSHOT] c")).toBe(2);
    expect(countScreenshotMarkers("no markers")).toBe(0);
    expect(countScreenshotMarkers(null)).toBe(0);
  });
});

describe("sortScreenshotsChronologically", () => {
  it("orders oldest first and accepts Date or ISO string", () => {
    const sorted = sortScreenshotsChronologically([
      { id: "late", createdAt: new Date("2026-10-05T10:02:00Z") },
      { id: "early", createdAt: "2026-10-05T10:00:00Z" },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["early", "late"]);
  });
});
