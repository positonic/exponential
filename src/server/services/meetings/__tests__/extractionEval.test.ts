import { describe, expect, it } from "vitest";

import {
  formatEvalReport,
  matchCandidates,
  matchStrength,
  scoreMeeting,
  summariseScores,
  type EvalCandidate,
  type EvalLabel,
  type EvalRun,
} from "../extractionEval";

let nextNumber = 1;
const label = (over: Partial<EvalLabel> & Pick<EvalLabel, "statement">): EvalLabel => ({
  id: `d${nextNumber}`,
  number: nextNumber++,
  kind: "decision",
  verdict: "confirmed",
  source: "MEETING",
  evidenceTurns: [],
  ...over,
});
const candidate = (over: Partial<EvalCandidate> & Pick<EvalCandidate, "statement">): EvalCandidate => ({
  kind: "decision",
  evidenceTurns: [],
  origin: "transcript",
  ...over,
});

describe("matchStrength", () => {
  it("matches a rewording on wording alone", () => {
    expect(
      matchStrength(
        label({ statement: "Prioritisation debates are parked for the prioritisation ceremony" }),
        candidate({ statement: "Park prioritisation debates for the ceremony" }),
      ),
    ).toBeGreaterThan(0);
  });

  it("accepts a looser rewording only when both quote the same part of the transcript", () => {
    const l = label({ statement: "The importer ships on Friday after the security review", evidenceTurns: [40] });
    const loose = "Friday is the release date for the new data pipeline importer tool";
    expect(matchStrength(l, candidate({ statement: loose, evidenceTurns: [41] }))).toBeGreaterThan(0);
    expect(matchStrength(l, candidate({ statement: loose, evidenceTurns: [300] }))).toBe(0);
    expect(matchStrength(l, candidate({ statement: loose }))).toBe(0);
  });

  it("does not match unrelated statements that happen to cite the same turns", () => {
    expect(
      matchStrength(
        label({ statement: "The API stays REST", evidenceTurns: [5] }),
        candidate({ statement: "Launch in Germany first", evidenceTurns: [5] }),
      ),
    ).toBe(0);
  });
});

describe("matchCandidates", () => {
  it("uses each label and each candidate once, strongest pair first", () => {
    const weaker = label({ statement: "The public API stays REST until the partner migration finishes", evidenceTurns: [10] });
    const stronger = label({ statement: "The API stays REST for the mobile clients" });
    const candidates = [candidate({ statement: "The API stays REST for the mobile clients", evidenceTurns: [10] })];

    const matches = matchCandidates([weaker, stronger], candidates);

    expect(matches).toHaveLength(1);
    expect(matches[0]!.label).toBe(stronger);
  });

  it("prefers the candidate of the same kind", () => {
    const l = label({ statement: "Which stakeholders receive the roadmap before each cycle?", kind: "question" });
    const asDecision = candidate({ statement: "Stakeholders receive the roadmap before each cycle", kind: "decision" });
    const asQuestion = candidate({ statement: "Which stakeholders should receive the roadmap each cycle?", kind: "question" });

    const [match] = matchCandidates([l], [asDecision, asQuestion]);

    expect(match!.candidate).toBe(asQuestion);
    expect(match!.sameKind).toBe(true);
  });
});

describe("scoreMeeting", () => {
  it("counts found, repeated, wrong-kind, missed and unjudged apart", () => {
    const found = label({ statement: "Launch in Germany first" });
    const missed = label({ statement: "The API stays REST" });
    const wrongKind = label({ statement: "Which vendor hosts the staging cluster?", kind: "question" });
    const rejected = label({ statement: "Share the onboarding video in the channel", verdict: "rejected" });

    const score = scoreMeeting({
      meetingId: "m1",
      title: "Planning",
      labels: [found, missed, wrongKind, rejected],
      candidates: [
        candidate({ statement: "Launch in Germany first" }),
        candidate({ statement: "The vendor hosts the staging cluster", kind: "decision" }),
        candidate({ statement: "Share the onboarding video in the channel" }),
        candidate({ statement: "Budget review moves to Thursdays" }),
      ],
      sectionsTotal: 4,
      sectionsUnread: 1,
    });

    expect(score).toMatchObject({ confirmed: 3, confirmedFound: 1, wrongKind: 1, rejected: 1, rejectedRepeated: 1, sectionsUnread: 1 });
    expect(score.missed).toEqual([missed]);
    expect(score.unlabelled.map((c) => c.statement)).toEqual(["Budget review moves to Thursdays"]);
  });

  it("counts a rejected item proposed again as the other kind as repeated", () => {
    const score = scoreMeeting({
      meetingId: "m1",
      title: "Standup",
      labels: [label({ statement: "Plan the team retreat for late January", verdict: "rejected" })],
      candidates: [candidate({ statement: "Plan the team retreat for late January?", kind: "question" })],
    });
    expect(score.rejectedRepeated).toBe(1);
  });
});

describe("summariseScores and formatEvalReport", () => {
  const scores = [
    scoreMeeting({
      meetingId: "m1",
      title: "A",
      labels: [label({ statement: "Launch in Germany first" }), label({ statement: "The API stays REST" })],
      candidates: [candidate({ statement: "Launch in Germany first" })],
    }),
    scoreMeeting({
      meetingId: "m2",
      title: "B",
      labels: [label({ statement: "Share the onboarding video", verdict: "rejected" })],
      candidates: [],
      sectionsTotal: 9,
      sectionsUnread: 3,
    }),
  ];

  it("adds the meetings up and leaves a rate empty when there is nothing to divide by", () => {
    expect(summariseScores(scores)).toMatchObject({
      meetings: 2,
      confirmed: 2,
      confirmedFound: 1,
      recall: 0.5,
      rejected: 1,
      rejectedRepeated: 0,
      rejectRepeatRate: 0,
      meetingsPartlyUnread: 1,
    });
    expect(summariseScores([]).recall).toBeNull();
  });

  it("reports the change from a baseline in points", () => {
    const run = (label_: string, recall: number): EvalRun => ({
      label: label_,
      model: "gpt-4o",
      ranAt: "2026-11-16",
      scores: [],
      summary: { ...summariseScores(scores), recall, confirmedFound: Math.round(recall * 2) },
    });

    const report = formatEvalReport(run("candidate", 1), run("main", 0.5));

    expect(report).toContain('Compared with "main"');
    expect(report).toContain("2 of 2, 100% (+50 pts)");
    expect(report).toContain("0 of 1, 0% (no change)");
  });
});
