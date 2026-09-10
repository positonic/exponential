import { describe, expect, it } from "vitest";
import { aliasMatches, matchOccurrence, type OccurrenceCandidate } from "../matchOccurrence";
import { normaliseTitleTokens, tokenizeTitle } from "~/lib/meetings/titleTokens";

const standupMon: OccurrenceCandidate = {
  id: "occ-mon",
  scheduledStart: new Date("2026-09-07T07:00:00.000Z"),
  durationMinutes: 15,
  aliases: ["Daily Standup", "Standup"],
};
const standupTue: OccurrenceCandidate = { ...standupMon, id: "occ-tue", scheduledStart: new Date("2026-09-08T07:00:00.000Z") };
const planning: OccurrenceCandidate = {
  id: "occ-plan",
  scheduledStart: new Date("2026-09-07T09:00:00.000Z"),
  durationMinutes: 60,
  aliases: ["Planning Meeting", "Cycle Planning"],
  scheduledMeetingIcalUid: "uid-planning-cycle14",
};
const all = [standupMon, standupTue, planning];

describe("title tokens", () => {
  it("alias normalisation keeps meeting-pattern words that the related-meetings tokenizer drops", () => {
    expect(normaliseTitleTokens("Daily Standup — CLEAR")).toEqual(["daily", "standup", "clear"]);
    expect(tokenizeTitle("Daily Standup — CLEAR")).toEqual(["clear"]);
  });

  it("aliasMatches requires every alias token", () => {
    const tokens = new Set(normaliseTitleTokens("Planning Meeting 20/08 - Cycle 14"));
    expect(aliasMatches(tokens, "Planning Meeting")).toBe(true);
    expect(aliasMatches(tokens, "Cycle Planning")).toBe(true);
    expect(aliasMatches(tokens, "Sprint Planning")).toBe(false);
    expect(aliasMatches(tokens, "")).toBe(false);
  });
});

describe("matchOccurrence", () => {
  it("a calendar recurrence id beats every alias and ignores the time window", () => {
    const match = matchOccurrence(
      { title: "Daily Standup", meetingDate: new Date("2026-09-07T07:02:00.000Z"), calendarExternalId: "uid-planning-cycle14" },
      all,
    );
    expect(match).toEqual({ occurrenceId: "occ-plan", reason: "calendar" });
  });

  it("matches by alias within the window and picks the nearest start", () => {
    const match = matchOccurrence({ title: "Daily Standup", meetingDate: new Date("2026-09-08T07:05:00.000Z") }, all);
    expect(match).toEqual({ occurrenceId: "occ-tue", reason: "alias", alias: "Daily Standup" });
  });

  it("honours the window: the tick may be up to 30 min before the recording start, or up to duration + 30 min after it", () => {
    const late29 = matchOccurrence({ title: "Standup", meetingDate: new Date("2026-09-07T07:29:00.000Z") }, [standupMon]);
    expect(late29?.occurrenceId).toBe("occ-mon"); // recording started 29 min after the tick
    const late31 = matchOccurrence({ title: "Standup", meetingDate: new Date("2026-09-07T07:31:00.000Z") }, [standupMon]);
    expect(late31).toBeNull(); // 31 min late is outside the 30-min slack
    const early44 = matchOccurrence({ title: "Standup", meetingDate: new Date("2026-09-07T06:16:00.000Z") }, [standupMon]);
    expect(early44?.occurrenceId).toBe("occ-mon"); // 44 min early: within duration (15) + 30
    const early46 = matchOccurrence({ title: "Standup", meetingDate: new Date("2026-09-07T06:14:00.000Z") }, [standupMon]);
    expect(early46).toBeNull();
  });

  it("requires every alias token, case- and punctuation-insensitively", () => {
    expect(matchOccurrence({ title: "CLEAR daily-standup 🚀", meetingDate: new Date("2026-09-07T07:00:00.000Z") }, all)?.occurrenceId).toBe("occ-mon");
    expect(matchOccurrence({ title: "Daily coffee", meetingDate: new Date("2026-09-07T07:00:00.000Z") }, all)).toBeNull();
  });

  it("returns null without a date (alias rule needs the window) or without a title", () => {
    expect(matchOccurrence({ title: "Daily Standup", meetingDate: null }, all)).toBeNull();
    expect(matchOccurrence({ title: null, meetingDate: new Date("2026-09-07T07:00:00.000Z") }, all)).toBeNull();
    expect(matchOccurrence({ title: "Daily Standup", meetingDate: new Date("2026-09-07T07:00:00.000Z") }, [])).toBeNull();
  });
});
