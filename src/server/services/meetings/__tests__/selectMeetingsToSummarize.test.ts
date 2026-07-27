/**
 * Unit tests for `selectMeetingsToSummarize` — the pure gate the auto-summarize
 * cron sweep (ADR-0018, royal.raven) uses to decide which meetings to summarize.
 *
 * Pure function, no DB or IO, so these run in microseconds and need no mocking
 * (prior art: recordActivity.test.ts / heatmap.test.ts style).
 */

import { describe, it, expect } from "vitest";
import {
  selectMeetingsToSummarize,
  type SummarizableMeeting,
} from "../selectMeetingsToSummarize";

const meeting = (
  id: string,
  transcription: string | null,
  summary: string | null,
): SummarizableMeeting => ({ id, transcription, summary });

describe("selectMeetingsToSummarize", () => {
  it("selects meetings with a transcript and no summary", () => {
    const result = selectMeetingsToSummarize([
      meeting("a", "we discussed the roadmap", null),
    ]);
    expect(result.map((m) => m.id)).toEqual(["a"]);
  });

  it("excludes already-summarised meetings", () => {
    const result = selectMeetingsToSummarize([
      meeting("a", "transcript", '{"overview":"done"}'),
    ]);
    expect(result).toEqual([]);
  });

  it("excludes transcript-less meetings", () => {
    const result = selectMeetingsToSummarize([
      meeting("null-transcript", null, null),
      meeting("empty-transcript", "", null),
      meeting("whitespace-transcript", "   \n  ", null),
    ]);
    expect(result).toEqual([]);
  });

  it("treats an empty/whitespace summary as not summarised yet", () => {
    const result = selectMeetingsToSummarize([
      meeting("empty-summary", "transcript", ""),
      meeting("whitespace-summary", "transcript", "  \n "),
    ]);
    expect(result.map((m) => m.id)).toEqual([
      "empty-summary",
      "whitespace-summary",
    ]);
  });

  it("filters a mixed batch down to only the eligible rows, preserving order", () => {
    const result = selectMeetingsToSummarize([
      meeting("eligible-1", "t1", null),
      meeting("already-done", "t2", '{"overview":"x"}'),
      meeting("no-transcript", null, null),
      meeting("eligible-2", "t3", null),
    ]);
    expect(result.map((m) => m.id)).toEqual(["eligible-1", "eligible-2"]);
  });

  it("returns an empty array for an empty batch", () => {
    expect(selectMeetingsToSummarize([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [
      meeting("a", "t", null),
      meeting("b", "t", '{"overview":"x"}'),
    ];
    const snapshot = [...input];
    selectMeetingsToSummarize(input);
    expect(input).toEqual(snapshot);
  });

  it("preserves caller-extended row shape (structural subtype)", () => {
    interface RichMeeting extends SummarizableMeeting {
      title: string | null;
    }
    const rows: RichMeeting[] = [
      { id: "a", transcription: "t", summary: null, title: "Standup" },
    ];
    const result = selectMeetingsToSummarize(rows);
    expect(result[0]?.title).toBe("Standup");
  });
});
