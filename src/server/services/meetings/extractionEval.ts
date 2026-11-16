/**
 * Scoring for the meeting-output extraction eval (`scripts/eval-extraction.ts`).
 *
 * The labels are what people already did on the Outputs tab: a draft decision
 * or open question someone confirmed is a thing the extractor should find,
 * and one someone rejected is a thing it should not propose. A candidate
 * prompt, model or chunking change is replayed over the same meetings and
 * scored against those labels, so "is this better?" has a number.
 *
 * What the labels cannot say: a candidate that matches no label is neither
 * right nor wrong — nobody has judged it. Those are listed, not scored.
 *
 * Everything here is pure: the script does the database read and the model
 * calls and hands the results in.
 */
import { statementSimilarity } from "~/server/services/DecisionExtractionService";

export type EvalKind = "decision" | "question";

/** A draft somebody reviewed, or a decision somebody added by hand. */
export interface EvalLabel {
  id: string;
  /** The decision's number in its workspace, for reading a report against the app. */
  number: number;
  kind: EvalKind;
  verdict: "confirmed" | "rejected";
  /** `MEETING` for an extractor draft; anything else was written by a person or an agent. */
  source: string;
  statement: string;
  /** Transcript turns the label quotes. Empty for a hand-written decision. */
  evidenceTurns: number[];
}

/** What one run of the extractor proposed for a meeting. */
export interface EvalCandidate {
  kind: EvalKind;
  statement: string;
  evidenceTurns: number[];
  origin: "notes" | "transcript";
}

export interface EvalMatch {
  label: EvalLabel;
  candidate: EvalCandidate;
  similarity: number;
  /** False when the extractor found the item but filed it as the other kind. */
  sameKind: boolean;
}

export interface MeetingScore {
  meetingId: string;
  title: string;
  confirmed: number;
  /** Confirmed labels the run proposed again, as the same kind. */
  confirmedFound: number;
  rejected: number;
  /** Rejected labels the run proposed again, as either kind. */
  rejectedRepeated: number;
  /** Confirmed labels found, but as the other kind. */
  wrongKind: number;
  matches: EvalMatch[];
  missed: EvalLabel[];
  /** Candidates no label covers: unjudged, listed for a person to read. */
  unlabelled: EvalCandidate[];
  /** Transcript sections the run did not read (cap) or lost (failed call). */
  sectionsTotal: number;
  sectionsUnread: number;
}

/**
 * A wording match on its own. The same bar the pipeline's near-duplicate
 * filter uses to call two statements one decision.
 */
export const TEXT_MATCH_THRESHOLD = 0.6;
/**
 * A looser wording match, accepted only when both sides quote the same part
 * of the transcript: the model rewords freely, but the same item cites the
 * same turns.
 */
export const EVIDENCE_TEXT_THRESHOLD = 0.3;
/** How far apart two quoted turns may be and still count as the same place. */
export const EVIDENCE_TURN_WINDOW = 2;

function citesSamePlace(a: number[], b: number[]): boolean {
  return a.some((x) => b.some((y) => Math.abs(x - y) <= EVIDENCE_TURN_WINDOW));
}

/** How strongly a candidate matches a label, or 0 when it does not. */
export function matchStrength(label: EvalLabel, candidate: EvalCandidate): number {
  const similarity = statementSimilarity(label.statement, candidate.statement);
  if (similarity >= TEXT_MATCH_THRESHOLD) return similarity;
  if (similarity >= EVIDENCE_TEXT_THRESHOLD && citesSamePlace(label.evidenceTurns, candidate.evidenceTurns)) {
    return similarity;
  }
  return 0;
}

/**
 * Pair labels with candidates, strongest pairs first, each used once. A pair
 * of the same kind beats an equally strong pair of different kinds.
 */
export function matchCandidates(labels: EvalLabel[], candidates: EvalCandidate[]): EvalMatch[] {
  const pairs: Array<EvalMatch & { labelIndex: number; candidateIndex: number }> = [];
  labels.forEach((label, labelIndex) => {
    candidates.forEach((candidate, candidateIndex) => {
      const similarity = matchStrength(label, candidate);
      if (similarity > 0) {
        pairs.push({ label, candidate, similarity, sameKind: label.kind === candidate.kind, labelIndex, candidateIndex });
      }
    });
  });
  pairs.sort(
    (a, b) =>
      Number(b.sameKind) - Number(a.sameKind) ||
      b.similarity - a.similarity ||
      a.labelIndex - b.labelIndex ||
      a.candidateIndex - b.candidateIndex,
  );
  const usedLabels = new Set<number>();
  const usedCandidates = new Set<number>();
  const matches: EvalMatch[] = [];
  for (const { labelIndex, candidateIndex, ...match } of pairs) {
    if (usedLabels.has(labelIndex) || usedCandidates.has(candidateIndex)) continue;
    usedLabels.add(labelIndex);
    usedCandidates.add(candidateIndex);
    matches.push(match);
  }
  return matches;
}

export function scoreMeeting(input: {
  meetingId: string;
  title: string;
  labels: EvalLabel[];
  candidates: EvalCandidate[];
  sectionsTotal?: number;
  sectionsUnread?: number;
}): MeetingScore {
  const matches = matchCandidates(input.labels, input.candidates);
  const matchedLabels = new Set(matches.map((m) => m.label));
  const matchedCandidates = new Set(matches.map((m) => m.candidate));
  const confirmed = input.labels.filter((l) => l.verdict === "confirmed");
  const rejected = input.labels.filter((l) => l.verdict === "rejected");
  const confirmedMatches = matches.filter((m) => m.label.verdict === "confirmed");
  return {
    meetingId: input.meetingId,
    title: input.title,
    confirmed: confirmed.length,
    confirmedFound: confirmedMatches.filter((m) => m.sameKind).length,
    rejected: rejected.length,
    rejectedRepeated: matches.filter((m) => m.label.verdict === "rejected").length,
    wrongKind: confirmedMatches.filter((m) => !m.sameKind).length,
    matches,
    missed: confirmed.filter((l) => !matchedLabels.has(l)),
    unlabelled: input.candidates.filter((c) => !matchedCandidates.has(c)),
    sectionsTotal: input.sectionsTotal ?? 0,
    sectionsUnread: input.sectionsUnread ?? 0,
  };
}

export interface EvalSummary {
  meetings: number;
  confirmed: number;
  confirmedFound: number;
  /** Share of confirmed labels found again as the same kind. Higher is better. */
  recall: number | null;
  rejected: number;
  rejectedRepeated: number;
  /** Share of rejected labels proposed again. Lower is better. */
  rejectRepeatRate: number | null;
  wrongKind: number;
  candidates: number;
  unlabelled: number;
  meetingsPartlyUnread: number;
}

const rate = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole);

export function summariseScores(scores: MeetingScore[]): EvalSummary {
  const sum = (pick: (score: MeetingScore) => number) => scores.reduce((total, score) => total + pick(score), 0);
  const confirmed = sum((s) => s.confirmed);
  const confirmedFound = sum((s) => s.confirmedFound);
  const rejected = sum((s) => s.rejected);
  const rejectedRepeated = sum((s) => s.rejectedRepeated);
  return {
    meetings: scores.length,
    confirmed,
    confirmedFound,
    recall: rate(confirmedFound, confirmed),
    rejected,
    rejectedRepeated,
    rejectRepeatRate: rate(rejectedRepeated, rejected),
    wrongKind: sum((s) => s.wrongKind),
    candidates: sum((s) => s.matches.length + s.unlabelled.length),
    unlabelled: sum((s) => s.unlabelled.length),
    meetingsPartlyUnread: scores.filter((s) => s.sectionsUnread > 0).length,
  };
}

/** A saved run: what `--save` writes and `--baseline` reads. */
export interface EvalRun {
  label: string;
  model: string;
  ranAt: string;
  summary: EvalSummary;
  scores: MeetingScore[];
}

const percent = (value: number | null): string => (value === null ? "n/a" : `${Math.round(value * 100)}%`);

function delta(current: number | null, baseline: number | null, unit: "pp" | ""): string {
  if (current === null || baseline === null) return "";
  const diff = unit === "pp" ? Math.round((current - baseline) * 100) : current - baseline;
  if (diff === 0) return " (no change)";
  return ` (${diff > 0 ? "+" : ""}${diff}${unit === "pp" ? " pts" : ""})`;
}

/** The PR-pasteable block: this run's numbers, and the change from a baseline when given. */
export function formatEvalReport(run: EvalRun, baseline?: EvalRun): string {
  const s = run.summary;
  const b = baseline?.summary;
  const lines = [
    `### Extraction eval: ${run.label}`,
    "",
    `Model \`${run.model}\`, ${s.meetings} meeting(s), run ${run.ranAt}.${baseline ? ` Compared with "${baseline.label}".` : ""}`,
    "",
    "| Measure | Result |",
    "| --- | --- |",
    `| Confirmed items found again (higher is better) | ${s.confirmedFound} of ${s.confirmed}, ${percent(s.recall)}${delta(s.recall, b?.recall ?? null, "pp")} |`,
    `| Rejected items proposed again (lower is better) | ${s.rejectedRepeated} of ${s.rejected}, ${percent(s.rejectRepeatRate)}${delta(s.rejectRepeatRate, b?.rejectRepeatRate ?? null, "pp")} |`,
    `| Confirmed items found as the wrong kind | ${s.wrongKind}${delta(s.wrongKind, b?.wrongKind ?? null, "")} |`,
    `| Candidates nobody has judged | ${s.unlabelled} of ${s.candidates}${delta(s.unlabelled, b?.unlabelled ?? null, "")} |`,
    `| Meetings with part of the transcript unread | ${s.meetingsPartlyUnread}${delta(s.meetingsPartlyUnread, b?.meetingsPartlyUnread ?? null, "")} |`,
  ];
  return lines.join("\n");
}

/** Per-meeting detail for a person reading the run: what was missed, repeated and unjudged. */
export function formatMeetingDetail(score: MeetingScore): string {
  const lines = [
    `#### ${score.title} (${score.meetingId})`,
    `Found ${score.confirmedFound} of ${score.confirmed} confirmed; repeated ${score.rejectedRepeated} of ${score.rejected} rejected; ${score.unlabelled.length} unjudged.` +
      (score.sectionsUnread > 0 ? ` ${score.sectionsUnread} of ${score.sectionsTotal} transcript section(s) unread.` : ""),
  ];
  const repeated = score.matches.filter((m) => m.label.verdict === "rejected");
  if (repeated.length > 0) {
    lines.push("", "Rejected, proposed again:");
    for (const m of repeated) lines.push(`- D-${m.label.number} "${m.label.statement}" → "${m.candidate.statement}"`);
  }
  if (score.missed.length > 0) {
    lines.push("", "Confirmed, not found:");
    for (const label of score.missed) lines.push(`- D-${label.number} [${label.kind}] "${label.statement}"`);
  }
  const wrongKind = score.matches.filter((m) => m.label.verdict === "confirmed" && !m.sameKind);
  if (wrongKind.length > 0) {
    lines.push("", "Confirmed, found as the wrong kind:");
    for (const m of wrongKind) lines.push(`- D-${m.label.number} is a ${m.label.kind}, proposed as a ${m.candidate.kind}: "${m.candidate.statement}"`);
  }
  if (score.unlabelled.length > 0) {
    lines.push("", "Not judged by anyone:");
    for (const c of score.unlabelled) lines.push(`- [${c.kind}, ${c.origin}] "${c.statement}"`);
  }
  return lines.join("\n");
}
