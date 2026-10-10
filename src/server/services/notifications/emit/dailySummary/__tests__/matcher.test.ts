import { describe, expect, it } from "vitest";
import { matchRecordingsToEvents, titleWords } from "../matcher";

const at = (iso: string) => new Date(iso);

function event(title: string, start: string, end: string) {
  return { title, start: at(start), end: at(end) };
}
function recording(id: string, title: string | null, meetingDate: string) {
  return { id, title, meetingDate: at(meetingDate) };
}

describe("titleWords", () => {
  it("lower-cases, splits on non-alphanumerics and drops words under three characters", () => {
    expect([...titleWords("CLEAR daily standup — w/ Ira & co")]).toEqual([
      "clear",
      "daily",
      "standup",
      "ira",
    ]);
    expect(titleWords(null).size).toBe(0);
  });
});

describe("matchRecordingsToEvents", () => {
  const standup = event("CLEAR daily standup", "2026-09-08T07:00:00Z", "2026-09-08T07:15:00Z");
  const coffee = event("Coffee with Ira", "2026-09-08T12:00:00Z", "2026-09-08T12:30:00Z");

  it("matches a recording inside a single overlapping event's window", () => {
    const rec = recording("r1", "Daily standup notes", "2026-09-08T07:02:00Z");
    const { byEvent, unmatched } = matchRecordingsToEvents([standup, coffee], [rec]);
    expect(byEvent.get(standup)).toBe(rec);
    expect(byEvent.has(coffee)).toBe(false);
    expect(unmatched).toEqual([]);
  });

  it("accepts a recording up to 15 minutes outside the event window, not beyond", () => {
    const early = recording("r1", null, "2026-09-08T06:46:00Z");
    const tooEarly = recording("r2", null, "2026-09-08T06:44:00Z");
    const late = recording("r3", null, "2026-09-08T07:30:00Z");
    expect(matchRecordingsToEvents([standup], [early]).byEvent.get(standup)).toBe(early);
    expect(matchRecordingsToEvents([standup], [tooEarly]).unmatched).toEqual([tooEarly]);
    expect(matchRecordingsToEvents([standup], [late]).byEvent.get(standup)).toBe(late);
  });

  it("resolves two overlapping events by shared title words", () => {
    const sync = event("Pipeline sync", "2026-09-08T07:00:00Z", "2026-09-08T07:30:00Z");
    const rec = recording("r1", "Pipeline sync (recorded)", "2026-09-08T07:05:00Z");
    // `standup` starts earlier, so without the title tie-break it would win.
    const { byEvent } = matchRecordingsToEvents([standup, sync], [rec]);
    expect(byEvent.get(sync)).toBe(rec);
    expect(byEvent.has(standup)).toBe(false);
  });

  it("breaks a title tie by the earliest start", () => {
    const later = event("Design review", "2026-09-08T07:05:00Z", "2026-09-08T07:45:00Z");
    const rec = recording("r1", "Untitled", "2026-09-08T07:10:00Z");
    const { byEvent } = matchRecordingsToEvents([later, standup], [rec]);
    expect(byEvent.get(standup)).toBe(rec);
  });

  it("gives each event at most one recording: the second overlapping recording stays unmatched", () => {
    const first = recording("r1", null, "2026-09-08T07:01:00Z");
    const second = recording("r2", null, "2026-09-08T07:10:00Z");
    // Passed out of order to prove the greedy pass runs in meetingDate order.
    const { byEvent, unmatched } = matchRecordingsToEvents([standup], [second, first]);
    expect(byEvent.get(standup)).toBe(first);
    expect(unmatched).toEqual([second]);
  });

  it("never matches an all-day event and reports recordings with no candidate as unmatched", () => {
    const allDay = { title: "Offsite", start: null, end: null };
    const rec = recording("r1", "Offsite", "2026-09-08T10:00:00Z");
    const { byEvent, unmatched } = matchRecordingsToEvents([allDay, standup], [rec]);
    expect(byEvent.size).toBe(0);
    expect(unmatched).toEqual([rec]);
  });
});
